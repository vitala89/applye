import { Injectable, inject, signal } from '@angular/core';
import type { CvTemplate, DocumentLibraryItem, Job, SupportedLanguage } from '@applye/core';
import { archetypeNames, parseArchetypes } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import type { CvGenerateCodec } from './cv-codec';

/**
 * What one generation attempt did. Each is a different fact, and none of them
 * is a sentence here.
 *
 * - `busy` - a generation is already running; a refusal.
 * - `no-profile` - nothing to write a CV from. A refusal, not an error: the
 *   user has simply not filled the profile yet.
 * - `bad-json` - the model answered with something that is not the shape asked
 *   for. Kept apart from `failed` because "the model lied" and "the database
 *   refused" are different problems for a caller, even where the page happens
 *   to say the same thing about them.
 * - `generated` - the document exists; `createdId` says which.
 * - `failed` - `error` carries what went wrong.
 */
export type CvGenerateOutcome = 'busy' | 'no-profile' | 'bad-json' | 'generated' | 'failed';

/** What the page must name, because naming needs translations. */
export interface CvGenerateLabels {
  /** The label for the new document, already composed. */
  documentLabel: string;
}

const SKILL = 'cv-generate-baseline';
const SECTION_ALL = 'all';
const DEFAULT_ARCHETYPE = 'generalist';
const DEFAULT_REGION_TAG = 'de';

/**
 * The "generate a baseline CV" modal: what it is generating from, and what
 * happened.
 *
 * **It owns the job link.** When the user picked a tracked job, the generated
 * document is attached to that job's application in the same call - a caller
 * that had to remember a second step would eventually forget it, and an
 * unlinked CV looks identical to a linked one until someone goes looking.
 *
 * **It never throws**, in line with the convention this campaign settled
 * (ADR-0005, amendment thirty-nine). The missing-profile case used to be a
 * `throw new Error(translatedText)` inside the page; it is an outcome now, and
 * the page still owns the sentence.
 */
@Injectable()
export class CvGenerateStore {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly regionTag = signal(DEFAULT_REGION_TAG);
  readonly archetypeTag = signal('');
  readonly language = signal<SupportedLanguage>('en');
  readonly templateId = signal<number | null>(null);
  readonly selectedJobId = signal<number | null>(null);

  /** Set by a successful generation, for the page to navigate to. */
  readonly createdId = signal<number | null>(null);

  /**
   * Opens on a clean slate and adopts the profile's first target archetype and
   * the configured document language.
   *
   * Returns `false` when those defaults could not be read: the modal is open
   * either way, because refusing to open it would be a worse answer than
   * opening it on the fallback values, but `error` carries what went wrong so
   * the page can say so.
   */
  async start(templates: readonly CvTemplate[]): Promise<boolean> {
    this.error.set('');
    this.selectedJobId.set(null);
    this.createdId.set(null);
    this.open.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.archetypeTag.set(archetypeNames(parseArchetypes(profile?.targetArchetypes))[0] ?? '');
      this.language.set(settings.defaultDocLanguage ?? 'en');
      this.templateId.set(this.defaultTemplate(templates)?.id ?? null);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }

  cancel(): void {
    this.open.set(false);
  }

  /** The tracked job this CV is being written for, for the page to name the
   * document after. `null` when the user is generating a general CV. */
  selectedJob(jobs: readonly Job[]): Job | null {
    const id = this.selectedJobId();
    if (!id) return null;
    return jobs.find((j) => j.id === id) ?? null;
  }

  /** Never rejects; returns which of the five things happened. */
  async generate(
    jobs: readonly Job[],
    templates: readonly CvTemplate[],
    labels: CvGenerateLabels,
    codec: CvGenerateCodec,
  ): Promise<CvGenerateOutcome> {
    this.error.set('');
    if (this.busy()) return 'busy';
    this.busy.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) return 'no-profile';

      const job = this.selectedJob(jobs);
      const scoringJson = job
        ? JSON.stringify({
            targetJobTitle: job.title,
            targetCompany: job.company,
            jobDescription: job.jdText,
            originalScoring: this.readScoring(profile.scoringJson, codec),
          })
        : (profile.scoringJson ?? '{}');

      const rendered = await this.ai.renderSkill(SKILL, {
        profile_md: profile.fullMd,
        scoring_json: scoringJson,
        region_tag: this.regionTag(),
        archetype_tag: this.archetypeTag() || DEFAULT_ARCHETYPE,
        language: this.language(),
        section: SECTION_ALL,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.language(),
        maxTokens: 8192,
      });

      const template = templates.find((tpl) => tpl.id === this.templateId()) ?? null;
      let contentJson: string;
      try {
        contentJson = JSON.stringify(codec.buildContent(codec.parse(res.text), template));
      } catch (e) {
        this.error.set(String(e));
        return 'bad-json';
      }

      const created: DocumentLibraryItem = await this.db.documentLibraryUpsert({
        docType: 'cv',
        source: 'generated',
        label: labels.documentLabel,
        contentJson,
        templateId: template?.id,
        regionTag: this.regionTag(),
        language: this.language(),
        archetypeTag: this.archetypeTag() || undefined,
        modelUsed: settings.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });

      if (job) await this.linkToApplication(job.id, created.id);

      this.createdId.set(created.id);
      this.open.set(false);
      return 'generated';
    } catch (e) {
      this.error.set(String(e));
      return 'failed';
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * The profile's own scoring, as an object to nest inside the job context.
   * A profile that never scored, or scored into something unparseable, is not
   * a reason to refuse a CV - the skill is handed an empty object and writes
   * from the profile text alone.
   */
  private readScoring(scoringJson: string | undefined, codec: CvGenerateCodec): unknown {
    try {
      return JSON.parse(codec.cleanScoring(scoringJson ?? '{}'));
    } catch {
      return {};
    }
  }

  /** Attaches the new document to the application already tracking this job.
   * A job with no application row yet is left alone: there is nothing to
   * attach it to, and inventing one here would be a second feature. */
  private async linkToApplication(jobId: number, documentId: number): Promise<void> {
    const apps = await this.db.listApplications();
    const app = apps.find((a) => a.jobId === jobId);
    if (app) await this.db.upsertApplication({ ...app, cvDocumentId: documentId });
  }

  /** The template matching the chosen region, or the first one there is. */
  private defaultTemplate(templates: readonly CvTemplate[]): CvTemplate | null {
    return templates.find((tpl) => tpl.regionTag === this.regionTag()) ?? templates[0] ?? null;
  }
}

import { Injectable, inject, signal } from '@angular/core';
import type { CoverLetterContent, DocumentLibraryItem, Job, SupportedLanguage } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import {
  COVER_LETTER_GENERIC_JD,
  COVER_LETTER_SECTION_ALL,
  COVER_LETTER_SKILL,
} from './cover-letter-generation';
import type { CoverLetterCodec } from './cover-letter-ai.store';

/**
 * What one generation attempt did. Each is a different sentence on screen, and
 * none of them is a sentence here.
 *
 * - `busy` - a generation is already running; a refusal.
 * - `no-profile` - nothing to write from. A refusal, not an error: the user has
 *   simply not filled the profile yet.
 * - `bad-json` - the model answered with something that is not the shape asked
 *   for. `error` carries a truncated excerpt.
 * - `generated` - the document exists; `createdId` says which.
 * - `failed` - `error` carries what went wrong.
 */
export type GenerateOutcome = 'busy' | 'no-profile' | 'bad-json' | 'generated' | 'failed';

/** What the page must name, because naming needs translations. */
export interface GenerateLabels {
  /** The label for the new document, already composed. */
  documentLabel: string;
}

/**
 * The "generate a cover letter" modal: what it is generating from, and what
 * happened.
 *
 * **It never throws**, unlike its older neighbour `CoverLetterAiStore`, which
 * raises `CoverLetterNoProfileError`. The newer convention across this campaign
 * is that a store answers rather than raises, and a missing profile is a
 * refusal rather than a failure - the user has not done something yet, which is
 * not an error to be caught (ADR-0005, amendment thirty-nine).
 *
 * `cleanJsonText` lives in `apps/desktop`, which this layer may not import, so
 * the codec is passed in - the same device `CoverLetterAiStore` uses, for the
 * same reason (amendment six).
 */
@Injectable()
export class CoverLetterGenerateStore {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly regionTag = signal('de');
  readonly language = signal<SupportedLanguage>('en');
  readonly selectedJobId = signal<number | null>(null);
  readonly customJdText = signal('');

  /** Set by a successful generation, for the page to navigate to. */
  readonly createdId = signal<number | null>(null);

  /**
   * Opens on a clean slate and adopts the configured document language.
   *
   * A failed settings read is deliberately silent: it only means the language
   * stays at its default, and refusing to open the modal over that would be a
   * worse answer than opening it in English.
   */
  async start(): Promise<void> {
    this.error.set('');
    this.selectedJobId.set(null);
    this.customJdText.set('');
    this.createdId.set(null);
    this.open.set(true);
    try {
      const settings = await this.db.getSettings();
      this.language.set(settings.defaultDocLanguage ?? 'en');
    } catch {
      // Keep the fallback language.
    }
  }

  cancel(): void {
    this.open.set(false);
  }

  /**
   * The company of the selected job, for the page to build the document label
   * from. Empty when the user pasted a description instead of picking a job.
   */
  selectedCompany(jobs: Job[]): string {
    const id = this.selectedJobId();
    if (!id) return '';
    return jobs.find((j) => j.id === id)?.company ?? '';
  }

  /** Never rejects; returns which of the five things happened. */
  async generate(
    jobs: Job[],
    labels: GenerateLabels,
    codec: CoverLetterCodec,
  ): Promise<GenerateOutcome> {
    if (this.busy()) return 'busy';
    this.busy.set(true);
    this.error.set('');
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) return 'no-profile';

      const rendered = await this.ai.renderSkill(COVER_LETTER_SKILL, {
        profile_md: profile.fullMd,
        job_description: this.jobDescription(jobs),
        language: this.language(),
        section: COVER_LETTER_SECTION_ALL,
      });

      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.language(),
      });

      let content: Partial<CoverLetterContent>;
      try {
        content = codec.parse(res.text);
      } catch {
        // A truncated excerpt, because the whole answer can be thousands of
        // tokens and a failure with no sample of it is unactionable.
        this.error.set(res.text.slice(0, 100));
        return 'bad-json';
      }

      const created: DocumentLibraryItem = await this.db.documentLibraryUpsert({
        docType: 'cover_letter',
        source: 'generated',
        label: labels.documentLabel,
        contentJson: JSON.stringify(content),
        regionTag: this.regionTag(),
        language: this.language(),
        modelUsed: settings.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });

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
   * The posting the letter is written against: the picked job's description,
   * or what the user pasted, or the stable placeholder the skill expects when
   * there is neither.
   */
  private jobDescription(jobs: Job[]): string {
    const id = this.selectedJobId();
    if (id) {
      const job = jobs.find((j) => j.id === id);
      if (job) return job.jdText || COVER_LETTER_GENERIC_JD;
    }
    return this.customJdText().trim() || COVER_LETTER_GENERIC_JD;
  }
}

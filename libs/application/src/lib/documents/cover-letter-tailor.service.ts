import { Injectable, inject, signal } from '@angular/core';
import {
  Application,
  BaseLetter,
  DocumentLibraryItem,
  Job,
  Profile,
  Settings,
  SupportedLanguage,
  buildTailoredContent,
  readBaseLetter,
} from '@applye/core';
import { AiService, DocumentsGateway, JobsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../shell/toast.service';
import { parseCoverLetterFromResponse } from './cover-letter-response';

/** Everything the tailored copy is built from. The page still owns the library
 * list, because the choose-existing dropdown reads the same letters. */
export interface CoverLetterTailorContext {
  /** Null is not a caller error: the modal can be open with no job loaded, and
   * the message the user sees for that case is fixed here. */
  job: Job | null;
  profile: Profile | null;
  settings: Settings | null;
  letters: DocumentLibraryItem[];
  application: Application | null;
  /** Library label for the created row, e.g. "Acme - Senior Frontend Engineer
   * - Tailored Cover Letter". Takes the job because it is only known once the
   * job has been proven non-null. */
  label: (job: Job) => string;
}

export interface CoverLetterTailorResult {
  document: DocumentLibraryItem;
  /** The application row after linking, or null when the job has no draft
   * application yet - tailoring does not create one. */
  application: Application | null;
}

/**
 * The "tailor an existing cover letter for this job" modal: its state, the
 * choice of base letter, and the AI pass that produces the copy.
 *
 * Distinct from `CoverLetterDraftService`, which writes the one letter an
 * application owns. This one always creates a new library row and links it,
 * and is component-scoped through the page's `providers` so its modal state
 * dies with the page, as it did when these signals lived on the component.
 */
@Injectable()
export class CoverLetterTailorService {
  private readonly db = inject(JobsGateway);
  private readonly docs = inject(DocumentsGateway);
  private readonly ai = inject(AiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslateService);

  readonly modalOpen = signal(false);
  readonly selectedId = signal<number | null>(null);
  readonly language = signal<SupportedLanguage>('en');
  readonly running = signal(false);
  readonly error = signal('');

  /**
   * Opens the modal and picks the default base letter. Returns the freshly
   * listed letters for the page to store, or null when the list could not be
   * read - non-fatal, and the page keeps whatever it already had.
   */
  async prepare(settings: Settings | null): Promise<DocumentLibraryItem[] | null> {
    this.error.set('');
    this.selectedId.set(null);
    this.running.set(false);
    this.modalOpen.set(true);

    try {
      const letters = await this.docs.documentLibraryList('cover_letter');
      this.language.set(settings?.defaultDocLanguage ?? 'en');
      const lang = this.language();
      const defaultDoc =
        letters.find((c) => c.isDefault && c.language === lang) ??
        letters.find((c) => c.language === lang) ??
        letters[0] ??
        null;
      if (defaultDoc) this.selectedId.set(defaultDoc.id);
      return letters;
    } catch {
      // Non-fatal: the modal still opens, with whatever the page listed before.
      return null;
    }
  }

  close(): void {
    this.modalOpen.set(false);
  }

  /**
   * Runs the tailoring pass and persists the copy. Returns null when a run is
   * already in flight or the run failed - failure is reported through `error`
   * and a toast, never thrown at the page.
   */
  async run(ctx: CoverLetterTailorContext): Promise<CoverLetterTailorResult | null> {
    if (this.running()) return null;
    this.running.set(true);
    this.error.set('');

    try {
      const { job, profile, settings } = ctx;
      if (!job || !job.id) throw new Error('No active job selected.');
      if (!profile?.fullMd) throw new Error(this.i18n.t()('documents.cv_generate_no_profile'));

      const lang = this.language();
      const jdText = job.jdText ?? '';
      const base = readBaseLetter(ctx.letters.find((c) => c.id === this.selectedId()));

      const pass = await this.generate(base, profile.fullMd, jdText, lang, settings);
      const today = new Date().toISOString().split('T')[0];
      const content = buildTailoredContent(
        { ...base, ...pass.addressing },
        pass.paragraphs,
        jdText,
        today,
      );

      const document = await this.docs.documentLibraryUpsert({
        docType: 'cover_letter',
        source: 'generated',
        label: ctx.label(job),
        contentJson: JSON.stringify(content),
        regionTag: base.regionTag,
        language: lang,
        modelUsed: settings?.defaultModel ?? 'quality',
        tokensInput: pass.tokensInput,
        tokensOutput: pass.tokensOutput,
      });

      let application = ctx.application;
      if (application?.id) {
        application = await this.db.upsertApplication({
          ...application,
          coverLetterDocumentId: document.id,
        });
      }

      this.modalOpen.set(false);
      return { document, application };
    } catch (e) {
      this.error.set(String(e));
      this.toast.error(String(e));
      return null;
    } finally {
      this.running.set(false);
    }
  }

  /**
   * One AI pass. With a base letter it rewrites the body only, and `addressing`
   * comes back empty because the base's addressing must survive. Without one
   * there is nothing to rewrite, so it generates a whole letter and `addressing`
   * carries the fields the caller folds over the base.
   */
  private async generate(
    base: BaseLetter,
    profileMd: string,
    jdText: string,
    lang: SupportedLanguage,
    settings: Settings | null,
  ): Promise<{
    paragraphs: string[];
    addressing: Partial<BaseLetter>;
    tokensInput: number;
    tokensOutput: number;
  }> {
    const hasBase = base.paragraphs.length > 0;
    const rendered = hasBase
      ? await this.ai.renderSkill('cover-letter-tailor', {
          profile_md: profileMd,
          job_description: jdText,
          body_paragraphs: JSON.stringify(base.paragraphs),
          language: lang,
          tone: base.tone,
          length: base.length,
        })
      : await this.ai.renderSkill('cover-letter-generate', {
          profile_md: profileMd,
          job_description: jdText,
          language: lang,
          section: 'all',
          tone: base.tone,
          length: base.length,
          earliest_start: base.earliestStart,
          salary_expectation: base.salaryExpectation,
          notice_period: base.noticePeriod,
        });

    const res = await this.ai.run({
      mode: settings?.aiMode ?? 'api',
      provider: settings?.provider ?? 'openai',
      model: settings?.defaultModel ?? 'quality',
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: lang,
    });

    const parsed = parseCoverLetterFromResponse(res);
    // A generated letter brings its own addressing; the tailoring pass returns
    // body paragraphs alone and leaves the base's addressing intact.
    const addressing: Partial<BaseLetter> = hasBase
      ? {}
      : {
          address: parsed.address || {},
          subject: parsed.subject || '',
          greeting: parsed.greeting || '',
          closing: parsed.closing || '',
          signature: parsed.signature || '',
        };
    return {
      paragraphs: parsed.bodyParagraphs || [],
      addressing,
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
    };
  }
}

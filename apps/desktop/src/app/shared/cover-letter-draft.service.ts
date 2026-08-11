import { Injectable, inject } from '@angular/core';
import {
  Application,
  COVER_LETTER_LENGTH_DEFAULT,
  COVER_LETTER_TONE_DEFAULT,
  CoverLetterContent,
  DocumentLibraryItem,
  Job,
  Profile,
  Settings,
  SupportedLanguage,
} from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { cleanJsonText } from '../pages/documents/cv-content.util';
import { CvGapDialogService } from './cv-gap-dialog.service';
import { DocumentGenService } from './document-gen.service';
import { DocumentRegionTag } from '@applye/application';
import { GapFillHooks, foldInGapAnswers } from './gap-fill';

/** Everything the cover letter is built from, plus the hand-offs the page still
 * owns because the CV flow shares them. */
export interface CoverLetterDraftContext extends GapFillHooks {
  job: Job;
  profile: Profile;
  settings: Settings;
  language: SupportedLanguage;
  region: DocumentRegionTag;
  /** Library label, e.g. "Acme - Senior Frontend Engineer - Cover Letter". */
  label: string;
  /**
   * Skip the gap pass entirely. The CV flow runs the same analysis and may
   * already have saved the answers, so asking again would raise a second dialog
   * for the same questions - see `skipGapFill` at the call site.
   */
  skipGapFill: boolean;
  ensureApplication: () => Promise<Application>;
}

/**
 * The exact input a cover letter's `inputHash` is computed from. Exported for
 * the same reason as `cvDraftHashInput`: the staleness check must ask the same
 * question the draft answered.
 */
export function coverLetterHashInput(
  jobId: number,
  profileMd: string,
  jdText: string,
  language: string,
  region: string,
): string {
  return [jobId, profileMd, jdText, language, region].join('\x00');
}

export interface CoverLetterDraftResult {
  document: DocumentLibraryItem;
  application: Application;
}

/**
 * Generating the tailored cover letter: the shared gap-fill pass, the
 * `cover-letter-generate` AI skill, and the draft row it lands in.
 *
 * Mirrors `CvDraftService`, down to reusing the same gap-fill helper, and is
 * component-scoped via the page's `providers` for the same reason: it drives
 * `CvGapDialogService`, which is scoped to one page component.
 */
@Injectable()
export class CoverLetterDraftService {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly docGen = inject(DocumentGenService);
  private readonly gapSvc = inject(CvGapDialogService);

  /** Returns null when a run for this job is already in flight - the
   * double-tap guard - and throws whatever the AI or the database throws. */
  async create(ctx: CoverLetterDraftContext): Promise<CoverLetterDraftResult | null> {
    const jobId = ctx.job.id as number;
    if (this.docGen.isPreparing(jobId, 'cover_letter')) return null;
    this.docGen.begin(jobId, 'cover_letter');
    try {
      const app = await ctx.ensureApplication();
      const profileText = ctx.skipGapFill
        ? ctx.profile.fullMd
        : await foldInGapAnswers(ctx.profile.fullMd, ctx, this.gapSvc.analyzing);
      return await this.generate(ctx, app, profileText);
    } finally {
      this.docGen.end(jobId, 'cover_letter');
    }
  }

  private async generate(
    ctx: CoverLetterDraftContext,
    app: Application,
    profileText: string,
  ): Promise<CoverLetterDraftResult> {
    const jdText = ctx.job.jdText ?? '';
    const rendered = await this.ai.renderSkill('cover-letter-generate', {
      profile_md: profileText,
      job_description: jdText,
      language: ctx.language,
      section: 'all',
      tone: COVER_LETTER_TONE_DEFAULT,
      length: COVER_LETTER_LENGTH_DEFAULT,
      // A first letter has no answers yet; the editor's Availability card is
      // where they get filled in, and an empty value must stay silent rather
      // than become "salary negotiable".
      earliest_start: '',
      salary_expectation: '',
      notice_period: '',
    });
    const res = await this.ai.run({
      mode: ctx.settings.aiMode,
      provider: ctx.settings.provider,
      model: ctx.settings.defaultModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: ctx.language,
    });
    const parsed = JSON.parse(cleanJsonText(res.text)) as CoverLetterContent;
    const content: CoverLetterContent = {
      ...parsed,
      bodyParagraphs: parsed.bodyParagraphs ?? [],
      jobDescription: jdText,
      tone: parsed.tone ?? COVER_LETTER_TONE_DEFAULT,
      length: parsed.length ?? COVER_LETTER_LENGTH_DEFAULT,
    };
    // Keyed on the profile as saved, not on the gap-augmented text, so
    // answering the dialog does not make an otherwise identical run look like a
    // different input - the same rule the CV draft follows.
    const inputHash = await this.db.hashText(
      coverLetterHashInput(
        ctx.job.id as number,
        ctx.profile.fullMd,
        jdText,
        ctx.language,
        ctx.region,
      ),
    );
    const document = await this.db.documentLibraryUpsert({
      // One cover letter per application (ADR-0003): reuse the linked row so
      // retailor/regenerate update in place instead of stacking duplicate
      // "<Company> - Cover Letter" entries.
      id: app.coverLetterDocumentId ?? undefined,
      docType: 'cover_letter',
      source: 'generated',
      label: ctx.label,
      language: ctx.language,
      regionTag: ctx.region,
      contentJson: JSON.stringify(content),
      inputHash,
      modelUsed: ctx.settings.defaultModel,
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
      // Draft until Export & Apply (see CvDraftService).
      isApplicationDraft: true,
    });
    const application = await this.db.upsertApplication({
      ...app,
      coverLetterDocumentId: document.id,
      docLanguage: ctx.language,
    });
    return { document, application };
  }
}

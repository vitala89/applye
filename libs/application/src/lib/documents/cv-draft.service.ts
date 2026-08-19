import { Injectable, inject } from '@angular/core';
import {
  Application,
  DocumentLibraryItem,
  Job,
  Settings,
  SupportedLanguage,
  buildAdditionalInfoBlock,
  buildCvContent,
  parseCvSkillResponse,
  parseDateAnswer,
  type CvGapAnswer,
  type CvGapQuestion,
} from '@applye/core';

import { GapFillHooks, foldInGapAnswers, saveBlockBestEffort } from './gap-fill';
import { AiService, DbService, SystemGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { CvGapDialogService } from './cv-gap-dialog.service';
import { DocumentGenService } from './document-gen.service';
import { DocumentRegionTag } from '../jobs/job-document-defaults';

type ParsedCv = ReturnType<typeof parseCvSkillResponse>;

/** Everything the CV draft is built from, plus the four hand-offs the page
 * still owns because the cover-letter flow shares them. */
export interface CvDraftContext extends GapFillHooks {
  job: Job;
  settings: Settings;
  tailoredMd: string;
  language: SupportedLanguage;
  region: DocumentRegionTag;
  /** Library label, e.g. "Acme - Senior Frontend Engineer - Tailored CV". */
  label: string;
  ensureApplication: () => Promise<Application>;
}

/**
 * The exact input a CV draft's `inputHash` is computed from. Exported because
 * the staleness check has to ask the same question the draft answered - a
 * second copy of this formula is how a regenerate silently stops firing.
 */
export function cvDraftHashInput(
  jobId: number,
  tailoredMd: string,
  language: string,
  region: string,
): string {
  return [jobId, tailoredMd, language, region].join('\x00');
}

export interface CvDraftResult {
  document: DocumentLibraryItem;
  application: Application;
}

/**
 * Questions for the entries the AI could not date. Asked *after* structuring
 * and *before* saving, so a CV never ships rendering "Present" against no start
 * date. The ids carry the list and the index - `expdate:<i>` / `edudate:<i>` -
 * which is how `applyDateAnswers` routes each answer back to its own entry.
 */
export function dateGapQuestions(parsed: ParsedCv, t: (key: string) => string): CvGapQuestion[] {
  const undatedExp = parsed.experience
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.startDate?.trim());
  const undatedEdu = parsed.education
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.startDate?.trim());
  return [
    ...undatedExp.map(({ e, i }) => ({
      id: `expdate:${i}`,
      category: 'experience' as const,
      question: t('jobs.gap.date_question')
        .replace('{company}', e.company || '')
        .replace('{role}', e.role || ''),
      hint: t('jobs.gap.date_hint'),
    })),
    ...undatedEdu.map(({ e, i }) => ({
      id: `edudate:${i}`,
      category: 'other' as const,
      question: t('jobs.gap.edu_date_question')
        .replace('{degree}', e.degree || '')
        .replace('{institution}', e.institution || ''),
      hint: t('jobs.gap.edu_date_hint'),
    })),
  ];
}

/**
 * Fold answered dates back into the parsed CV, in place. A blank answer is a
 * skip and an id pointing at no entry is ignored. Text the parser cannot read
 * is carried through verbatim rather than guessed at: a fabricated employment
 * date is worse than an odd-looking one the user typed themselves.
 */
export function applyDateAnswers(parsed: ParsedCv, answers: CvGapAnswer[]): void {
  for (const ans of answers) {
    const [kind, idxStr] = ans.id.split(':');
    if (!ans.answer.trim()) continue;
    const list = kind === 'edudate' ? parsed.education : parsed.experience;
    const entry = list[Number(idxStr)];
    if (!entry) continue;
    const { startDate, endDate } = parseDateAnswer(ans.answer);
    if (startDate) entry.startDate = startDate;
    if (endDate) entry.endDate = endDate;
  }
}

/**
 * Generating the tailored CV: gap-fill, structuring through the `cv-import` AI
 * skill, the date block-before-generate, and the draft row it all lands in.
 *
 * Component-scoped via the page's `providers`, alongside `CvGapDialogService`,
 * whose dialog this drives.
 */
@Injectable()
export class CvDraftService {
  private readonly db = inject(DbService);
  private readonly system = inject(SystemGateway);
  private readonly ai = inject(AiService);
  private readonly docGen = inject(DocumentGenService);
  private readonly gapSvc = inject(CvGapDialogService);
  private readonly i18n = inject(TranslateService);
  private readonly t = this.i18n.t;

  /**
   * Returns null when a run for this job is already in flight - the double-tap
   * guard - and throws whatever the AI or the database throws, which the caller
   * turns into the review status line.
   */
  async create(ctx: CvDraftContext): Promise<CvDraftResult | null> {
    const jobId = ctx.job.id as number;
    if (this.docGen.isPreparing(jobId, 'cv')) return null;
    this.docGen.begin(jobId, 'cv');
    try {
      const app = await ctx.ensureApplication();
      const cvSourceText = await foldInGapAnswers(ctx.tailoredMd, ctx, this.gapSvc.analyzing);
      const inputHash = await this.system.hashText(
        cvDraftHashInput(jobId, ctx.tailoredMd, ctx.language, ctx.region),
      );
      const parsed = await this.structure(ctx, cvSourceText);
      await this.fillMissingDates(ctx, parsed);
      return await this.persist(ctx, app, parsed, inputHash);
    } finally {
      this.docGen.end(jobId, 'cv');
    }
  }

  /** Structure the tailored markdown into real CV sections through the same
   * `cv-import` path used by Documents import and onboarding, instead of
   * dumping the whole blob into the summary section. */
  private async structure(ctx: CvDraftContext, cvSourceText: string): Promise<ParsedCv> {
    const rendered = await this.ai.renderSkill('cv-import', {
      cv_text: cvSourceText,
      language: ctx.language,
    });
    const res = await this.ai.run({
      mode: ctx.settings.aiMode,
      provider: ctx.settings.provider,
      model: ctx.settings.economyModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: ctx.language,
      maxTokens: 8192,
    });
    return parseCvSkillResponse(res.text);
  }

  /** Block-before-generate: rather than ship a CV that renders "Present" with
   * no start date, ask. Reuses the gap dialog, and is skippable per entry. */
  private async fillMissingDates(ctx: CvDraftContext, parsed: ParsedCv): Promise<void> {
    const questions = dateGapQuestions(parsed, (key) => this.t()(key));
    if (!questions.length) return;
    const result = await ctx.askGaps(questions);
    if (!result) return;
    applyDateAnswers(parsed, result.answers);
    if (result.saveToProfile) {
      await saveBlockBestEffort(ctx, buildAdditionalInfoBlock(result.answers));
    }
  }

  private async persist(
    ctx: CvDraftContext,
    app: Application,
    parsed: ParsedCv,
    inputHash: string,
  ): Promise<CvDraftResult> {
    const document = await this.db.documentLibraryUpsert({
      // One CV per application (ADR-0003): reuse the already-linked document
      // whenever there is one, so a first tailor and every later
      // retailor/regenerate update the same row instead of creating duplicate
      // "<Company> - Tailored CV" entries. Only a job with no linked CV yet
      // mints a new row.
      id: app.cvDocumentId ?? undefined,
      docType: 'cv',
      source: 'generated',
      label: ctx.label,
      language: ctx.language,
      regionTag: ctx.region,
      contentJson: JSON.stringify(buildCvContent(parsed, null)),
      inputHash,
      // Draft until Export & Apply: hidden from the Documents library list
      // until the user commits it (export / mark applied). Review, inline edit
      // and export all still reach it by id.
      isApplicationDraft: true,
    });
    const application = await this.db.upsertApplication({
      ...app,
      cvDocumentId: document.id,
      docLanguage: ctx.language,
    });
    return { document, application };
  }
}

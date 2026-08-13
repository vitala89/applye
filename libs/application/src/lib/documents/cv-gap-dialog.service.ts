import { Injectable, computed, inject, signal } from '@angular/core';
import { AiService } from '@applye/data';
import {
  Job,
  Settings,
  SupportedLanguage,
  parseCvGapResponse,
  type CvGapAnswer,
  type CvGapQuestion,
} from '@applye/core';

import { ToastService } from '../shell/toast.service';
import { TranslateService } from '@applye/i18n';
import type { GapAnalysis } from './gap-fill';

export interface CvGapResult {
  answers: CvGapAnswer[];
  saveToProfile: boolean;
}

/**
 * The one CV-gap dialog, and the rule that there is only one of it.
 *
 * Both document flows on the review step ask the user to fill gaps the job
 * description wants and the profile lacks, and they can run at the same time -
 * the user is free to start a cover letter while a CV is still generating.
 * There is a single dialog and a single resolver, so "who owns it right now"
 * has to be an explicit rule rather than whoever wrote to the field last.
 *
 * The rule is first-caller-wins. A second caller is answered `null`
 * immediately, which is exactly what a cancel gives it, and every caller treats
 * gap-fill as optional. Taking the dialog over instead used to strand the first
 * caller's promise forever - its `await` never returned, its `finally` never
 * ran, and the document it was generating sat on "Generating" until the user
 * left the page.
 */
@Injectable()
export class CvGapDialogService {
  private readonly ai = inject(AiService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService).t;

  readonly analyzing = signal(false);
  readonly open = signal(false);
  readonly questions = signal<CvGapQuestion[]>([]);

  /**
   * Why the last analysis produced no questions, when the reason was a failure
   * rather than an answer. Cleared at the start of every `analyze`, so it always
   * describes the most recent attempt and never an older one.
   */
  readonly analyzeError = signal<string | null>(null);

  private resolver: ((result: CvGapResult | null) => void) | null = null;

  /**
   * Set once the page that owns this instance is gone. This service is
   * component-scoped, so its signals are only ever read by that one page's
   * template; a generation outliving the page keeps a reference to it and asks
   * again later, for the undated entries. Opening then would raise a dialog on
   * a service nothing renders - invisible, unanswerable, and holding the
   * generation's promise forever.
   */
  private disposed = false;

  /** True while the dialog is on screen or its questions are being worked out. */
  readonly busy = computed(() => this.open() || this.analyzing());

  /** True while a caller is waiting on the dialog. */
  get taken(): boolean {
    return this.resolver !== null;
  }

  /**
   * Asks the model which gaps are worth raising. Never throws and never blocks
   * generation, but it does distinguish its two silent outcomes: an empty
   * `questions` list means "ask nothing", while `ok: false` means the model was
   * never reached. Both continue to a document; only the second is a failure,
   * and it is reported here rather than left for the caller to notice, because
   * every caller treats gap-fill as optional and would otherwise drop it.
   */
  async analyze(
    cvText: string,
    job: Job | null,
    settings: Settings | null,
    language: SupportedLanguage,
  ): Promise<GapAnalysis> {
    this.analyzeError.set(null);
    if (!job?.id || !settings) return { ok: true, questions: [] };
    try {
      const rendered = await this.ai.renderSkill('cv-gap-analysis', {
        cv_text: cvText,
        job_description: job.jdText ?? '',
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      return { ok: true, questions: parseCvGapResponse(res.text) };
    } catch (e) {
      const error = String(e);
      this.analyzeError.set(error);
      this.toast.warning(`${this.t()('jobs.gap_analysis_unavailable')} ${error}`);
      return { ok: false, error };
    }
  }

  /**
   * Opens the dialog and resolves when the user submits or cancels.
   * First caller wins; a second is answered `null` without disturbing the first.
   * A caller arriving after `dispose` is answered `null` too - see `disposed`.
   */
  ask(questions: CvGapQuestion[]): Promise<CvGapResult | null> {
    if (this.disposed || this.resolver) return Promise.resolve(null);
    this.questions.set(questions);
    this.open.set(true);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  submit(result: CvGapResult): void {
    this.open.set(false);
    this.settle(result);
  }

  cancel(): void {
    this.open.set(false);
    this.settle(null);
  }

  /**
   * Releases a waiting caller when the dialog goes away without an answer -
   * leaving this job, or resetting the page. Without it the caller's `finally`
   * never runs and its in-flight marker never clears.
   *
   * Also retires the instance: a generation that outlives the page must not be
   * able to reopen a dialog here later. Gap-fill is optional on every path, so
   * being answered `null` skips it and the document is still produced.
   */
  dispose(): void {
    this.disposed = true;
    this.open.set(false);
    this.analyzing.set(false);
    this.questions.set([]);
    this.analyzeError.set(null);
    this.settle(null);
  }

  private settle(result: CvGapResult | null): void {
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(result);
  }
}

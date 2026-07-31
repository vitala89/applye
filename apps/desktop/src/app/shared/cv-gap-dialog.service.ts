import { Injectable, computed, inject, signal } from '@angular/core';
import { AiService } from '@applye/data';
import { Job, Settings, SupportedLanguage } from '@applye/core';
import {
  parseCvGapResponse,
  type CvGapAnswer,
  type CvGapQuestion,
} from '../pages/documents/cv-content.util';

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

  readonly analyzing = signal(false);
  readonly open = signal(false);
  readonly questions = signal<CvGapQuestion[]>([]);

  private resolver: ((result: CvGapResult | null) => void) | null = null;

  /** True while the dialog is on screen or its questions are being worked out. */
  readonly busy = computed(() => this.open() || this.analyzing());

  /** True while a caller is waiting on the dialog. */
  get taken(): boolean {
    return this.resolver !== null;
  }

  /**
   * Asks the model which gaps are worth raising. Never throws and never blocks
   * generation: an empty list means "ask nothing", which is also what a failed
   * or unparseable answer produces.
   */
  async analyze(
    cvText: string,
    job: Job | null,
    settings: Settings | null,
    language: SupportedLanguage,
  ): Promise<CvGapQuestion[]> {
    if (!job?.id || !settings) return [];
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
      return parseCvGapResponse(res.text);
    } catch {
      return [];
    }
  }

  /**
   * Opens the dialog and resolves when the user submits or cancels.
   * First caller wins; a second is answered `null` without disturbing the first.
   */
  ask(questions: CvGapQuestion[]): Promise<CvGapResult | null> {
    if (this.resolver) return Promise.resolve(null);
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
   */
  dispose(): void {
    this.open.set(false);
    this.analyzing.set(false);
    this.questions.set([]);
    this.settle(null);
  }

  private settle(result: CvGapResult | null): void {
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(result);
  }
}

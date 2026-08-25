import { Injectable, computed, inject, signal } from '@angular/core';
import { AiService, DraftsGateway, SystemGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { WizardActivityService } from './wizard-activity.service';
import { ToastService } from '../shell/toast.service';
import {
  PASSES,
  PassNumber,
  PassResult,
  PassResultInput,
  TailorContext,
  baselineFor,
  buildPassResult,
  parsePassResult,
  passHashInput,
  resultMdForPass,
} from './tailoring-pass';

// Re-exported so the pipeline's types are still reached through the service that
// produces them, exactly as they were before the split - the same rule
// `cv-content.util.ts` followed when it kept its barrel for 43 consumers.
export type { PassResult, TailorContext };

/**
 * The three-pass resume tailoring pipeline, hoisted out of the jobs page
 * component.
 *
 * Each pass is cached on a hash of *all* of its inputs, including the results
 * of the passes before it - pass 3 reads pass 1 and 2, so a cache keyed on the
 * baseline alone would serve a stale build after an earlier pass changed.
 * `restoreFromCache` recomputes that same chain, which is why it stops at the
 * first miss rather than skipping ahead.
 *
 * Whether a run is in flight is not stored here. It lives in
 * `WizardActivityService`, keyed by job, so it survives this page component
 * being destroyed while an AI call is still in the air.
 */
@Injectable()
export class TailoringService {
  private readonly db = inject(SystemGateway);
  /** The tailoring cache moved to its own gateway; `db` stays for `hashText`,
   * which is cross-cutting and has not been migrated yet. */
  private readonly drafts = inject(DraftsGateway);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly activity = inject(WizardActivityService);
  private readonly toast = inject(ToastService);

  private readonly t = this.i18n.t;

  readonly results = signal<PassResult[]>([]);
  readonly status = signal('');
  readonly error = signal(false);
  /** Set by `cancel()`; the loop checks it between passes. */
  readonly cancelled = signal(false);

  /**
   * Set when the passes ran on the profile because the chosen base CV could not
   * be used. Separate from `status`, which every pass overwrites with its own
   * progress line and would drop this within a second of showing it.
   */
  readonly baselineWarning = signal<string | null>(null);

  /** All three passes landed. Anything less is a partial or abandoned run. */
  readonly isTailored = computed(() => this.results().length === 3);
  readonly allChanges = computed(() => this.results().flatMap((r) => r.changes));
  readonly allGaps = computed(() => this.results().flatMap((r) => r.gaps));

  /** True while a run for `jobId` is in flight, from the activity service. */
  isRunning(jobId: number): boolean {
    return this.activity.isRunning(jobId, 'tailoring');
  }

  /** Drops every result and clears the status line. */
  reset(): void {
    this.results.set([]);
    this.status.set('');
    this.error.set(false);
    this.baselineWarning.set(null);
  }

  /**
   * Runs all three passes back to back, so the phase cards animate through
   * running/done without a manual Continue between them. Stops on the first
   * failing pass.
   */
  async run(ctx: TailorContext): Promise<void> {
    this.reset();
    this.cancelled.set(false);

    const jobId = ctx.job?.id;
    if (jobId) this.activity.begin(jobId, 'tailoring');
    try {
      for (const pass of PASSES) {
        if (this.cancelled()) break;
        await this.runPass(pass, ctx);
      }
      if (this.cancelled()) {
        // Discard the partial passes and return to the pre-tailor state.
        this.results.set([]);
        this.status.set(this.t()('jobs.wizard.tailor_cancelled'));
      }
    } catch (e) {
      this.status.set(String(e));
      this.error.set(true);
    } finally {
      this.cancelled.set(false);
      if (jobId) this.activity.end(jobId, 'tailoring');
    }
  }

  /**
   * Cancels an in-flight run. The AI pass already in flight cannot be aborted
   * mid-request, so it finishes, but the loop stops before the next pass and
   * every partial result is discarded - the wizard returns to the pre-tailor
   * state so the user can adjust the source and try again.
   */
  cancel(jobId: number | undefined): void {
    if (jobId != null && this.isRunning(jobId)) this.cancelled.set(true);
  }

  /**
   * Rebuilds the results from the cache without spending a token, so returning
   * to a job shows the tailoring already done for it.
   *
   * Hashes against the same baseline `runPass` wrote the cache under -
   * `baselineFor(ctx)`, the chosen base CV when there is one, the profile
   * otherwise. Hashing against the profile unconditionally missed every job
   * tailored against a selected base CV, since `selectedBaseCvId` is already
   * restored from the linked application by the time this runs.
   */
  async restoreFromCache(ctx: TailorContext): Promise<void> {
    const { job, profile, settings } = ctx;
    if (!job?.id || (!profile?.fullMd && !ctx.baseCvId) || !settings) return;

    const baselineMd = baselineFor(ctx).md;
    const lang = settings.defaultDocLanguage ?? 'en';
    const restored: PassResult[] = [];
    for (const passNum of PASSES) {
      const inputHash = await this.passInputHash(baselineMd, ctx.jdText, passNum, lang, restored);
      const cached = await this.drafts.tailoringCacheGet(job.id, passNum, inputHash);
      // A miss means every later pass is keyed on a result we do not have.
      if (!cached) break;
      restored.push(
        buildPassResult({
          pass: passNum,
          resultMd: cached.resultMd,
          changesJson: cached.changesJson,
          gapsJson: cached.gapsJson,
          inputHash,
          fromCache: true,
          tokensIn: 0,
          tokensOut: 0,
        }),
      );
    }
    if (restored.length) this.results.set(restored);
  }

  private async runPass(passNum: PassNumber, ctx: TailorContext): Promise<void> {
    const { job, profile, settings } = ctx;
    if (!job?.id || (!profile?.fullMd && !ctx.baseCvId) || !settings) return;

    // Falls back to the profile but says so, or the result reads as a tailored
    // version of a CV nobody opened. Guarded: `runPass` runs once per pass. Both
    // keys are whole sentences - the six locales do not share word order.
    const baseline = baselineFor(ctx);
    const warning = baseline.ok
      ? null
      : this.t()(
          baseline.reason === 'missing'
            ? 'jobs.tailor_base_cv_missing'
            : 'jobs.tailor_base_cv_unreadable',
        ).replace('{n}', String(baseline.cvId));
    if (warning && this.baselineWarning() !== warning) {
      this.baselineWarning.set(warning);
      this.toast.warning(warning);
    }
    const baselineMd = baseline.md;
    const lang = settings.defaultDocLanguage ?? 'en';
    const inputHash = await this.passInputHash(
      baselineMd,
      ctx.jdText,
      passNum,
      lang,
      this.results(),
    );

    const cached = await this.drafts.tailoringCacheGet(job.id, passNum, inputHash);
    if (cached) {
      this.appendPassResult({
        pass: passNum,
        resultMd: cached.resultMd,
        changesJson: cached.changesJson,
        gapsJson: cached.gapsJson,
        inputHash,
        fromCache: true,
        tokensIn: 0,
        tokensOut: 0,
      });
      this.status.set(`Pass ${passNum} loaded from cache - 0 tokens.`);
      return;
    }

    const rendered = await this.ai.renderSkill('resume-tailoring', {
      profile_md: baselineMd,
      job_description: ctx.jdText,
      scoring_json: ctx.scoring ? JSON.stringify(ctx.scoring) : '{}',
      pass: String(passNum),
      language: lang,
      pass1_result: resultMdForPass(this.results(), 1),
      pass2_result: resultMdForPass(this.results(), 2),
    });

    // Pass 2 is a critique against the pass-1 draft, not a document build - its
    // declared output is six to ten bullet points, so it does not need the
    // flagship tier passes 1 and 3 need for a full rewrite.
    const model = passNum === 2 ? settings.economyModel : settings.defaultModel;

    const res = await this.ai.run({
      mode: settings.aiMode,
      provider: settings.provider,
      model,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      cacheablePrefix: rendered.userPromptCacheable,
      language: lang,
    });

    const parsed = parsePassResult(res.text, passNum);

    await this.drafts.tailoringCacheSave({
      jobId: job.id,
      pass: passNum,
      inputHash,
      resultMd: parsed.result_md,
      changesJson: JSON.stringify(parsed.changes),
      gapsJson: JSON.stringify(parsed.gaps),
      modelUsed: model,
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
    });

    this.appendPassResult({
      pass: passNum,
      resultMd: parsed.result_md,
      changesJson: JSON.stringify(parsed.changes),
      gapsJson: JSON.stringify(parsed.gaps),
      inputHash,
      fromCache: false,
      tokensIn: res.tokensInput,
      tokensOut: res.tokensOutput,
    });
    this.status.set(`Pass ${passNum} done - ${res.tokensInput} in / ${res.tokensOutput} out`);
  }

  /** Covers every input to this pass, including the earlier passes it builds
   * on, so a change anywhere upstream invalidates the cache. */
  private passInputHash(
    baselineMd: string,
    jdText: string,
    passNum: PassNumber,
    lang: string,
    priorPasses: readonly PassResult[],
  ): Promise<string> {
    return this.db.hashText(passHashInput(baselineMd, jdText, passNum, lang, priorPasses));
  }

  private appendPassResult(input: PassResultInput): void {
    this.results.update((r) => [...r, buildPassResult(input)]);
  }
}

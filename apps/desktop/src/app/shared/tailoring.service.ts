import { Injectable, computed, inject, signal } from '@angular/core';
import { AiService, DbService } from '@applye/data';
import {
  CvContent,
  DocumentLibraryItem,
  Job,
  Profile,
  ScoringCache,
  Settings,
  cvContentToMd,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { WizardActivityService } from './wizard-activity.service';

export interface PassResult {
  pass: number;
  resultMd: string;
  changes: string[];
  gaps: string[];
  inputHash: string;
  fromCache: boolean;
  tokensIn: number;
  tokensOut: number;
}

/** Everything a run reads. Owned by the caller and passed per call, so there is
 * no second copy of the job, profile or selected CV to keep in sync. */
export interface TailorContext {
  job: Job | null;
  profile: Profile | null;
  settings: Settings | null;
  jdText: string;
  scoring: ScoringCache | null;
  baseCvId: number | null;
  matchingCvs: DocumentLibraryItem[];
}

const PASSES = [1, 2, 3] as const;
type PassNumber = (typeof PASSES)[number];

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
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly activity = inject(WizardActivityService);

  private readonly t = this.i18n.t;

  readonly results = signal<PassResult[]>([]);
  readonly status = signal('');
  readonly error = signal(false);
  /** Set by `cancel()`; the loop checks it between passes. */
  readonly cancelled = signal(false);

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
   * Always hashes against the profile baseline, never a selected CV: this runs
   * before the user has picked one for this visit.
   */
  async restoreFromCache(ctx: TailorContext): Promise<void> {
    const { job, profile, settings } = ctx;
    if (!job?.id || !profile?.fullMd || !settings) return;

    const lang = settings.defaultDocLanguage ?? 'en';
    const restored: PassResult[] = [];
    for (const passNum of PASSES) {
      const inputHash = await this.passInputHash(
        profile.fullMd,
        ctx.jdText,
        passNum,
        lang,
        restored,
      );
      const cached = await this.db.tailoringCacheGet(job.id, passNum, inputHash);
      // A miss means every later pass is keyed on a result we do not have.
      if (!cached) break;
      restored.push({
        pass: passNum,
        resultMd: cached.resultMd,
        inputHash,
        fromCache: true,
        tokensIn: 0,
        tokensOut: 0,
        changes: parseJsonArray(cached.changesJson),
        gaps: parseJsonArray(cached.gapsJson),
      });
    }
    if (restored.length) this.results.set(restored);
  }

  private async runPass(passNum: PassNumber, ctx: TailorContext): Promise<void> {
    const { job, profile, settings } = ctx;
    if (!job?.id || (!profile?.fullMd && !ctx.baseCvId) || !settings) return;

    const baselineMd = this.baselineFor(ctx);
    const lang = settings.defaultDocLanguage ?? 'en';
    const inputHash = await this.passInputHash(
      baselineMd,
      ctx.jdText,
      passNum,
      lang,
      this.results(),
    );

    const cached = await this.db.tailoringCacheGet(job.id, passNum, inputHash);
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
      pass1_result: this.resultMdForPass(this.results(), 1),
      pass2_result: this.resultMdForPass(this.results(), 2),
    });

    const res = await this.ai.run({
      mode: settings.aiMode,
      provider: settings.provider,
      model: settings.defaultModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: lang,
    });

    const parsed = parsePassResult(res.text, passNum);

    await this.db.tailoringCacheSave({
      jobId: job.id,
      pass: passNum,
      inputHash,
      resultMd: parsed.result_md,
      changesJson: JSON.stringify(parsed.changes),
      gapsJson: JSON.stringify(parsed.gaps),
      modelUsed: settings.defaultModel,
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

  /** The text the passes rewrite: the chosen base CV when there is one, the
   * profile markdown otherwise. An unparseable CV falls back to the profile
   * rather than tailoring an empty document. */
  private baselineFor(ctx: TailorContext): string {
    const fallback = ctx.profile?.fullMd ?? '';
    if (!ctx.baseCvId) return fallback;
    const cvItem = ctx.matchingCvs.find((c) => c.id === ctx.baseCvId);
    if (!cvItem?.contentJson) return fallback;
    try {
      return cvContentToMd(JSON.parse(cvItem.contentJson) as CvContent);
    } catch {
      return fallback;
    }
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
    return this.db.hashText(
      [
        baselineMd,
        jdText,
        String(passNum),
        lang,
        this.resultMdForPass(priorPasses, 1),
        this.resultMdForPass(priorPasses, 2),
      ].join('\x00'),
    );
  }

  private resultMdForPass(passes: readonly PassResult[], pass: number): string {
    return passes.find((r) => r.pass === pass)?.resultMd ?? '';
  }

  private appendPassResult(input: {
    pass: number;
    resultMd: string;
    changesJson: string | undefined;
    gapsJson: string | undefined;
    inputHash: string;
    fromCache: boolean;
    tokensIn: number;
    tokensOut: number;
  }): void {
    this.results.update((r) => [
      ...r,
      {
        pass: input.pass,
        resultMd: input.resultMd,
        inputHash: input.inputHash,
        fromCache: input.fromCache,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        changes: parseJsonArray(input.changesJson),
        gaps: parseJsonArray(input.gapsJson),
      },
    ]);
  }
}

function parseJsonArray(json: string | undefined): string[] {
  try {
    return JSON.parse(json ?? '[]');
  } catch {
    return [];
  }
}

function parsePassResult(
  text: string,
  pass: number,
): { result_md: string; changes: string[]; gaps: string[] } {
  try {
    const raw = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(raw);
    return {
      result_md: String(parsed.result_md ?? ''),
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    };
  } catch {
    throw new Error(`Pass ${pass} returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

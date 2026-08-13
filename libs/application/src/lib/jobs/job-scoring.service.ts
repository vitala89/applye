import { Injectable, inject, signal } from '@angular/core';
import { AiService, AtsService, DbService, JobsStore } from '@applye/data';
import { AtsReport, ScoringCache, Settings } from '@applye/core';
import { TailorScoreService } from './tailor-score.service';
import { WizardActivityService } from './wizard-activity.service';
import { FinalChecksService } from './final-checks.service';
import {
  ScoreContext,
  ScoreRunResult,
  parseScoreResponse,
  postTailorSaveInput,
  scoreCacheSaveInput,
  tailoredScoringCache,
} from './job-score-payload';

// Re-exported so the scoring contract is still reached through the service that
// applies it, exactly as it was before the split - the barrel rule
// `cv-content.util.ts` kept for its 43 consumers.
export { parseScoreResponse };
export type { ScoreContext };

/**
 * Job scoring, hoisted out of the jobs page component.
 *
 * Two scores exist for a job and they are deliberately not symmetric. The
 * baseline (`score`) rates the generic profile against the posting and is
 * cached in `scoring_cache`, keyed on the profile version, so reopening the
 * page costs nothing. The post-tailor rescore (`rescoreAfterTailor`) rates the
 * PASS-3 tailored resume so the user sees before vs after; it is held in
 * memory only, because `scoring_cache` is unique on (job_id, profile_hash,
 * jd_hash) and writing it would overwrite the "before" it is compared against.
 * It reaches disk only at `savePostTailor`, once the user commits.
 *
 * Whether a rescore is in flight is not stored here. It lives in
 * `TailorScoreService` and `WizardActivityService`, keyed by job, so a run
 * survives this page component being destroyed mid-call.
 */
@Injectable()
export class JobScoringService {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly ats = inject(AtsService);
  private readonly jobsStore = inject(JobsStore);
  private readonly tailorScore = inject(TailorScoreService);
  private readonly activity = inject(WizardActivityService);
  private readonly finalChecks = inject(FinalChecksService);

  readonly cache = signal<ScoringCache | null>(null);
  readonly fromCache = signal(false);
  /** The shown score was produced against an OLDER profile version - the
   * numbers still describe this job, but not the profile the user has now. */
  readonly stale = signal(false);
  readonly running = signal(false);
  readonly status = signal('');
  readonly error = signal(false);
  /** Deterministic ATS report for the tailored CV. Null until the rescore
   * runs, or if the local check failed - the card then falls back to the
   * AI's advisory verdict. */
  readonly atsReport = signal<AtsReport | null>(null);

  /** Why `atsReport` is null, when the reason is a failure rather than "not
   * run". Read alongside the report by anything that renders it. */
  readonly atsError = signal<string | null>(null);
  /** Guards `savePostTailor` against writing the same rescore twice. */
  readonly postTailorSaved = signal(false);

  /** Drops the shown score. Leaves the status line, which callers set. */
  reset(): void {
    this.cache.set(null);
    this.fromCache.set(false);
    this.stale.set(false);
  }

  /**
   * Restore this job's score on open. A score is cached per profile version, so
   * editing the profile (adding a target role, rewriting the Markdown) changes
   * the hash and the exact lookup misses. Rather than let the result disappear
   * - which reads as "this job was never scored" - fall back to the newest
   * score on record and flag it stale, so the user sees the old numbers plus an
   * explicit prompt to re-score against the profile they have now.
   */
  async loadCached(jobId: number, profileHash: string | null | undefined): Promise<void> {
    if (!profileHash) return;
    const current = await this.db.scoreCacheGet(jobId, profileHash);
    if (current) {
      this.cache.set(current);
      this.fromCache.set(true);
      this.stale.set(false);
      return;
    }
    const previous = await this.db.scoreCacheLatest(jobId);
    if (previous) {
      this.cache.set(previous);
      this.fromCache.set(true);
      this.stale.set(true);
    }
  }

  /**
   * Serves the cached score when one exists for this exact profile version,
   * otherwise spends tokens on a fresh one. `forceRefresh` skips the lookup.
   */
  async score(ctx: ScoreContext, forceRefresh = false): Promise<void> {
    const { job, profile, settings } = ctx;
    if (!job?.id || !profile?.scoringJson || !profile.scoringHash || !settings) return;
    const jobId = job.id;

    if (!forceRefresh) {
      const cached = await this.db.scoreCacheGet(jobId, profile.scoringHash);
      if (cached) {
        this.cache.set(cached);
        this.fromCache.set(true);
        this.stale.set(false);
        this.status.set('Loaded from cache - 0 tokens used.');
        return;
      }
    }

    this.running.set(true);
    this.status.set('');
    this.error.set(false);
    this.fromCache.set(false);
    try {
      const lang = settings.defaultDocLanguage ?? 'en';
      const run = await this.runSkill(ctx, profile.scoringJson, settings, lang, '');

      const saved = await this.db.scoreCacheSave(
        scoreCacheSaveInput({ jobId, profileHash: profile.scoringHash, language: lang, run }),
      );
      this.cache.set(saved);
      this.stale.set(false);
      this.jobsStore.patchOverviewRow(jobId, { score: saved.score });
      this.status.set(`Scored - ${run.tokensInput} in / ${run.tokensOutput} out`);
    } catch (e) {
      this.status.set(`Scoring failed: ${String(e)}`);
      this.error.set(true);
    } finally {
      this.running.set(false);
    }
  }

  /**
   * Post-tailor rescore - user-initiated (opt-in, spends tokens), scores the
   * PASS-3 tailored resume instead of the generic profile, so the user sees
   * before (original posting fit) vs after (fit of what they'd actually
   * submit). The result stays in `TailorScoreService` rather than
   * `scoring_cache`; see the class comment for why.
   */
  async rescoreAfterTailor(ctx: ScoreContext): Promise<void> {
    const { job, profile, settings, tailoredResumeMd } = ctx;
    if (
      !job?.id ||
      !profile?.scoringJson ||
      !profile.scoringHash ||
      !settings ||
      !tailoredResumeMd ||
      this.tailorScore.isRunningFor(job.id)
    ) {
      return;
    }

    this.tailorScore.begin(job.id);
    this.activity.begin(job.id, 'scoring');
    this.finalChecks.reset();

    // Deterministic ATS check on the tailored CV, before the AI call and
    // independent of whether it succeeds: it costs no tokens, cannot fail on a
    // malformed model reply, and is the number the user is actually shown.
    void this.runAtsCheck(tailoredResumeMd, ctx.jdText, ctx.reviewRegion);

    try {
      const lang = settings.defaultDocLanguage ?? 'en';
      const run = await this.runSkill(ctx, profile.scoringJson, settings, lang, tailoredResumeMd);

      this.tailorScore.succeed(
        job.id,
        tailoredScoringCache({
          jobId: job.id,
          profileHash: profile.scoringHash,
          jdHash: job.jdHash ?? '',
          language: lang,
          run,
        }),
        `Updated - ${run.tokensInput} in / ${run.tokensOutput} out`,
      );
    } catch (e) {
      this.tailorScore.fail(job.id, `Update failed: ${String(e)}`);
    } finally {
      this.activity.end(job.id, 'scoring');
    }
  }

  /**
   * Persists the post-tailor score to `scoring_cache` so the My Jobs list
   * reflects the tailored fit. The unique key (job_id, profile_hash, jd_hash)
   * matches the baseline row, so this overwrites it - the "before" is only
   * needed for the in-session comparison (held in `cache()`), not on disk.
   * Idempotent per rescore via `postTailorSaved`.
   */
  async savePostTailor(jobId: number | undefined): Promise<void> {
    const post = this.tailorScore.resultFor(jobId ?? -1);
    if (!post || !jobId || this.postTailorSaved()) return;
    this.postTailorSaved.set(true);
    try {
      await this.db.scoreCacheSave(postTailorSaveInput(post, jobId));
      this.jobsStore.patchOverviewRow(jobId, { score: post.score });
    } catch {
      this.postTailorSaved.set(false); // allow a retry on the next commit
    }
  }

  /**
   * The one AI call both scoring paths make. They differ only in whether a
   * tailored resume is supplied.
   *
   * Parsing belongs here rather than at the two call sites, so a reply that is
   * not JSON fails in one place and both paths carry the model that produced it
   * - the post-tailor save used to read `settings.economyModel` a second time to
   * recover a value the call already knew.
   */
  private async runSkill(
    ctx: ScoreContext,
    scoringJson: string,
    settings: Settings,
    language: string,
    tailoredResumeMd: string,
  ): Promise<ScoreRunResult> {
    const rendered = await this.ai.renderSkill('job-scoring', {
      profile_json: scoringJson,
      job_description: ctx.jdText,
      language,
      legitimacy_notes: ctx.legitimacyNotes.join('\n'),
      tailored_resume_md: tailoredResumeMd,
    });
    const res = await this.ai.run({
      mode: settings.aiMode,
      provider: settings.provider,
      model: settings.economyModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language,
    });
    return {
      parsed: parseScoreResponse(res.text),
      modelUsed: settings.economyModel,
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
    };
  }

  /** Runs the deterministic ATS check against the tailored CV. Failure is
   * non-fatal - the report stays null and the card falls back to the AI's
   * advisory verdict - but no longer silent: a null report meant both "not
   * requested" and "failed", and the console was the only record of the
   * difference, which is not a surface a user has. */
  private async runAtsCheck(cvMarkdown: string, jdText: string, region: string): Promise<void> {
    this.atsReport.set(null);
    this.atsError.set(null);
    try {
      this.atsReport.set(await this.ats.check(cvMarkdown, jdText, region));
    } catch (e) {
      this.atsError.set(`ATS check unavailable - showing the advisory verdict only. ${String(e)}`);
    }
  }
}

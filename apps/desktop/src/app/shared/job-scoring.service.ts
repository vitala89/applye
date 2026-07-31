import { Injectable, inject, signal } from '@angular/core';
import { AiService, AtsService, DbService, JobsStore } from '@applye/data';
import { AtsReport, Job, Profile, ScoreDimension, ScoringCache, Settings } from '@applye/core';
import { TailorScoreService } from './tailor-score.service';
import { WizardActivityService } from './wizard-activity.service';
import { FinalChecksService } from './final-checks.service';

/** The shape the `job-scoring` skill is contracted to return. */
interface ScoreResponse {
  score: number;
  dimensions: ScoreDimension[];
  missing_keywords: string[];
  red_flags: string[];
  ats_pass: boolean;
  ats_notes: string;
  summary: string;
  before_you_submit?: string[];
}

/** Everything a scoring run reads. Owned by the caller and passed per call, so
 * there is no second copy of the job, profile or settings to keep in sync. */
export interface ScoreContext {
  job: Job | null;
  profile: Profile | null;
  settings: Settings | null;
  jdText: string;
  legitimacyNotes: string[];
  /** The PASS-3 tailored resume. Empty for the baseline score, which is scored
   * against the generic profile instead. */
  tailoredResumeMd: string;
  /** Region passed to the deterministic ATS check. */
  reviewRegion: string;
}

/**
 * Strips the ```json fence some models wrap the reply in and parses it.
 * Pure, so the fence handling is testable without an AI call.
 *
 * @throws if the reply is not JSON once unwrapped.
 */
export function parseScoreResponse(text: string): ScoreResponse {
  const raw = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

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
      const res = await this.runSkill(ctx, profile.scoringJson, settings, lang, '');
      const parsed = parseScoreResponse(res.text);

      const saved = await this.db.scoreCacheSave({
        jobId,
        profileHash: profile.scoringHash,
        language: lang,
        score: parsed.score,
        dimensionsJson: JSON.stringify(parsed.dimensions),
        missingKeywordsJson: JSON.stringify(parsed.missing_keywords),
        redFlagsJson: JSON.stringify(parsed.red_flags),
        atsPass: parsed.ats_pass,
        atsNotes: parsed.ats_notes,
        summary: parsed.summary,
        beforeYouSubmitJson: JSON.stringify(parsed.before_you_submit ?? []),
        modelUsed: settings.economyModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      this.cache.set(saved);
      this.stale.set(false);
      this.jobsStore.patchOverviewRow(jobId, { score: saved.score });
      this.status.set(`Scored - ${res.tokensInput} in / ${res.tokensOutput} out`);
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
      const res = await this.runSkill(ctx, profile.scoringJson, settings, lang, tailoredResumeMd);
      const parsed = parseScoreResponse(res.text);

      this.tailorScore.succeed(
        job.id,
        {
          id: -1,
          jobId: job.id,
          profileHash: profile.scoringHash,
          jdHash: job.jdHash ?? '',
          language: lang,
          score: parsed.score,
          dimensionsJson: JSON.stringify(parsed.dimensions),
          missingKeywordsJson: JSON.stringify(parsed.missing_keywords),
          redFlagsJson: JSON.stringify(parsed.red_flags),
          atsPass: parsed.ats_pass,
          atsNotes: parsed.ats_notes,
          summary: parsed.summary,
          beforeYouSubmitJson: JSON.stringify(parsed.before_you_submit ?? []),
          modelUsed: settings.economyModel,
          tokensInput: res.tokensInput,
          tokensOutput: res.tokensOutput,
        },
        `Updated - ${res.tokensInput} in / ${res.tokensOutput} out`,
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
      await this.db.scoreCacheSave({
        jobId,
        profileHash: post.profileHash,
        language: post.language ?? 'en',
        score: post.score,
        dimensionsJson: post.dimensionsJson ?? '[]',
        missingKeywordsJson: post.missingKeywordsJson ?? '[]',
        redFlagsJson: post.redFlagsJson ?? '[]',
        atsPass: post.atsPass ?? false,
        atsNotes: post.atsNotes ?? '',
        summary: post.summary ?? '',
        beforeYouSubmitJson: post.beforeYouSubmitJson ?? '[]',
        modelUsed: post.modelUsed ?? '',
        tokensInput: post.tokensInput ?? 0,
        tokensOutput: post.tokensOutput ?? 0,
      });
      this.jobsStore.patchOverviewRow(jobId, { score: post.score });
    } catch {
      this.postTailorSaved.set(false); // allow a retry on the next commit
    }
  }

  /** The one AI call both scoring paths make. They differ only in whether a
   * tailored resume is supplied. */
  private async runSkill(
    ctx: ScoreContext,
    scoringJson: string,
    settings: Settings,
    language: string,
    tailoredResumeMd: string,
  ) {
    const rendered = await this.ai.renderSkill('job-scoring', {
      profile_json: scoringJson,
      job_description: ctx.jdText,
      language,
      legitimacy_notes: ctx.legitimacyNotes.join('\n'),
      tailored_resume_md: tailoredResumeMd,
    });
    return this.ai.run({
      mode: settings.aiMode,
      provider: settings.provider,
      model: settings.economyModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language,
    });
  }

  /**
   * Runs the deterministic ATS check against the tailored CV. Failure is
   * non-fatal and silent in the UI: the report simply stays null and the ATS
   * card falls back to the AI's advisory verdict, exactly as before.
   */
  private async runAtsCheck(cvMarkdown: string, jdText: string, region: string): Promise<void> {
    this.atsReport.set(null);
    try {
      this.atsReport.set(await this.ats.check(cvMarkdown, jdText, region));
    } catch (e) {
      console.warn('ats_check_run failed', e);
    }
  }
}

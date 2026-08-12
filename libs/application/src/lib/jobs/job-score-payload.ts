import { Job, Profile, ScoreDimension, ScoringCache, Settings } from '@applye/core';

/**
 * The pure half of job scoring: what the skill is contracted to return, what a
 * run reads, and the three payloads built from those two.
 *
 * Split out of `job-scoring.service.ts` rather than extracted for its own sake.
 * The service was 300 non-empty lines against the 250 that every file in
 * `libs/application` carries, and none of what follows needs a database, an AI
 * client or an injector.
 *
 * The payload builders are the part worth having alone. Scoring writes the same
 * fourteen fields three times - once from a fresh parse, once into the in-memory
 * post-tailor result, once back out of it - and each copy hand-mapped its own
 * `JSON.stringify` and its own `?? []` default. Three hand-mappings of one shape
 * is where a field silently stops being carried.
 */

/** The shape the `job-scoring` skill is contracted to return. */
export interface ScoreResponse {
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

/** What `DbService.scoreCacheSave` accepts. Declared here so the payloads can be
 * built and asserted without reaching the gateway. */
export interface ScoreCacheSaveInput {
  jobId: number;
  profileHash: string;
  language: string;
  score: number;
  dimensionsJson: string;
  missingKeywordsJson: string;
  redFlagsJson: string;
  atsPass: boolean;
  atsNotes: string;
  summary: string;
  beforeYouSubmitJson: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
}

/** What one AI call cost and produced, in the form both scoring paths hold it. */
export interface ScoreRunResult {
  parsed: ScoreResponse;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
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
 * The row a freshly scored job is persisted as.
 *
 * `before_you_submit` is the one optional field the skill may omit, so it is the
 * one that defaults; the rest are contracted and are carried through as they
 * arrived rather than defended twice.
 */
export function scoreCacheSaveInput(input: {
  jobId: number;
  profileHash: string;
  language: string;
  run: ScoreRunResult;
}): ScoreCacheSaveInput {
  const { parsed } = input.run;
  return {
    jobId: input.jobId,
    profileHash: input.profileHash,
    language: input.language,
    score: parsed.score,
    dimensionsJson: JSON.stringify(parsed.dimensions),
    missingKeywordsJson: JSON.stringify(parsed.missing_keywords),
    redFlagsJson: JSON.stringify(parsed.red_flags),
    atsPass: parsed.ats_pass,
    atsNotes: parsed.ats_notes,
    summary: parsed.summary,
    beforeYouSubmitJson: JSON.stringify(parsed.before_you_submit ?? []),
    modelUsed: input.run.modelUsed,
    tokensInput: input.run.tokensInput,
    tokensOutput: input.run.tokensOutput,
  };
}

/**
 * The post-tailor rescore, in the shape `TailorScoreService` holds in memory.
 *
 * `id: -1` marks it as never having been a database row. It is deliberately not
 * written to `scoring_cache` when produced: that table is unique on
 * (job_id, profile_hash, jd_hash) and would overwrite the pre-tailor baseline
 * the before/after view compares against. It reaches disk only at
 * `savePostTailor`, once the user commits.
 */
export function tailoredScoringCache(input: {
  jobId: number;
  profileHash: string;
  jdHash: string;
  language: string;
  run: ScoreRunResult;
}): ScoringCache {
  const { parsed } = input.run;
  return {
    id: -1,
    jobId: input.jobId,
    profileHash: input.profileHash,
    jdHash: input.jdHash,
    language: input.language,
    score: parsed.score,
    dimensionsJson: JSON.stringify(parsed.dimensions),
    missingKeywordsJson: JSON.stringify(parsed.missing_keywords),
    redFlagsJson: JSON.stringify(parsed.red_flags),
    atsPass: parsed.ats_pass,
    atsNotes: parsed.ats_notes,
    summary: parsed.summary,
    beforeYouSubmitJson: JSON.stringify(parsed.before_you_submit ?? []),
    modelUsed: input.run.modelUsed,
    tokensInput: input.run.tokensInput,
    tokensOutput: input.run.tokensOutput,
  };
}

/**
 * The same rescore on its way back out to `scoring_cache`, once committed.
 *
 * Every field defaults, unlike the two builders above, and the asymmetry is the
 * point: this one reads a row that has already been through the in-memory hop,
 * where a partial write or an older shape leaves a field absent. A save that
 * threw on one missing column would lose a score the user has already seen.
 */
export function postTailorSaveInput(post: ScoringCache, jobId: number): ScoreCacheSaveInput {
  return {
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
  };
}

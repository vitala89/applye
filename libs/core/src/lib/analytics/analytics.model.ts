// Analytics aggregation - pure, locale-free, deterministic.
//
// The Rust `db_analytics_facts` command hands us one row per application plus
// raw follow-up-draft timestamps; everything the Analytics screen draws
// (funnel, KPIs, deltas, trend buckets, empty/low-data flags) is derived here.
// Kept free of Angular and of any user-facing string: this module returns
// numbers and enum keys, and the component formats + localizes them. That makes
// every rule below unit-testable against a fixed `now`.

/** One application reduced to the funnel signals (mirror of the Rust struct). */
export interface AnalyticsApplication {
  status: string | null;
  appliedAt: string | null;
  savedAt: string | null;
  reachedInterview: boolean;
  reachedOffer: boolean;
  archived: boolean;
  /** Latest ATS-fit score 0..100, or null when the job was never scored. */
  score: number | null;
  /** Earliest employer response (interview/offer transition), or null. */
  firstResponseAt: string | null;
  /** Latest status transition timestamp (for pipeline aging), or null. */
  statusChangedAt: string | null;
  /** The job's location, or null. */
  location: string | null;
}

export interface AnalyticsFollowup {
  createdAt: string | null;
}

export interface AnalyticsFacts {
  applications: AnalyticsApplication[];
  followups: AnalyticsFollowup[];
}

export type AnalyticsPeriod = '30d' | '90d' | 'all';

export type AnalyticsState = 'empty' | 'low-data' | 'loaded';

export type BucketKind = 'day' | 'week' | 'month';

/** A single KPI tile. `value` is null when there is not enough data for it
 *  (e.g. a response rate with no applications). `delta` is signed; null when
 *  there is no comparable prior period. `isPoints` marks a percentage-point
 *  delta (rate) vs a plain count delta. */
export interface AnalyticsKpi {
  value: number | null;
  isPercent: boolean;
  delta: number | null;
  isPointsDelta: boolean;
  /** Normalised 0..1 bar heights, newest last. Empty when no honest series. */
  spark: number[];
  /** True when this tile should read as "not enough data yet". */
  lowData: boolean;
}

export interface AnalyticsStage {
  key: 'saved' | 'applied' | 'interviewing' | 'offer';
  count: number;
  /** Bar width 0..100, relative to the widest (saved) stage. */
  widthPct: number;
  /** Conversion from the previous stage, 0..100, or null when suppressed. */
  conv: number | null;
  /** Which stage the conversion is "of" - for the caption. */
  convOf: 'saved' | 'applied' | 'interviewing' | null;
  /** The applied stage is the accent-coloured primary bar. */
  primary: boolean;
}

export interface AnalyticsTrend {
  bucketKind: BucketKind;
  /** Applications sent per bucket, oldest first. */
  apps: number[];
  /** Follow-up drafts per bucket, aligned to `apps`. */
  followups: number[];
  yMax: number;
  hasFollowups: boolean;
  /** ISO (yyyy-mm-dd) start dates for ~5 evenly spaced axis ticks. */
  tickDates: string[];
}

export interface AnalyticsScoreBucket {
  /** Inclusive score range this bar covers. */
  lo: number;
  hi: number;
  count: number;
  /** Bar width 0..100 relative to the tallest bucket. */
  widthPct: number;
}

export interface AnalyticsScoreDist {
  /** Applied-in-window applications that carry a score. */
  scored: number;
  /** Applied-in-window applications with no score (scoring is opt-in). */
  unscored: number;
  buckets: AnalyticsScoreBucket[];
  /** Median score across the scored applications, or null when none. */
  median: number | null;
  /** Too few scored applications for the shape to mean anything. */
  lowData: boolean;
}

export interface AnalyticsOutcomeStat {
  key: 'offer' | 'interview' | 'noInterview';
  /** Scored applications that landed in this outcome. */
  count: number;
  /** Mean score of those applications, rounded, or null when none. */
  avgScore: number | null;
  /** Bar width 0..100 (= avgScore), 0 when null. */
  widthPct: number;
}

export interface AnalyticsScoreOutcome {
  groups: AnalyticsOutcomeStat[];
  /** True when too few scored applications to read the comparison. */
  lowData: boolean;
}

export interface AnalyticsResponseBucket {
  /** Day range this bar covers (`hi` null = open-ended, e.g. 30+). */
  lo: number;
  hi: number | null;
  count: number;
  widthPct: number;
}

export interface AnalyticsTimeToResponse {
  /** Applications with a measurable applied -> first-response gap. */
  count: number;
  /** Median days to first response, or null when none. */
  medianDays: number | null;
  /** Fastest / slowest response in days, or null. */
  fastestDays: number | null;
  slowestDays: number | null;
  buckets: AnalyticsResponseBucket[];
  /** Too few responses to read a distribution. */
  lowData: boolean;
}

export interface AnalyticsBand {
  lo: number;
  hi: number | null;
  count: number;
  widthPct: number;
}

export interface AnalyticsAging {
  /** Active (applied/interview, non-archived) applications in the window. */
  activeCount: number;
  /** Median days those applications have sat in their current status. */
  medianDays: number | null;
  /** Active applications older than `staleThreshold` days in status. */
  staleCount: number;
  staleThreshold: number;
  /** Days-in-status histogram (0-7 / 8-14 / 15-30 / 31+). */
  buckets: AnalyticsBand[];
  lowData: boolean;
}

export interface AnalyticsLocationRow {
  name: string;
  count: number;
  widthPct: number;
}

export interface AnalyticsLocations {
  /** Top locations by application count, most first. */
  rows: AnalyticsLocationRow[];
  /** Applications in the window with no location recorded. */
  unknown: number;
  /** Applications in the window that do carry a location. */
  total: number;
  lowData: boolean;
}

export interface AnalyticsView {
  state: AnalyticsState;
  /** Applications sent in the active window - drives the caption count. */
  appliedTotal: number;
  kpis: {
    apps: AnalyticsKpi;
    rate: AnalyticsKpi;
    interviews: AnalyticsKpi;
    offers: AnalyticsKpi;
  };
  stages: AnalyticsStage[];
  leakage: {
    /** rejected+cancelled as a share of (applied+leaked), 0..100. */
    widthPct: number;
    rejected: number;
    cancelled: number;
  };
  trend: AnalyticsTrend;
  scoreDist: AnalyticsScoreDist;
  scoreOutcome: AnalyticsScoreOutcome;
  timeToResponse: AnalyticsTimeToResponse;
  aging: AnalyticsAging;
  locations: AnalyticsLocations;
}

/** A window has too few applications for rates to be honest below this. */
export const LOW_DATA_APPLIED_MIN = 5;

/** Below this many scored applications, the score histogram is just noise. */
export const LOW_DATA_SCORED_MIN = 5;

/** Below this many measured responses, the time-to-response shape is noise. */
export const LOW_DATA_RESPONSE_MIN = 3;

/** Day bands for the time-to-response histogram (hi=null is open-ended). */
export const RESPONSE_BANDS: Array<[number, number | null]> = [
  [0, 7],
  [8, 14],
  [15, 30],
  [31, null],
];

/** Day bands for the pipeline-aging histogram. */
export const AGING_BANDS: Array<[number, number | null]> = [
  [0, 7],
  [8, 14],
  [15, 30],
  [31, null],
];

/** An active application is "stale" past this many days in its current status. */
export const AGING_STALE_DAYS = 14;

/** Statuses that count as an in-flight pipeline application. */
export const ACTIVE_STATUSES = new Set(['applied', 'interview']);

/** How many locations to list in the "where you're applying" breakdown. */
export const TOP_LOCATIONS = 6;

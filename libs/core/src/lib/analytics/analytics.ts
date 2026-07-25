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
const RESPONSE_BANDS: Array<[number, number | null]> = [
  [0, 7],
  [8, 14],
  [15, 30],
  [31, null],
];

/** Day bands for the pipeline-aging histogram. */
const AGING_BANDS: Array<[number, number | null]> = [
  [0, 7],
  [8, 14],
  [15, 30],
  [31, null],
];

/** An active application is "stale" past this many days in its current status. */
export const AGING_STALE_DAYS = 14;

/** Statuses that count as an in-flight pipeline application. */
const ACTIVE_STATUSES = new Set(['applied', 'interview']);

/** How many locations to list in the "where you're applying" breakdown. */
const TOP_LOCATIONS = 6;

/** Fixed 0..100 score bands (width 20) for the distribution histogram. */
const SCORE_BANDS: Array<[number, number]> = [
  [0, 19],
  [20, 39],
  [40, 59],
  [60, 79],
  [80, 100],
];

function median(vals: number[]): number | null {
  if (vals.length === 0) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** Bucket the scores of applications applied in the window into fixed bands. */
function scoreDistribution(apps: AnalyticsApplication[], from: string | null): AnalyticsScoreDist {
  let unscored = 0;
  const scores: number[] = [];
  for (const a of apps) {
    if (!inRange(toDay(a.appliedAt), from, null)) continue;
    if (a.score === null || a.score === undefined) unscored += 1;
    else scores.push(a.score);
  }
  const counts = SCORE_BANDS.map(([lo, hi]) => scores.filter((s) => s >= lo && s <= hi).length);
  const maxCount = Math.max(1, ...counts);
  const buckets: AnalyticsScoreBucket[] = SCORE_BANDS.map(([lo, hi], i) => ({
    lo,
    hi,
    count: counts[i],
    widthPct: counts[i] > 0 ? Math.max(Math.round((counts[i] / maxCount) * 100), 4) : 0,
  }));
  return {
    scored: scores.length,
    unscored,
    buckets,
    median: median(scores),
    lowData: scores.length < LOW_DATA_SCORED_MIN,
  };
}

/** Average score per outcome - the "does fit predict success?" comparison.
 *  Groups are mutually exclusive over scored, applied-in-window applications:
 *  reached an offer, reached an interview (no offer yet), or never advanced. */
function scoreOutcome(apps: AnalyticsApplication[], from: string | null): AnalyticsScoreOutcome {
  const groups: Record<'offer' | 'interview' | 'noInterview', number[]> = {
    offer: [],
    interview: [],
    noInterview: [],
  };
  for (const a of apps) {
    if (!inRange(toDay(a.appliedAt), from, null)) continue;
    if (a.score === null || a.score === undefined) continue;
    if (a.reachedOffer) groups.offer.push(a.score);
    else if (a.reachedInterview) groups.interview.push(a.score);
    else groups.noInterview.push(a.score);
  }
  const total = groups.offer.length + groups.interview.length + groups.noInterview.length;
  const mean = (vals: number[]): number | null =>
    vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  const order: Array<'offer' | 'interview' | 'noInterview'> = ['offer', 'interview', 'noInterview'];
  return {
    groups: order.map((key) => {
      const avg = mean(groups[key]);
      return { key, count: groups[key].length, avgScore: avg, widthPct: avg ?? 0 };
    }),
    lowData: total < LOW_DATA_SCORED_MIN,
  };
}

/** Whole-day gap between two timestamps, compared by their date prefix. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** Days from applied to first employer response, as a median + histogram. */
function timeToResponse(
  apps: AnalyticsApplication[],
  from: string | null,
): AnalyticsTimeToResponse {
  const days: number[] = [];
  for (const a of apps) {
    const applied = toDay(a.appliedAt);
    if (!applied || !inRange(applied, from, null)) continue;
    if (!a.firstResponseAt) continue;
    const d = daysBetween(applied, a.firstResponseAt);
    if (d >= 0) days.push(d);
  }
  const counts = RESPONSE_BANDS.map(
    ([lo, hi]) => days.filter((d) => d >= lo && (hi === null || d <= hi)).length,
  );
  const maxCount = Math.max(1, ...counts);
  const buckets: AnalyticsResponseBucket[] = RESPONSE_BANDS.map(([lo, hi], i) => ({
    lo,
    hi,
    count: counts[i],
    widthPct: counts[i] > 0 ? Math.max(Math.round((counts[i] / maxCount) * 100), 4) : 0,
  }));
  return {
    count: days.length,
    medianDays: median(days),
    fastestDays: days.length ? Math.min(...days) : null,
    slowestDays: days.length ? Math.max(...days) : null,
    buckets,
    lowData: days.length < LOW_DATA_RESPONSE_MIN,
  };
}

/** How long active (in-flight) applications have sat in their current status. */
function pipelineAging(
  apps: AnalyticsApplication[],
  from: string | null,
  now: Date,
): AnalyticsAging {
  const today = dayStr(startOfDayUTC(now));
  const days: number[] = [];
  let stale = 0;
  for (const a of apps) {
    if (a.archived || !a.status || !ACTIVE_STATUSES.has(a.status)) continue;
    if (!inRange(toDay(a.appliedAt), from, null)) continue;
    const since = toDay(a.statusChangedAt);
    if (!since) continue;
    const age = Math.max(0, daysBetween(since, today));
    days.push(age);
    if (age > AGING_STALE_DAYS) stale += 1;
  }
  const counts = AGING_BANDS.map(
    ([lo, hi]) => days.filter((d) => d >= lo && (hi === null || d <= hi)).length,
  );
  const maxCount = Math.max(1, ...counts);
  const buckets: AnalyticsBand[] = AGING_BANDS.map(([lo, hi], i) => ({
    lo,
    hi,
    count: counts[i],
    widthPct: counts[i] > 0 ? Math.max(Math.round((counts[i] / maxCount) * 100), 4) : 0,
  }));
  return {
    activeCount: days.length,
    medianDays: median(days),
    staleCount: stale,
    staleThreshold: AGING_STALE_DAYS,
    buckets,
    lowData: days.length < LOW_DATA_RESPONSE_MIN,
  };
}

/** Where the user is applying - top locations by application count. */
function topLocations(apps: AnalyticsApplication[], from: string | null): AnalyticsLocations {
  const counts = new Map<string, number>();
  let unknown = 0;
  let total = 0;
  for (const a of apps) {
    if (!inRange(toDay(a.appliedAt), from, null)) continue;
    const loc = (a.location ?? '').trim();
    if (!loc) {
      unknown += 1;
      continue;
    }
    total += 1;
    counts.set(loc, (counts.get(loc) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const max = sorted.length ? sorted[0][1] : 1;
  const rows: AnalyticsLocationRow[] = sorted.slice(0, TOP_LOCATIONS).map(([name, count]) => ({
    name,
    count,
    widthPct: Math.max(Math.round((count / max) * 100), 4),
  }));
  return { rows, unknown, total, lowData: total < LOW_DATA_RESPONSE_MIN };
}

const DAY_MS = 86_400_000;

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compare timestamps by their yyyy-mm-dd prefix - robust to the mixed
 *  `date('now')` / `datetime('now')` shapes SQLite stores. */
function toDay(ts: string | null): string | null {
  return ts ? ts.slice(0, 10) : null;
}

/** Lower bound (inclusive, yyyy-mm-dd) for a period, or null for all-time. */
function windowStart(period: AnalyticsPeriod, now: Date): string | null {
  const today = startOfDayUTC(now);
  if (period === '30d') return dayStr(addDays(today, -29));
  if (period === '90d') return dayStr(addDays(today, -89));
  return null;
}

/** The previous comparable window [prevFrom, prevTo). Null when none applies. */
function prevWindow(period: AnalyticsPeriod, now: Date): { from: string; to: string } | null {
  const today = startOfDayUTC(now);
  if (period === '30d')
    return { from: dayStr(addDays(today, -59)), to: dayStr(addDays(today, -29)) };
  if (period === '90d')
    return { from: dayStr(addDays(today, -179)), to: dayStr(addDays(today, -89)) };
  return null;
}

function inRange(day: string | null, from: string | null, to: string | null): boolean {
  if (!day) return false;
  if (from !== null && day < from) return false;
  if (to !== null && day >= to) return false;
  return true;
}

interface StageCounts {
  saved: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
  cancelled: number;
}

/** Count the cumulative funnel over applications whose effective date lands in
 *  [from, to). Every applied application was first saved, so SAVED >= APPLIED
 *  by construction and the funnel is always monotonic. */
function countStages(
  apps: AnalyticsApplication[],
  from: string | null,
  to: string | null,
): StageCounts {
  const c: StageCounts = {
    saved: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    cancelled: 0,
  };
  for (const a of apps) {
    const appliedDay = toDay(a.appliedAt);
    const appliedIn = inRange(appliedDay, from, to);
    const savedOnlyIn = !appliedDay && inRange(toDay(a.savedAt), from, to);
    if (appliedIn || savedOnlyIn) c.saved += 1;
    if (!appliedIn) continue;
    c.applied += 1;
    // An offer implies an interview was reached - keep the funnel monotonic
    // even if the source flags ever disagree.
    if (a.reachedInterview || a.reachedOffer) c.interviewing += 1;
    if (a.reachedOffer) c.offer += 1;
    if (a.status === 'rejected') c.rejected += 1;
    if (a.status === 'cancelled') c.cancelled += 1;
  }
  return c;
}

function rate(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 100) : null;
}

function normalise(vals: number[]): number[] {
  const max = Math.max(1, ...vals);
  return vals.map((v) => v / max);
}

function pickTicks(dates: string[]): string[] {
  const n = dates.length;
  if (n <= 5) return dates.slice();
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    out.push(dates[Math.round((i / 4) * (n - 1))]);
  }
  return out;
}

/** Bucket boundaries (start day, oldest first) for the trend axis. */
function buildBuckets(
  period: AnalyticsPeriod,
  now: Date,
  earliest: string | null,
): { starts: string[]; kind: BucketKind } {
  const today = startOfDayUTC(now);
  if (period === '30d') {
    const starts: string[] = [];
    for (let i = 29; i >= 0; i--) starts.push(dayStr(addDays(today, -i)));
    return { starts, kind: 'day' };
  }
  if (period === '90d') {
    const starts: string[] = [];
    // 13 weekly buckets ending this week.
    for (let i = 12; i >= 0; i--) starts.push(dayStr(addDays(today, -7 * i)));
    return { starts, kind: 'week' };
  }
  // all-time: monthly buckets from the first month of activity to now.
  const start = earliest ? new Date(`${earliest.slice(0, 7)}-01T00:00:00Z`) : addDays(today, -150);
  const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const nowMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const starts: string[] = [];
  const cursor = new Date(startMonth.getTime());
  // Cap the span so a very old first application can't explode the axis.
  let guard = 0;
  while (cursor.getTime() <= nowMonth.getTime() && guard < 36) {
    starts.push(dayStr(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    guard += 1;
  }
  if (starts.length === 0) starts.push(dayStr(nowMonth));
  return { starts, kind: 'month' };
}

/** Assign a day to the index of the last bucket whose start is <= day. */
function bucketIndex(starts: string[], day: string): number {
  let idx = -1;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= day) idx = i;
    else break;
  }
  return idx;
}

/**
 * Derive the full Analytics view for a period.
 *
 * @param facts   raw per-application signals + follow-up timestamps
 * @param period  the selected window
 * @param now     the reference "today" (injected for determinism)
 */
export function computeAnalytics(
  facts: AnalyticsFacts,
  period: AnalyticsPeriod,
  now: Date,
): AnalyticsView {
  const apps = facts.applications;
  const from = windowStart(period, now);

  const cur = countStages(apps, from, null);
  const prevW = prevWindow(period, now);
  const prev = prevW ? countStages(apps, prevW.from, prevW.to) : null;

  const totalApplications = apps.length;
  const isEmpty = totalApplications === 0;
  const isLowData = !isEmpty && cur.applied < LOW_DATA_APPLIED_MIN;

  // --- trend buckets ---------------------------------------------------------
  const inWindow = apps.filter((a) => {
    const d = toDay(a.appliedAt);
    return inRange(d, from, null);
  });
  const earliest =
    inWindow
      .map((a) => toDay(a.appliedAt))
      .filter((d): d is string => !!d)
      .sort()[0] ?? null;
  const { starts, kind } = buildBuckets(period, now, earliest);

  const appsPer = new Array(starts.length).fill(0);
  const intPer = new Array(starts.length).fill(0);
  const offPer = new Array(starts.length).fill(0);
  for (const a of apps) {
    const d = toDay(a.appliedAt);
    if (!d) continue;
    const i = bucketIndex(starts, d);
    if (i < 0) continue;
    appsPer[i] += 1;
    if (a.reachedInterview) intPer[i] += 1;
    if (a.reachedOffer) offPer[i] += 1;
  }
  const followPer = new Array(starts.length).fill(0);
  for (const f of facts.followups) {
    const d = toDay(f.createdAt);
    if (!d) continue;
    const i = bucketIndex(starts, d);
    if (i >= 0) followPer[i] += 1;
  }
  const hasFollowups = followPer.some((v) => v > 0);
  const yMax = Math.max(1, ...appsPer, ...(hasFollowups ? followPer : []));

  // Real sparklines from the tail of each honest per-bucket series.
  const tail = <T>(arr: T[], n: number): T[] => arr.slice(Math.max(0, arr.length - n));
  const SPARK = 10;

  const respRate = rate(cur.interviewing, cur.applied);
  const prevRate = prev ? rate(prev.interviewing, prev.applied) : null;

  const kpis = {
    apps: {
      value: cur.applied,
      isPercent: false,
      delta: prev ? cur.applied - prev.applied : null,
      isPointsDelta: false,
      spark: isLowData ? [] : normalise(tail(appsPer, SPARK)),
      lowData: false,
    },
    rate: {
      value: isLowData ? null : respRate,
      isPercent: true,
      delta: !isLowData && respRate !== null && prevRate !== null ? respRate - prevRate : null,
      isPointsDelta: true,
      spark: [],
      lowData: isLowData,
    },
    interviews: {
      value: cur.interviewing,
      isPercent: false,
      delta: prev ? cur.interviewing - prev.interviewing : null,
      isPointsDelta: false,
      spark: isLowData ? [] : normalise(tail(intPer, SPARK)),
      lowData: false,
    },
    offers: {
      value: cur.offer,
      isPercent: false,
      delta: prev ? cur.offer - prev.offer : null,
      isPointsDelta: false,
      spark: isLowData ? [] : normalise(tail(offPer, SPARK)),
      lowData: false,
    },
  };

  // --- funnel ----------------------------------------------------------------
  const maxCount = Math.max(1, cur.saved);
  const width = (c: number): number => (c > 0 ? Math.max(Math.round((c / maxCount) * 100), 4) : 0);
  const conv = (num: number, den: number): number | null => (isLowData ? null : rate(num, den));

  const stages: AnalyticsStage[] = [
    {
      key: 'saved',
      count: cur.saved,
      widthPct: width(cur.saved),
      conv: null,
      convOf: null,
      primary: false,
    },
    {
      key: 'applied',
      count: cur.applied,
      widthPct: width(cur.applied),
      conv: conv(cur.applied, cur.saved),
      convOf: 'saved',
      primary: true,
    },
    {
      key: 'interviewing',
      count: cur.interviewing,
      widthPct: width(cur.interviewing),
      conv: conv(cur.interviewing, cur.applied),
      convOf: 'applied',
      primary: false,
    },
    {
      key: 'offer',
      count: cur.offer,
      widthPct: width(cur.offer),
      conv: conv(cur.offer, cur.interviewing),
      convOf: 'interviewing',
      primary: false,
    },
  ];

  const leakTotal = cur.rejected + cur.cancelled;
  const leakDen = cur.applied + leakTotal;
  const leakage = {
    widthPct: leakDen > 0 ? Math.min(Math.round((leakTotal / leakDen) * 100), 100) : 0,
    rejected: cur.rejected,
    cancelled: cur.cancelled,
  };

  return {
    state: isEmpty ? 'empty' : isLowData ? 'low-data' : 'loaded',
    appliedTotal: cur.applied,
    kpis,
    stages,
    leakage,
    trend: {
      bucketKind: kind,
      apps: appsPer,
      followups: followPer,
      yMax,
      hasFollowups,
      tickDates: pickTicks(starts),
    },
    scoreDist: scoreDistribution(apps, from),
    scoreOutcome: scoreOutcome(apps, from),
    timeToResponse: timeToResponse(apps, from),
    aging: pipelineAging(apps, from, now),
    locations: topLocations(apps, from),
  };
}

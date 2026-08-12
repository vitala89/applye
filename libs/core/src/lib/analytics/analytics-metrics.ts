import type {
  AnalyticsAging,
  AnalyticsApplication,
  AnalyticsBand,
  AnalyticsLocationRow,
  AnalyticsLocations,
  AnalyticsResponseBucket,
  AnalyticsScoreBucket,
  AnalyticsScoreDist,
  AnalyticsScoreOutcome,
  AnalyticsTimeToResponse,
} from './analytics.model';
import {
  ACTIVE_STATUSES,
  AGING_BANDS,
  AGING_STALE_DAYS,
  LOW_DATA_RESPONSE_MIN,
  LOW_DATA_SCORED_MIN,
  RESPONSE_BANDS,
  TOP_LOCATIONS,
} from './analytics.model';
import { DAY_MS, dayStr, inRange, startOfDayUTC, toDay } from './analytics-buckets';

/** One metric each, over the same application list. Split from `analytics.ts`
 * when it passed its 400-line budget; `computeAnalytics` composes these. */

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
export function scoreDistribution(
  apps: AnalyticsApplication[],
  from: string | null,
): AnalyticsScoreDist {
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
export function scoreOutcome(
  apps: AnalyticsApplication[],
  from: string | null,
): AnalyticsScoreOutcome {
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
export function timeToResponse(
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
export function pipelineAging(
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
export function topLocations(
  apps: AnalyticsApplication[],
  from: string | null,
): AnalyticsLocations {
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

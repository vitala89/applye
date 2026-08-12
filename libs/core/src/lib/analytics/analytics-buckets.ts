import type { AnalyticsApplication, AnalyticsPeriod, BucketKind } from './analytics.model';

/** Dates, windows and histogram buckets: the arithmetic the metrics and the
 * trend series share. Split from `analytics.ts` with the metrics. */

export const DAY_MS = 86_400_000;

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compare timestamps by their yyyy-mm-dd prefix - robust to the mixed
 *  `date('now')` / `datetime('now')` shapes SQLite stores. */
export function toDay(ts: string | null): string | null {
  return ts ? ts.slice(0, 10) : null;
}

/** Lower bound (inclusive, yyyy-mm-dd) for a period, or null for all-time. */
export function windowStart(period: AnalyticsPeriod, now: Date): string | null {
  const today = startOfDayUTC(now);
  if (period === '30d') return dayStr(addDays(today, -29));
  if (period === '90d') return dayStr(addDays(today, -89));
  return null;
}

/** The previous comparable window [prevFrom, prevTo). Null when none applies. */
export function prevWindow(
  period: AnalyticsPeriod,
  now: Date,
): { from: string; to: string } | null {
  const today = startOfDayUTC(now);
  if (period === '30d')
    return { from: dayStr(addDays(today, -59)), to: dayStr(addDays(today, -29)) };
  if (period === '90d')
    return { from: dayStr(addDays(today, -179)), to: dayStr(addDays(today, -89)) };
  return null;
}

export function inRange(day: string | null, from: string | null, to: string | null): boolean {
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
export function countStages(
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

export function rate(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 100) : null;
}

export function normalise(vals: number[]): number[] {
  const max = Math.max(1, ...vals);
  return vals.map((v) => v / max);
}

export function pickTicks(dates: string[]): string[] {
  const n = dates.length;
  if (n <= 5) return dates.slice();
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    out.push(dates[Math.round((i / 4) * (n - 1))]);
  }
  return out;
}

/** Bucket boundaries (start day, oldest first) for the trend axis. */
export function buildBuckets(
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
export function bucketIndex(starts: string[], day: string): number {
  let idx = -1;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= day) idx = i;
    else break;
  }
  return idx;
}

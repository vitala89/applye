import type {
  AnalyticsFacts,
  AnalyticsPeriod,
  AnalyticsStage,
  AnalyticsView,
} from './analytics.model';
import { LOW_DATA_APPLIED_MIN } from './analytics.model';
import {
  pipelineAging,
  scoreDistribution,
  scoreOutcome,
  timeToResponse,
  topLocations,
} from './analytics-metrics';
import {
  buildBuckets,
  bucketIndex,
  countStages,
  inRange,
  normalise,
  pickTicks,
  prevWindow,
  rate,
  toDay,
  windowStart,
} from './analytics-buckets';

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

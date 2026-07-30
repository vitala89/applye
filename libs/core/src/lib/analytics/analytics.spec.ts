import {
  AnalyticsApplication,
  AnalyticsFacts,
  computeAnalytics,
  LOW_DATA_APPLIED_MIN,
} from './analytics';

const NOW = new Date('2026-07-18T12:00:00Z');

function app(partial: Partial<AnalyticsApplication>): AnalyticsApplication {
  return {
    status: 'applied',
    appliedAt: '2026-07-01',
    savedAt: '2026-06-25',
    reachedInterview: false,
    reachedOffer: false,
    archived: false,
    score: null,
    firstResponseAt: null,
    statusChangedAt: null,
    location: null,
    ...partial,
  };
}

function facts(applications: AnalyticsApplication[], followups: string[] = []): AnalyticsFacts {
  return { applications, followups: followups.map((createdAt) => ({ createdAt })) };
}

/** N distinct applied applications inside the last 30 days. */
function applied(n: number, extra: Partial<AnalyticsApplication> = {}): AnalyticsApplication[] {
  return Array.from({ length: n }, (_, i) =>
    app({ appliedAt: `2026-07-${String((i % 27) + 1).padStart(2, '0')}`, ...extra }),
  );
}

describe('computeAnalytics', () => {
  it('reports empty when there are no applications', () => {
    const v = computeAnalytics(facts([]), '90d', NOW);
    expect(v.state).toBe('empty');
    expect(v.appliedTotal).toBe(0);
  });

  it('keeps the funnel monotonic: saved >= applied >= interviewing >= offer', () => {
    const apps = [
      ...applied(6),
      app({ appliedAt: null, savedAt: '2026-07-05', status: 'saved' }), // saved-only, in window
      app({ appliedAt: '2026-07-02', reachedInterview: true }),
      app({ appliedAt: '2026-07-03', reachedInterview: true, reachedOffer: true, status: 'offer' }),
    ];
    const v = computeAnalytics(facts(apps), '30d', NOW);
    const [saved, appliedS, interviewing, offer] = v.stages;
    expect(saved.count).toBeGreaterThanOrEqual(appliedS.count);
    expect(appliedS.count).toBeGreaterThanOrEqual(interviewing.count);
    expect(interviewing.count).toBeGreaterThanOrEqual(offer.count);
    // The saved-only application lifts SAVED above APPLIED.
    expect(saved.count).toBe(appliedS.count + 1);
    expect(offer.count).toBe(1);
    expect(interviewing.count).toBe(2);
  });

  it('marks the applied stage as the accent primary', () => {
    const v = computeAnalytics(facts(applied(6)), '30d', NOW);
    expect(v.stages.find((s) => s.key === 'applied')?.primary).toBe(true);
    expect(v.stages.filter((s) => s.primary)).toHaveLength(1);
  });

  it('suppresses rates and conversions under the low-data threshold', () => {
    const apps = applied(LOW_DATA_APPLIED_MIN - 1, { reachedInterview: true });
    const v = computeAnalytics(facts(apps), '30d', NOW);
    expect(v.state).toBe('low-data');
    expect(v.kpis.rate.value).toBeNull();
    expect(v.kpis.rate.lowData).toBe(true);
    for (const s of v.stages) expect(s.conv).toBeNull();
    // Raw counts still flow through.
    expect(v.kpis.apps.value).toBe(LOW_DATA_APPLIED_MIN - 1);
    expect(v.kpis.interviews.value).toBe(LOW_DATA_APPLIED_MIN - 1);
  });

  it('computes response rate as interviewing / applied once past low-data', () => {
    const apps = [...applied(8), ...applied(2, { reachedInterview: true })]; // 10 applied, 2 reached interview
    const v = computeAnalytics(facts(apps), '30d', NOW);
    expect(v.state).toBe('loaded');
    expect(v.kpis.apps.value).toBe(10);
    expect(v.kpis.rate.value).toBe(20);
    expect(v.stages.find((s) => s.key === 'interviewing')?.conv).toBe(20);
  });

  it('scopes the window: an old application is excluded from 30d but counted all-time', () => {
    const apps = [
      ...applied(6),
      app({ appliedAt: '2026-01-10', savedAt: '2026-01-05' }), // far outside 30d
    ];
    const in30 = computeAnalytics(facts(apps), '30d', NOW);
    const inAll = computeAnalytics(facts(apps), 'all', NOW);
    expect(in30.kpis.apps.value).toBe(6);
    expect(inAll.kpis.apps.value).toBe(7);
  });

  it('produces a signed delta vs the previous window', () => {
    const apps = [
      ...applied(6), // current 30d
      app({ appliedAt: '2026-06-01', savedAt: '2026-05-28' }), // prev 30d (2026-06-19..)
      app({ appliedAt: '2026-06-05', savedAt: '2026-05-30' }),
    ];
    const v = computeAnalytics(facts(apps), '30d', NOW);
    expect(v.kpis.apps.delta).toBe(6 - 2);
  });

  it('has no delta for all-time (no comparable prior window)', () => {
    const v = computeAnalytics(facts(applied(6)), 'all', NOW);
    expect(v.kpis.apps.delta).toBeNull();
  });

  it('counts leakage from current rejected/cancelled statuses', () => {
    const apps = [
      ...applied(6),
      app({ appliedAt: '2026-07-04', status: 'rejected' }),
      app({ appliedAt: '2026-07-06', status: 'cancelled' }),
    ];
    const v = computeAnalytics(facts(apps), '30d', NOW);
    expect(v.leakage.rejected).toBe(1);
    expect(v.leakage.cancelled).toBe(1);
    expect(v.leakage.widthPct).toBeGreaterThan(0);
  });

  it('buckets the trend so bucket sum equals applications in the window', () => {
    const apps = applied(9);
    const v = computeAnalytics(facts(apps), '30d', NOW);
    const sum = v.trend.apps.reduce((a, b) => a + b, 0);
    expect(sum).toBe(9);
    expect(v.trend.bucketKind).toBe('day');
    expect(v.trend.apps).toHaveLength(30);
  });

  it('uses weekly buckets for 90d and monthly for all-time', () => {
    const v90 = computeAnalytics(facts(applied(6)), '90d', NOW);
    expect(v90.trend.bucketKind).toBe('week');
    expect(v90.trend.apps).toHaveLength(13);
    const vAll = computeAnalytics(facts(applied(6)), 'all', NOW);
    expect(vAll.trend.bucketKind).toBe('month');
  });

  it('overlays follow-up drafts as a per-bucket series', () => {
    const apps = applied(6);
    const v = computeAnalytics(facts(apps, ['2026-07-02', '2026-07-02', '2026-07-10']), '30d', NOW);
    expect(v.trend.hasFollowups).toBe(true);
    expect(v.trend.followups.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('buckets scores into fixed bands and counts unscored separately', () => {
    const apps = [
      ...applied(3, { score: 85 }), // band 80-100
      ...applied(2, { score: 72 }), // band 60-79
      ...applied(2), // unscored (score null)
    ];
    const v = computeAnalytics(facts(apps), '30d', NOW);
    const d = v.scoreDist;
    expect(d.scored).toBe(5);
    expect(d.unscored).toBe(2);
    expect(d.buckets[4].count).toBe(3); // 80-100
    expect(d.buckets[3].count).toBe(2); // 60-79
    expect(d.buckets[0].count).toBe(0); // 0-19
    expect(d.median).toBe(85); // [72,72,85,85,85] -> middle is 85
  });

  it('flags the score histogram as low-data below the scored minimum', () => {
    const v = computeAnalytics(facts(applied(6, { score: 80 })), '30d', NOW);
    // 6 applied but... only mark few scored:
    const few = computeAnalytics(facts([...applied(6), ...applied(3, { score: 80 })]), '30d', NOW);
    expect(v.scoreDist.lowData).toBe(false);
    expect(few.scoreDist.scored).toBe(3);
    expect(few.scoreDist.lowData).toBe(true);
  });

  it('averages score by outcome (offer / interview / no-interview)', () => {
    const apps = [
      app({
        appliedAt: '2026-07-02',
        score: 90,
        reachedInterview: true,
        reachedOffer: true,
        status: 'offer',
      }),
      app({ appliedAt: '2026-07-03', score: 80, reachedInterview: true }),
      app({ appliedAt: '2026-07-04', score: 70, reachedInterview: true }),
      app({ appliedAt: '2026-07-05', score: 50 }),
      app({ appliedAt: '2026-07-06', score: 40 }),
    ];
    const o = computeAnalytics(facts(apps), '30d', NOW).scoreOutcome;
    const g = Object.fromEntries(o.groups.map((x) => [x.key, x]));
    expect(g['offer'].avgScore).toBe(90);
    expect(g['interview'].count).toBe(2);
    expect(g['interview'].avgScore).toBe(75); // (80+70)/2
    expect(g['noInterview'].avgScore).toBe(45); // (50+40)/2
    expect(g['offer'].widthPct).toBe(90);
  });

  it('gives a null avg and zero width to an empty outcome group', () => {
    const apps = applied(5, { score: 60 }); // all no-interview
    const o = computeAnalytics(facts(apps), '30d', NOW).scoreOutcome;
    const g = Object.fromEntries(o.groups.map((x) => [x.key, x]));
    expect(g['offer'].count).toBe(0);
    expect(g['offer'].avgScore).toBeNull();
    expect(g['offer'].widthPct).toBe(0);
    expect(g['noInterview'].avgScore).toBe(60);
    expect(o.lowData).toBe(false); // 5 scored total
  });

  it('measures time to response as median days and a day histogram', () => {
    const apps = [
      app({ appliedAt: '2026-07-01', firstResponseAt: '2026-07-04' }), // 3 days -> band 0-7
      app({ appliedAt: '2026-07-01', firstResponseAt: '2026-07-11' }), // 10 days -> band 8-14
      app({ appliedAt: '2026-07-01', firstResponseAt: '2026-08-05' }), // 35 days -> band 31+
      app({ appliedAt: '2026-07-02' }), // no response
    ];
    const ttr = computeAnalytics(facts(apps), '30d', NOW).timeToResponse;
    expect(ttr.count).toBe(3);
    expect(ttr.medianDays).toBe(10);
    expect(ttr.fastestDays).toBe(3);
    expect(ttr.slowestDays).toBe(35);
    expect(ttr.buckets[0].count).toBe(1); // 0-7
    expect(ttr.buckets[1].count).toBe(1); // 8-14
    expect(ttr.buckets[3].count).toBe(1); // 31+
    expect(ttr.lowData).toBe(false); // exactly 3 responses
  });

  it('flags time-to-response as low-data with fewer than the minimum responses', () => {
    const apps = [
      app({ appliedAt: '2026-07-01', firstResponseAt: '2026-07-03' }),
      app({ appliedAt: '2026-07-02', firstResponseAt: '2026-07-05' }),
    ];
    const ttr = computeAnalytics(facts(apps), '30d', NOW).timeToResponse;
    expect(ttr.count).toBe(2);
    expect(ttr.lowData).toBe(true);
  });

  it('ages active applications by days in current status', () => {
    const apps = [
      app({ status: 'applied', appliedAt: '2026-07-10', statusChangedAt: '2026-07-11' }), // 7 days
      app({ status: 'interview', appliedAt: '2026-07-01', statusChangedAt: '2026-07-01' }), // 17 days -> stale
      app({ status: 'offer', appliedAt: '2026-07-05', statusChangedAt: '2026-07-06' }), // terminal, excluded
      app({
        status: 'applied',
        appliedAt: '2026-07-15',
        statusChangedAt: '2026-07-15',
        archived: true,
      }), // excluded
    ];
    const ag = computeAnalytics(facts(apps), '30d', NOW).aging;
    expect(ag.activeCount).toBe(2);
    expect(ag.staleCount).toBe(1); // the 17-day one is past the 14-day threshold
    expect(ag.buckets[0].count).toBe(1); // 0-7
    expect(ag.buckets[2].count).toBe(1); // 15-30
    expect(ag.medianDays).toBe(12); // median of [7, 17]
  });

  it('ranks top locations and counts applications with no location', () => {
    const apps = [
      ...applied(3, { location: 'Berlin' }),
      ...applied(2, { location: 'Remote' }),
      app({ appliedAt: '2026-07-05', location: null }),
      app({ appliedAt: '2026-07-06', location: '  ' }), // blank trims to unknown
    ];
    const loc = computeAnalytics(facts(apps), '30d', NOW).locations;
    expect(loc.total).toBe(5);
    expect(loc.unknown).toBe(2);
    expect(loc.rows[0]).toEqual({ name: 'Berlin', count: 3, widthPct: 100 });
    expect(loc.rows[1].name).toBe('Remote');
  });

  it('never lets the trend yMax fall below 1', () => {
    const v = computeAnalytics(
      facts([app({ appliedAt: null, savedAt: '2026-07-01', status: 'saved' })]),
      '30d',
      NOW,
    );
    expect(v.trend.yMax).toBeGreaterThanOrEqual(1);
  });
});

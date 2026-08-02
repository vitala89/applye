import { filterFeedRows, splitFeedSections, type FeedFilter } from './discover-feed';

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 1,
    title: 'Backend Engineer',
    company: 'Acme',
    source: 'ats_lever',
    location: 'Berlin, Germany',
    dismissed: false,
    saved: false,
    createdAt: '2026-01-01',
    ...over,
  }) as never;

const noFilter = (over: Partial<FeedFilter> = {}): FeedFilter => ({
  query: '',
  sources: new Set<string>(),
  works: new Set<string>(),
  countries: new Set<string>(),
  tab: 'all',
  ...over,
});

/** Everything onsite unless the location says otherwise - enough for these rules. */
const workTypeOf = (location: string | null) =>
  (location ?? '').toLowerCase().includes('remote') ? 'remote' : 'onsite';

describe('filterFeedRows', () => {
  it('keeps everything when nothing is filtered', () => {
    const rows = [row({ id: 1 }), row({ id: 2 })];

    expect(filterFeedRows(rows, noFilter(), workTypeOf)).toHaveLength(2);
  });

  it('keeps a dismissed row through every filter, so Undo stays reachable', () => {
    // The dismissed row renders as a transient "Dismissed - Undo" strip. If a
    // filter could remove it, the undo would vanish with it.
    const rows = [row({ id: 1, dismissed: true, title: 'Nothing like the query' })];

    expect(filterFeedRows(rows, noFilter({ query: 'zzz' }), workTypeOf)).toHaveLength(1);
  });

  it('hides saved rows on the New tab only', () => {
    const rows = [row({ id: 1, saved: true }), row({ id: 2, saved: false })];

    expect(filterFeedRows(rows, noFilter({ tab: 'new' }), workTypeOf).map((r) => r.id)).toEqual([
      2,
    ]);
    expect(filterFeedRows(rows, noFilter({ tab: 'all' }), workTypeOf)).toHaveLength(2);
  });

  it('searches the title and the company together', () => {
    const rows = [
      row({ id: 1, title: 'Rust Engineer', company: 'Acme' }),
      row({ id: 2, title: 'Designer', company: 'Rustic Co' }),
      row({ id: 3, title: 'Designer', company: 'Acme' }),
    ];

    expect(filterFeedRows(rows, noFilter({ query: 'rust' }), workTypeOf).map((r) => r.id)).toEqual([
      1, 2,
    ]);
  });

  it('drops a row with no source when sources are being filtered', () => {
    const rows = [row({ id: 1, source: null }), row({ id: 2, source: 'ats_lever' })];
    const f = noFilter({ sources: new Set(['ats_lever']) });

    expect(filterFeedRows(rows, f, workTypeOf).map((r) => r.id)).toEqual([2]);
  });

  it('filters by work type through the function it is given', () => {
    const rows = [row({ id: 1, location: 'Remote' }), row({ id: 2, location: 'Berlin' })];
    const f = noFilter({ works: new Set(['remote']) });

    expect(filterFeedRows(rows, f, workTypeOf).map((r) => r.id)).toEqual([1]);
  });

  it('passes a row whose country is picked', () => {
    const rows = [
      row({ id: 1, location: 'Berlin, Germany' }),
      row({ id: 2, location: 'Paris, France' }),
    ];
    const f = noFilter({ countries: new Set(['Germany']) });

    expect(filterFeedRows(rows, f, workTypeOf).map((r) => r.id)).toEqual([1]);
  });

  it('passes a row whose specific city is picked without its country', () => {
    // Picking Berlin must not require picking Germany as well.
    const rows = [
      row({ id: 1, location: 'Berlin, Germany' }),
      row({ id: 2, location: 'Munich, Germany' }),
    ];
    // The key format is cityKey()'s own: "<country> <city>".
    const f = noFilter({ countries: new Set(['Germany Berlin']) });

    expect(filterFeedRows(rows, f, workTypeOf).map((r) => r.id)).toEqual([1]);
  });

  it('files a row with no recognisable country under Other', () => {
    const rows = [row({ id: 1, location: null })];

    expect(
      filterFeedRows(rows, noFilter({ countries: new Set(['Other']) }), workTypeOf),
    ).toHaveLength(1);
  });

  it('applies every active filter together, not the last one only', () => {
    const rows = [
      row({ id: 1, title: 'Rust Engineer', location: 'Remote', saved: false }),
      row({ id: 2, title: 'Rust Engineer', location: 'Berlin', saved: false }),
      row({ id: 3, title: 'Go Engineer', location: 'Remote', saved: false }),
    ];
    const f = noFilter({ query: 'rust', works: new Set(['remote']), tab: 'new' });

    expect(filterFeedRows(rows, f, workTypeOf).map((r) => r.id)).toEqual([1]);
  });
});

describe('splitFeedSections', () => {
  const labels = { forYou: 'For you', more: 'More openings' };
  const matches = (r: { id: number }) => r.id < 10;
  const tierRank = (r: { id: number }) => r.id;

  it('returns one unlabelled section when the profile has no keywords', () => {
    // Nothing to rank against, so buckets would be arbitrary.
    const rows = [row({ id: 1 }), row({ id: 2 })];

    expect(splitFeedSections(rows, false, matches, tierRank, labels)).toEqual([
      { key: 'more', label: '', rows, total: 2 },
    ]);
  });

  it('splits matched rows into For you and the rest into More openings', () => {
    const rows = [row({ id: 1 }), row({ id: 11 }), row({ id: 2 })];

    const out = splitFeedSections(rows, true, matches, tierRank, labels);

    expect(out.map((s) => s.key)).toEqual(['foryou', 'more']);
    expect(out[0].rows.map((r) => r.id)).toEqual([2, 1]);
    expect(out[1].rows.map((r) => r.id)).toEqual([11]);
  });

  it('ranks For you by tier first and recency second', () => {
    const rows = [
      row({ id: 1, createdAt: '2026-03-01' }),
      row({ id: 1, createdAt: '2026-05-01' }),
      row({ id: 5, createdAt: '2026-01-01' }),
    ];

    const [forYou] = splitFeedSections(rows, true, matches, tierRank, labels);

    expect(forYou.rows.map((r) => r.createdAt)).toEqual(['2026-01-01', '2026-05-01', '2026-03-01']);
  });

  it('drops the More header when nothing matched, so it reads as a plain list', () => {
    const rows = [row({ id: 11 }), row({ id: 12 })];

    const out = splitFeedSections(rows, true, matches, tierRank, labels);

    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('more');
    expect(out[0].label).toBe('');
  });

  it('keeps the For you header when everything matched', () => {
    // The mirror case: a single For-you section keeps its label, because the
    // label is the only thing saying why these rows are first.
    const out = splitFeedSections([row({ id: 1 })], true, matches, tierRank, labels);

    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('foryou');
    expect(out[0].label).toBe('For you');
  });

  it('reports the full count, independent of any render window', () => {
    const rows = [row({ id: 1 }), row({ id: 2 }), row({ id: 11 })];

    const out = splitFeedSections(rows, true, matches, tierRank, labels);

    expect(out.map((s) => s.total)).toEqual([2, 1]);
  });

  it('does not mutate the rows it was given', () => {
    const rows = [row({ id: 2 }), row({ id: 1 })];
    const order = rows.map((r) => r.id);

    splitFeedSections(rows, true, matches, tierRank, labels);

    expect(rows.map((r) => r.id)).toEqual(order);
  });
});

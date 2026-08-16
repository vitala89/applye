import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { type Archetype } from '@applye/core';
import { type FeedRow } from './discover-feed.store';
import { DiscoverProfileContextStore } from './discover-profile-context.store';
import { DiscoverRowMatchStore } from './discover-row-match.store';

describe('DiscoverRowMatchStore', () => {
  let store: DiscoverRowMatchStore;
  let archetypes: ReturnType<typeof signal<Archetype[]>>;
  let keywords: ReturnType<typeof signal<string[]>>;

  const angular: Archetype = { name: 'Angular', fit: 'primary', sellWhen: '' };
  const react: Archetype = { name: 'React', fit: 'adjacent', sellWhen: '' };

  function row(id: number, title: string): FeedRow {
    return { id, title, company: 'c', location: null, dismissed: false } as unknown as FeedRow;
  }

  beforeEach(() => {
    archetypes = signal<Archetype[]>([angular, react]);
    keywords = signal<string[]>(['angular', 'signals', 'rxjs', 'nx', 'typescript']);

    // Only the profile context. The absence of a feed provider here is the
    // property that lets DiscoverFeedStore depend on this store without closing
    // a cycle - a fixture appearing in this list would be the first sign it had
    // stopped holding.
    TestBed.configureTestingModule({
      providers: [
        DiscoverRowMatchStore,
        { provide: DiscoverProfileContextStore, useValue: { archetypes, keywords } },
      ],
    });
    store = TestBed.inject(DiscoverRowMatchStore);
  });

  it('matches a row against the profile archetypes, by title', () => {
    expect(store.badgeFor(row(1, 'Senior Angular Engineer'))?.fit).toBe('primary');
    expect(store.badgeFor(row(2, 'Rust Systems Engineer'))).toBeNull();
  });

  it('reports whether a row belongs in "For you"', () => {
    expect(store.matchesProfile(row(1, 'Senior Angular Engineer'))).toBe(true);
    expect(store.matchesProfile(row(2, 'Rust Systems Engineer'))).toBe(false);
  });

  it('ranks a primary match above an adjacent one, and a miss at zero', () => {
    const primary = store.tierRankFor(row(1, 'Angular Developer'));
    const adjacent = store.tierRankFor(row(2, 'React Developer'));

    expect(primary).toBeGreaterThan(adjacent);
    expect(adjacent).toBeGreaterThan(0);
    expect(store.tierRankFor(row(3, 'Rust Systems Engineer'))).toBe(0);
  });

  it('handles a row with no title rather than throwing', () => {
    expect(store.badgeFor({ id: 4 } as unknown as FeedRow)).toBeNull();
  });

  describe('the memo', () => {
    // The reason for caching is that a template calls these once per row per
    // change-detection pass, and matchArchetype tokenises the whole list each
    // time. Two calls for one row must reach it once.
    it('answers a repeated row from cache', () => {
      const r = row(1, 'Senior Angular Engineer');

      expect(store.badgeFor(r)).toBe(store.badgeFor(r));
    });

    // Keyed on the list's identity, so editing the profile's target roles
    // re-matches every row instead of serving the previous answer forever.
    it('drops the cache when the archetype list is replaced', () => {
      const r = row(1, 'Senior Angular Engineer');
      expect(store.badgeFor(r)?.fit).toBe('primary');

      archetypes.set([{ ...angular, fit: 'secondary' }]);

      expect(store.badgeFor(r)?.fit).toBe('secondary');
    });
  });

  describe('matchedKeywords', () => {
    it('returns the profile keywords the title contains, upper cased', () => {
      expect(store.matchedKeywords(row(1, 'Angular and RxJS engineer'))).toEqual([
        'ANGULAR',
        'RXJS',
      ]);
    });

    // The row has room for four badges.
    it('stops at four', () => {
      const all = 'angular signals rxjs nx typescript';

      expect(store.matchedKeywords(row(1, all))).toHaveLength(4);
    });

    it('returns nothing when the title matches none of them', () => {
      expect(store.matchedKeywords(row(1, 'Rust Systems Engineer'))).toEqual([]);
    });
  });
});

import { Injectable, inject } from '@angular/core';
import { type Archetype, type ArchetypeMatch, matchArchetype, tierRank } from '@applye/core';
import { DiscoverProfileContextStore } from './discover-profile-context.store';
import { type FeedRow } from './discover-feed.store';

/**
 * How a Discover row reads against the profile: which target archetype it
 * matches, how strongly, and which of the profile's keywords its title contains.
 *
 * **It holds no feed reference**, and that is the point rather than an accident.
 * `DiscoverFeedStore` sections its rows by these answers, so it will depend on
 * this store - and a store that read the feed back would close the cycle. The
 * same rule `DiscoverFiltersStore` follows, for the same reason (ADR-0005).
 *
 * That is why the memo below is keyed lazily per row instead of being a
 * `computed` over the feed's rows, which is what it was on the page. The reason
 * for memoising is unchanged: `matchArchetype` tokenises every archetype against
 * the title, and a template calls these once per row per change-detection pass.
 */
@Injectable()
export class DiscoverRowMatchStore {
  private readonly context = inject(DiscoverProfileContextStore);

  private cache = new Map<number, ArchetypeMatch | null>();
  /**
   * The archetype list the cache was filled for. Compared by identity, not by
   * contents: `archetypes` is a signal holding a replaced array, so a new list
   * is a new reference and a re-render with the same list is not.
   */
  private cachedFor: readonly Archetype[] | null = null;

  /** Best-fit archetype for a row. Title only - the feed does not load the JD. */
  badgeFor(row: FeedRow): ArchetypeMatch | null {
    const list = this.context.archetypes();
    if (this.cachedFor !== list) {
      this.cache = new Map();
      this.cachedFor = list;
    }
    const hit = this.cache.get(row.id);
    if (hit !== undefined) return hit;
    const match = matchArchetype(row.title ?? '', list);
    this.cache.set(row.id, match);
    return match;
  }

  /** Whether the row belongs in "For you" rather than "More openings". */
  matchesProfile(row: FeedRow): boolean {
    return this.badgeFor(row) !== null;
  }

  /** How strongly it matches, for sorting within "For you". Zero for no match. */
  tierRankFor(row: FeedRow): number {
    const m = this.badgeFor(row);
    return m ? tierRank(m.fit) : 0;
  }

  /**
   * Up to four of the profile's keywords that the row's title contains, upper
   * cased for the badges. Four because the row has room for four.
   */
  matchedKeywords(row: FeedRow): string[] {
    const title = (row.title ?? '').toLowerCase();
    return this.context
      .keywords()
      .filter((kw) => title.includes(kw))
      .slice(0, 4)
      .map((kw) => kw.toUpperCase());
  }
}

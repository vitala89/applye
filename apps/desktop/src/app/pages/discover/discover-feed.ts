import { type FeedRow, cityKey } from '@applye/application';
import { OTHER_COUNTRY, classifyLoc } from './discover-location';

/**
 * The row shape is the feed store's - it owns the rows and the triage state.
 * Re-exported because this module and its consumers are the page's vocabulary
 * for one, and importing it from two places would read as two types.
 */
export type { FeedRow };

/**
 * The archetype badge as the page resolved it: the tier and its label.
 *
 * Lives here rather than on a component because the feed row and the detail
 * hero both render it, and neither owns the other.
 */
export interface RowArchetype {
  fit: string;
  label: string;
}

export interface FeedSection {
  key: 'foryou' | 'more';
  label: string;
  /** Rows to render now (windowed by the incremental pager). */
  rows: FeedRow[];
  /** Full row count in this section, independent of the render window. */
  total: number;
}

/** Everything the feed filters on, as the controls currently stand. */
export interface FeedFilter {
  query: string;
  /** Readonly throughout: the filter reads the selection signals, never edits them. */
  sources: ReadonlySet<string>;
  works: ReadonlySet<string>;
  /** Country names, plus `cityKey()` values for a specific city. */
  countries: ReadonlySet<string>;
  tab: string;
}

/**
 * The feed narrowed to what the current controls admit.
 *
 * `workTypeOf` is passed in rather than imported: the component decides what
 * counts as remote, and that rule reads more than the location string.
 *
 * A dismissed row always survives. It renders as a transient "Dismissed - Undo"
 * strip, so a filter that could remove it would take the undo with it.
 */
export function filterFeedRows(
  rows: FeedRow[],
  filter: FeedFilter,
  workTypeOf: (location: string | null) => string,
): FeedRow[] {
  const query = filter.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (row.dismissed) return true;
    if (filter.tab === 'new' && row.saved) return false;

    if (query) {
      const hay = `${row.title ?? ''} ${row.company ?? ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }

    if (filter.sources.size > 0 && (row.source === null || !filter.sources.has(row.source))) {
      return false;
    }

    if (filter.works.size > 0 && !filter.works.has(workTypeOf(row.location))) return false;

    if (filter.countries.size > 0) {
      const loc = classifyLoc(row.location);
      // Pass when the job's country is picked, or its specific city is.
      const byCountry = filter.countries.has(loc.country || OTHER_COUNTRY);
      const byCity = !!loc.city && filter.countries.has(cityKey(loc.country, loc.city));
      if (!byCountry && !byCity) return false;
    }

    return true;
  });
}

/**
 * The feed split into "For you" - the rows matching the profile's target roles -
 * and "More openings".
 *
 * A soft ranking, never a hard filter: everything the filters admitted is still
 * shown, in one bucket or the other. With no target roles set there is nothing
 * to rank against, so a single unlabelled section holds everything rather than
 * showing a confusing or empty header.
 *
 * `matches` and `tierRank` are supplied by the caller because both read the
 * archetype cache the component owns.
 */
export function splitFeedSections(
  rows: FeedRow[],
  hasProfileKeywords: boolean,
  matches: (row: FeedRow) => boolean,
  tierRank: (row: FeedRow) => number,
  labels: { forYou: string; more: string },
): FeedSection[] {
  if (!hasProfileKeywords) {
    return [{ key: 'more', label: '', rows, total: rows.length }];
  }

  const forYou = rows.filter(matches).sort((a, b) => {
    const byTier = tierRank(b) - tierRank(a);
    if (byTier !== 0) return byTier;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
  const more = rows.filter((r) => !matches(r));

  const out: FeedSection[] = [];
  if (forYou.length) {
    out.push({ key: 'foryou', label: labels.forYou, rows: forYou, total: forYou.length });
  }
  if (more.length) {
    out.push({ key: 'more', label: labels.more, rows: more, total: more.length });
  }

  // Nothing matched the profile -> drop the "More" header so it reads as a
  // plain list rather than a lonely second-tier section. A lone "For you"
  // keeps its label, because the label is the only thing saying why those rows
  // come first.
  if (out.length === 1 && out[0].key === 'more') {
    out[0] = { ...out[0], label: '' };
  }
  return out;
}

/**
 * The Locations filter's tree: how the region -> country -> city options are
 * built from the feed, and how a checkbox at any level reads and writes the
 * one flat selection set behind them.
 *
 * The set holds two kinds of key: a country name ("Germany") and a city key
 * ("Germany Berlin"), and every level's state is derived from it rather than
 * stored. That is why this is worth its own module - the tri-states are the
 * only place in Discover where one click has to reason about what its children
 * already are, and they had no tests while they lived on the page.
 *
 * Recognising a location is a different job, and stays in `discover-location`.
 */

import { type FeedRow } from './discover-feed';
import {
  OTHER_COUNTRY,
  REGION_ORDER,
  type RegionKey,
  cityKey,
  classifyLoc,
} from './discover-location';

/** One country row in the Locations popover, with the cities actually seen. */
export interface CountryNode {
  name: string;
  cities: string[];
}

/** One region row in the Locations popover, with the countries actually seen. */
export interface RegionGroup {
  key: RegionKey;
  countries: CountryNode[];
}

/**
 * A checkbox that has children is one of three things, and "some" is what the
 * indeterminate state renders.
 */
export type SelectionState = 'none' | 'some' | 'all';

/**
 * The Locations tree, built from the locations the feed actually contains, in
 * `REGION_ORDER`. Countries sort by name and cities alphabetically, so the list
 * does not reshuffle as rows arrive.
 *
 * Dismissed rows contribute nothing - they are not in the list being filtered.
 * Anything `classifyLoc` cannot place (remote-only, empty, unrecognised text)
 * rolls into a single "Other" group pinned last: a normal selectable option,
 * never an always-pass.
 */
export function buildRegionGroups(rows: readonly FeedRow[]): RegionGroup[] {
  // region -> (country -> set of cities)
  const byRegion = new Map<RegionKey, Map<string, Set<string>>>();
  let hasOther = false;

  for (const row of rows) {
    if (row.dismissed) continue;
    const loc = classifyLoc(row.location);
    if (!loc.country) {
      hasOther = true;
      continue;
    }
    let countries = byRegion.get(loc.region);
    if (!countries) {
      countries = new Map();
      byRegion.set(loc.region, countries);
    }
    let cities = countries.get(loc.country);
    if (!cities) {
      cities = new Set();
      countries.set(loc.country, cities);
    }
    if (loc.city) cities.add(loc.city);
  }

  const groups: RegionGroup[] = [];
  for (const key of REGION_ORDER) {
    if (key === 'other') continue;
    const countries = byRegion.get(key);
    if (!countries || !countries.size) continue;
    const nodes: CountryNode[] = [...countries.entries()]
      .map(([name, cities]) => ({ name, cities: [...cities].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ key, countries: nodes });
  }
  if (hasOther) groups.push({ key: 'other', countries: [{ name: OTHER_COUNTRY, cities: [] }] });
  return groups;
}

/**
 * A country against the cities of it the feed contains.
 *
 * The country's own key is a separate selection from any of its cities - it is
 * what "everywhere in Germany, including places not listed" means - so "all"
 * requires the country key *and* every city, and either one alone is "some".
 * A country with no cities in the feed has nothing to be partial about.
 */
export function countrySelectionState(
  selected: ReadonlySet<string>,
  node: CountryNode,
): SelectionState {
  const self = selected.has(node.name);
  if (!node.cities.length) return self ? 'all' : 'none';
  const on = node.cities.filter((c) => selected.has(cityKey(node.name, c))).length;
  if (self && on === node.cities.length) return 'all';
  if (self || on > 0) return 'some';
  return 'none';
}

/** A region against its countries: unanimous either way, or partial. */
export function regionSelectionState(
  selected: ReadonlySet<string>,
  group: RegionGroup,
): SelectionState {
  const states = group.countries.map((n) => countrySelectionState(selected, n));
  if (states.every((s) => s === 'all')) return 'all';
  if (states.every((s) => s === 'none')) return 'none';
  return 'some';
}

function applied(
  selected: ReadonlySet<string>,
  nodes: readonly CountryNode[],
  turnOn: boolean,
): ReadonlySet<string> {
  const next = new Set(selected);
  for (const node of nodes) {
    const keys = [node.name, ...node.cities.map((c) => cityKey(node.name, c))];
    for (const key of keys) {
      if (turnOn) next.add(key);
      else next.delete(key);
    }
  }
  return next;
}

/**
 * The country checkbox moves the country and all its cities together, and
 * anything short of "all" turns the whole subtree on - so a partial country
 * completes rather than clearing, which is what a half-checked box invites.
 */
export function withCountryToggled(
  selected: ReadonlySet<string>,
  node: CountryNode,
): ReadonlySet<string> {
  return applied(selected, [node], countrySelectionState(selected, node) !== 'all');
}

/** The region checkbox, on the same rule, over every country it holds. */
export function withRegionToggled(
  selected: ReadonlySet<string>,
  group: RegionGroup,
): ReadonlySet<string> {
  return applied(selected, group.countries, regionSelectionState(selected, group) !== 'all');
}

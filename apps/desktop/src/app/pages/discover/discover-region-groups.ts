/**
 * The Locations filter's tree, built from the locations the feed actually
 * contains.
 *
 * It stays in the Discover page rather than beside the tri-state rules it feeds,
 * because it calls `classifyLoc`, and `classifyLoc` reads the 811-line location
 * vocabulary. `libs/application` is imported by the eagerly-loaded shell, so a
 * copy of that table there costs every launch about 13 kB for a screen most
 * sessions never open - measured, as an initial-bundle budget failure, not
 * guessed. The rules that have no such dependency did move: the tri-states are
 * in `@applye/application`.
 */

import {
  type CountryNode,
  type FeedRow,
  type RegionGroup,
  type RegionKey,
} from '@applye/application';
import { OTHER_COUNTRY, REGION_ORDER, classifyLoc } from './discover-location';

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

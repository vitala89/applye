import { type FeedRow } from '@applye/application';
import { OTHER_COUNTRY } from './discover-location';
import { buildRegionGroups } from './discover-region-groups';

function row(location: string | null, dismissed = false): FeedRow {
  return { id: 1, title: 't', company: 'c', location, dismissed } as unknown as FeedRow;
}

describe('buildRegionGroups', () => {
  it('lists only the countries and cities the feed actually names', () => {
    const groups = buildRegionGroups([row('Berlin, Germany'), row('Paris, France')]);
    expect(groups.map((g) => g.key)).toEqual(['europe']);
    expect(groups[0].countries).toEqual([
      { name: 'France', cities: ['Paris'] },
      { name: 'Germany', cities: ['Berlin'] },
    ]);
  });

  /** The list must not reshuffle as rows arrive, so both levels are sorted. */
  it('sorts countries by name and cities alphabetically, whatever order rows arrive in', () => {
    const groups = buildRegionGroups([
      row('Munich, Germany'),
      row('Paris, France'),
      row('Berlin, Germany'),
    ]);
    expect(groups[0].countries.map((c) => c.name)).toEqual(['France', 'Germany']);
    expect(groups[0].countries[1].cities).toEqual(['Berlin', 'Munich']);
  });

  it('groups by region, in REGION_ORDER rather than order of appearance', () => {
    const groups = buildRegionGroups([row('Austin, TX'), row('Berlin, Germany')]);
    expect(groups.map((g) => g.key)).toEqual(['europe', 'namerica']);
  });

  /** A dismissed row is not in the list being filtered, so it offers no option. */
  it('ignores dismissed rows', () => {
    expect(buildRegionGroups([row('Paris, France', true)])).toEqual([]);
  });

  it('collects everything unrecognised into one Other group, pinned last', () => {
    const groups = buildRegionGroups([row('Remote'), row(null), row('Berlin, Germany')]);
    expect(groups.map((g) => g.key)).toEqual(['europe', 'other']);
    expect(groups[1].countries).toEqual([{ name: OTHER_COUNTRY, cities: [] }]);
  });

  it('adds no Other group when every location was placed', () => {
    expect(buildRegionGroups([row('Berlin, Germany')]).map((g) => g.key)).toEqual(['europe']);
  });
});

/**
 * The country's own key means "everywhere in this country, including places the
 * feed has not named", so it is a separate selection from any of its cities.
 * That is what makes "all" require both, and either alone only "some".
 */

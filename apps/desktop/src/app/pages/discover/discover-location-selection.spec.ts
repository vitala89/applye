import { type FeedRow } from './discover-feed';
import { OTHER_COUNTRY, cityKey } from './discover-location';
import {
  type CountryNode,
  type RegionGroup,
  buildRegionGroups,
  countrySelectionState,
  regionSelectionState,
  withCountryToggled,
  withRegionToggled,
} from './discover-location-selection';

function row(location: string | null, dismissed = false): FeedRow {
  return { id: 1, title: 't', company: 'c', location, dismissed } as unknown as FeedRow;
}

const germany: CountryNode = { name: 'Germany', cities: ['Berlin', 'Munich'] };
const france: CountryNode = { name: 'France', cities: ['Paris'] };
/** A country the feed named without ever naming a city in it. */
const other: CountryNode = { name: OTHER_COUNTRY, cities: [] };
const europe: RegionGroup = { key: 'europe', countries: [germany, france] };

function sel(...keys: string[]): ReadonlySet<string> {
  return new Set(keys);
}

const BERLIN = cityKey('Germany', 'Berlin');
const MUNICH = cityKey('Germany', 'Munich');
const PARIS = cityKey('France', 'Paris');

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
describe('countrySelectionState', () => {
  it('is all or none for a country the feed named no city in', () => {
    expect(countrySelectionState(sel(), other)).toBe('none');
    expect(countrySelectionState(sel(OTHER_COUNTRY), other)).toBe('all');
  });

  it('is none when neither the country nor any of its cities is selected', () => {
    expect(countrySelectionState(sel(), germany)).toBe('none');
    expect(countrySelectionState(sel('France', PARIS), germany)).toBe('none');
  });

  it('is some for the country alone, and some for cities alone', () => {
    expect(countrySelectionState(sel('Germany'), germany)).toBe('some');
    expect(countrySelectionState(sel(BERLIN), germany)).toBe('some');
    expect(countrySelectionState(sel(BERLIN, MUNICH), germany)).toBe('some');
  });

  it('is all only with the country and every one of its cities', () => {
    expect(countrySelectionState(sel('Germany', BERLIN), germany)).toBe('some');
    expect(countrySelectionState(sel('Germany', BERLIN, MUNICH), germany)).toBe('all');
  });
});

describe('regionSelectionState', () => {
  it('is none, all, or some according to its countries unanimously or not', () => {
    expect(regionSelectionState(sel(), europe)).toBe('none');
    expect(regionSelectionState(sel('Germany', BERLIN, MUNICH, 'France', PARIS), europe)).toBe(
      'all',
    );
    expect(regionSelectionState(sel('France', PARIS), europe)).toBe('some');
    expect(regionSelectionState(sel(BERLIN), europe)).toBe('some');
  });
});

describe('withCountryToggled', () => {
  it('turns the country and every one of its cities on together', () => {
    expect([...withCountryToggled(sel(), germany)].sort()).toEqual(
      ['Germany', BERLIN, MUNICH].sort(),
    );
  });

  /** A half-checked box invites completion, not clearing. */
  it('completes a partial country rather than clearing it', () => {
    expect([...withCountryToggled(sel(BERLIN), germany)].sort()).toEqual(
      ['Germany', BERLIN, MUNICH].sort(),
    );
  });

  it('clears the subtree only from all', () => {
    expect([...withCountryToggled(sel('Germany', BERLIN, MUNICH), germany)]).toEqual([]);
  });

  it('leaves every other country alone', () => {
    const next = withCountryToggled(sel('France', PARIS), germany);
    expect(next.has('France')).toBe(true);
    expect(next.has(PARIS)).toBe(true);
  });
});

describe('withRegionToggled', () => {
  it('turns every country and city in the region on', () => {
    expect([...withRegionToggled(sel(), europe)].sort()).toEqual(
      ['France', 'Germany', BERLIN, MUNICH, PARIS].sort(),
    );
  });

  it('completes a partial region rather than clearing it', () => {
    expect([...withRegionToggled(sel('France', PARIS), europe)].sort()).toEqual(
      ['France', 'Germany', BERLIN, MUNICH, PARIS].sort(),
    );
  });

  it('clears the whole region only from all', () => {
    const all = sel('France', 'Germany', BERLIN, MUNICH, PARIS);
    expect([...withRegionToggled(all, europe)]).toEqual([]);
  });

  it('leaves selections outside the region alone', () => {
    const next = withRegionToggled(sel('Japan'), europe);
    expect(next.has('Japan')).toBe(true);
  });
});

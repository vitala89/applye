import {
  type CountryNode,
  type RegionGroup,
  cityKey,
  countrySelectionState,
  regionSelectionState,
  withCountryToggled,
  withRegionToggled,
} from './discover-location-selection';

const germany: CountryNode = { name: 'Germany', cities: ['Berlin', 'Munich'] };
const france: CountryNode = { name: 'France', cities: ['Paris'] };
/**
 * A country the feed named without ever naming a city in it.
 *
 * Spelled out rather than imported from `OTHER_COUNTRY`, which lives with the
 * location recogniser in the Discover page: these rules do not know that the
 * bucket is special, and a test that borrowed the constant would imply they do.
 */
const OTHER = 'Other';
const other: CountryNode = { name: OTHER, cities: [] };
const europe: RegionGroup = { key: 'europe', countries: [germany, france] };

function sel(...keys: string[]): ReadonlySet<string> {
  return new Set(keys);
}

const BERLIN = cityKey('Germany', 'Berlin');
const MUNICH = cityKey('Germany', 'Munich');
const PARIS = cityKey('France', 'Paris');

describe('countrySelectionState', () => {
  it('is all or none for a country the feed named no city in', () => {
    expect(countrySelectionState(sel(), other)).toBe('none');
    expect(countrySelectionState(sel(OTHER), other)).toBe('all');
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

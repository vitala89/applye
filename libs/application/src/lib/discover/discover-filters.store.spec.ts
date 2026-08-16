import { TestBed } from '@angular/core/testing';
import { DiscoverFiltersStore } from './discover-filters.store';
import { type CountryNode, type RegionGroup, cityKey } from './discover-location-selection';

describe('DiscoverFiltersStore', () => {
  let store: DiscoverFiltersStore;

  const germany: CountryNode = { name: 'Germany', cities: ['Berlin', 'Munich'] };
  const france: CountryNode = { name: 'France', cities: ['Paris'] };
  const europe: RegionGroup = { key: 'europe', countries: [germany, france] };
  const BERLIN = cityKey('Germany', 'Berlin');
  const MUNICH = cityKey('Germany', 'Munich');

  beforeEach(() => {
    // No providers: the store depends on nothing, which is the property that
    // keeps the arrow to `DiscoverFeedStore` pointing one way. A spec that
    // needed a feed fixture here would be the first sign that had stopped
    // being true.
    TestBed.configureTestingModule({ providers: [DiscoverFiltersStore] });
    store = TestBed.inject(DiscoverFiltersStore);
  });

  it('starts with everything unfiltered, on the new tab', () => {
    expect(store.query()).toBe('');
    expect(store.tab()).toBe('new');
    expect(store.sourceCount()).toBe(0);
    expect(store.typeCount()).toBe(0);
    expect(store.countryCount()).toBe(0);
  });

  describe('work types', () => {
    it('toggles one on and back off', () => {
      store.toggleWork('remote');

      expect(store.workChecked('remote')).toBe(true);
      expect(store.typeCount()).toBe(1);

      store.toggleWork('remote');

      expect(store.workChecked('remote')).toBe(false);
      expect(store.typeCount()).toBe(0);
    });

    it('clears every selection at once', () => {
      store.toggleWork('remote');
      store.toggleWork('onsite');

      store.clearWork();

      expect(store.typeCount()).toBe(0);
      expect(store.workChecked('remote')).toBe(false);
    });

    it('offers the three types in menu order', () => {
      expect(store.allWorkTypes).toEqual(['remote', 'hybrid', 'onsite']);
    });
  });

  describe('sources', () => {
    it('toggles and clears independently of the other filters', () => {
      store.toggleWork('remote');
      store.toggleSourceFilter('RemoteOK');

      expect(store.sourceChecked('RemoteOK')).toBe(true);

      store.clearSources();

      expect(store.sourceCount()).toBe(0);
      // Clearing one filter must not clear another - each button owns its own.
      expect(store.typeCount()).toBe(1);
    });
  });

  describe('the location tree', () => {
    // Expansion is what the chevron does; selection is what the checkbox does.
    // They share a row and nothing else, and conflating them would make opening
    // a country select it.
    it('expands a region without selecting anything', () => {
      store.toggleRegionExpand('europe');

      expect(store.regionExpanded('europe')).toBe(true);
      expect(store.countryCount()).toBe(0);
    });

    it('expands a country without selecting anything', () => {
      store.toggleCountryExpand('Germany');

      expect(store.countryExpanded('Germany')).toBe(true);
      expect(store.countryCount()).toBe(0);
    });

    it('selects a single city under its country key', () => {
      store.toggleCity('Germany', 'Berlin');

      expect(store.cityChecked('Germany', 'Berlin')).toBe(true);
      expect(store.cityChecked('Germany', 'Munich')).toBe(false);
      expect(store.countrySel()).toEqual(new Set([BERLIN]));
    });

    // A half-checked box invites completion, not clearing - the rule the
    // tri-state functions encode, pinned here through the store's own surface.
    it('completes a partly selected country rather than clearing it', () => {
      store.toggleCity('Germany', 'Berlin');

      expect(store.countryState(germany)).toBe('some');

      store.toggleCountryTree(germany);

      expect(store.countryState(germany)).toBe('all');
      expect(store.countrySel()).toEqual(new Set(['Germany', BERLIN, MUNICH]));
    });

    it('turns a fully selected country off', () => {
      store.toggleCountryTree(germany);
      store.toggleCountryTree(germany);

      expect(store.countryState(germany)).toBe('none');
      expect(store.countryCount()).toBe(0);
    });

    it('reports a region by its countries, and toggles them together', () => {
      expect(store.regionState(europe)).toBe('none');

      store.toggleCountryTree(germany);

      expect(store.regionState(europe)).toBe('some');

      store.toggleRegion(europe);

      expect(store.regionState(europe)).toBe('all');
    });

    it('clears the location selection but leaves the tree expanded', () => {
      store.toggleRegionExpand('europe');
      store.toggleCountryTree(germany);

      store.clearLocations();

      expect(store.countryCount()).toBe(0);
      // The popover should not collapse under the user because they cleared a
      // selection - the chevron is theirs.
      expect(store.regionExpanded('europe')).toBe(true);
    });
  });
});

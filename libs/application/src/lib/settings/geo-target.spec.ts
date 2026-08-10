import { GeoTarget, toggleMarket, toggleRegion, worldwide } from './geo-target';

/** The one rule the whole feature rests on. */
function expectAtMostOneSideSet(target: GeoTarget): void {
  expect(target.scopes.length && target.markets.length).toBeFalsy();
}

describe('geo target', () => {
  it('starts Worldwide with both sides empty', () => {
    expect(worldwide()).toEqual({ scopes: [], markets: [] });
  });

  describe('toggleRegion', () => {
    it('adds and removes regions while in region mode', () => {
      const one = toggleRegion(worldwide(), 'europe');
      expect(one).toEqual({ scopes: ['europe'], markets: [] });

      const two = toggleRegion(one, 'asia');
      expect(two.scopes).toEqual(['europe', 'asia']);

      expect(toggleRegion(two, 'europe').scopes).toEqual(['asia']);
    });

    it('falls back to Worldwide when the last region is cleared', () => {
      const one: GeoTarget = { scopes: ['europe'], markets: [] };
      expect(toggleRegion(one, 'europe')).toEqual(worldwide());
    });

    it('switches out of market mode, dropping every market', () => {
      const inMarketMode: GeoTarget = { scopes: [], markets: ['de', 'pl'] };
      const next = toggleRegion(inMarketMode, 'europe');
      expect(next).toEqual({ scopes: ['europe'], markets: [] });
      expectAtMostOneSideSet(next);
    });

    it('does not resurrect the regions that market mode had cleared', () => {
      // scopes is already empty in market mode; this pins that the function
      // never reads a stale set from anywhere else.
      const inMarketMode: GeoTarget = { scopes: ['asia'], markets: ['de'] };
      expect(toggleRegion(inMarketMode, 'europe').scopes).toEqual(['europe']);
    });
  });

  describe('toggleMarket', () => {
    it('adds and removes markets', () => {
      const one = toggleMarket(worldwide(), 'de');
      expect(one).toEqual({ scopes: [], markets: ['de'] });

      const two = toggleMarket(one, 'pl');
      expect(two.markets).toEqual(['de', 'pl']);

      expect(toggleMarket(two, 'de').markets).toEqual(['pl']);
    });

    it('switches out of region mode, dropping the region scope', () => {
      const inRegionMode: GeoTarget = { scopes: ['europe', 'asia'], markets: [] };
      const next = toggleMarket(inRegionMode, 'de');
      expect(next).toEqual({ scopes: [], markets: ['de'] });
      expectAtMostOneSideSet(next);
    });

    it('falls back to Worldwide when the last market is cleared', () => {
      const one: GeoTarget = { scopes: [], markets: ['de'] };
      expect(toggleMarket(one, 'de')).toEqual(worldwide());
    });
  });

  it('never leaves both sides set, whatever the sequence', () => {
    let target = worldwide();
    const steps: Array<() => void> = [
      () => (target = toggleRegion(target, 'europe')),
      () => (target = toggleMarket(target, 'de')),
      () => (target = toggleRegion(target, 'asia')),
      () => (target = toggleMarket(target, 'pl')),
      () => (target = toggleMarket(target, 'ua')),
      () => (target = toggleRegion(target, 'africa')),
      () => (target = toggleRegion(target, 'africa')),
    ];
    for (const step of steps) {
      step();
      expectAtMostOneSideSet(target);
    }
    expect(target).toEqual(worldwide());
  });
});

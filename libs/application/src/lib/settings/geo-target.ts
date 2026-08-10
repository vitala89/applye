/**
 * The geo-target state machine behind Settings' Job search section.
 *
 * "Where do you want to work?" is answered in exactly one of two modes, and
 * the invariant every function here preserves is that **at most one side is
 * non-empty**:
 *
 *   { scopes: [],            markets: [] }        -> Worldwide
 *   { scopes: ['europe'],    markets: [] }        -> regions
 *   { scopes: [],            markets: ['de'] }    -> local markets
 *
 * Kept pure and tested because the bug this replaced was exactly an invariant
 * failure: a market could be picked while the continent chips stayed checked
 * and scanning, so "France" quietly meant "France plus all of Europe".
 */
import { GeoScopeKey, LocalMarket } from '@applye/core';

export interface GeoTarget {
  scopes: GeoScopeKey[];
  markets: LocalMarket[];
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** No restriction at all - what both sides being empty renders as. */
export function worldwide(): GeoTarget {
  return { scopes: [], markets: [] };
}

/**
 * Toggles one region, switching to region mode. Any selected market is
 * dropped; the regions it had cleared do not come back, so the starting point
 * while in market mode is an empty region set, not a stale one.
 */
export function toggleRegion(current: GeoTarget, key: GeoScopeKey): GeoTarget {
  const base = current.markets.length ? [] : current.scopes;
  return { scopes: toggle(base, key), markets: [] };
}

/**
 * Toggles one market, switching to market mode and dropping the region scope.
 * Clearing the last market leaves both sides empty, which is Worldwide.
 */
export function toggleMarket(current: GeoTarget, market: LocalMarket): GeoTarget {
  return { scopes: [], markets: toggle(current.markets, market) };
}

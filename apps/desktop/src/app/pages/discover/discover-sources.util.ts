/**
 * Which built-in Discover sources the Sources drawer shows for the selected
 * local markets.
 *
 * Pure and unit-tested on purpose: the rules below are small but each one
 * exists because its absence was a bug, and they are easy to re-break from
 * inside the component.
 */
import { DiscoverSource } from '@applye/core';

/** The only fields the market rules read. */
export type MarketFilterable = Pick<DiscoverSource, 'isEnabled' | 'geoTagsJson'>;

/**
 * True when a source is tagged for any of the selected markets, or is tagged
 * worldwide (those serve every market). A tag list that is missing or not
 * readable as an array serves no market.
 */
export function sourceServesMarkets(source: MarketFilterable, markets: readonly string[]): boolean {
  let tags: unknown;
  try {
    tags = JSON.parse(source.geoTagsJson ?? '[]');
  } catch {
    return false;
  }
  if (!Array.isArray(tags)) return false;
  return tags.includes('worldwide') || markets.some((m) => tags.includes(m));
}

/**
 * Narrows built-in sources to the selected markets. No markets selected means
 * no narrowing at all.
 *
 * An **enabled** source is always kept, whatever its tags: the scan runs every
 * enabled source, so hiding one would leave it quietly fetching from a server
 * the user can no longer see listed, let alone switch off. Nothing this app
 * talks to may be invisible.
 */
export function narrowBuiltinsByMarkets<T extends MarketFilterable>(
  builtins: readonly T[],
  markets: readonly string[],
): T[] {
  if (!markets.length) return [...builtins];
  return builtins.filter((s) => s.isEnabled || sourceServesMarkets(s, markets));
}

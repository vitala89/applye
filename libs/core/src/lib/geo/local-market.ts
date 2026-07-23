/**
 * Local market — narrows which built-in Discover sources are shown by
 * default (Sources drawer) without touching `geoScope`, which stays the
 * wide "which continents to scan" layer. `null` means no local market: the
 * user relies on geoScope alone. Values are lowercase ISO 3166-1 alpha-2,
 * matching the convention already used in `sources.geo_tags_json` (e.g.
 * `"de"`, `"worldwide"`).
 */
export type LocalMarket = 'de' | 'gb' | 'us' | 'ru' | 'es' | 'fr' | 'ua' | 'pl';

export const LOCAL_MARKETS: readonly LocalMarket[] = [
  'de',
  'gb',
  'us',
  'ru',
  'es',
  'fr',
  'ua',
  'pl',
];

export function isLocalMarket(value: string | null | undefined): value is LocalMarket {
  return !!value && (LOCAL_MARKETS as readonly string[]).includes(value);
}

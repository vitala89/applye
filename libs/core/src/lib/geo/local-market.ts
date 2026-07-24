/**
 * Local markets - the narrow half of "where to look for openings".
 *
 * Geo targeting has exactly two mutually exclusive modes, and the pair
 * (`geoScope`, `market`) encodes which one is active:
 *
 * - **Regions**: `market` empty, `geoScope` holds continent keys (or is also
 *   empty, which renders as Worldwide - no restriction at all).
 * - **Local markets**: `market` holds ISO 3166-1 alpha-2 codes, and
 *   `geoScope` is cleared. Regions then take no part in the scan.
 *
 * Both are never non-empty at once: Settings clears one when the user picks
 * the other, and the scan engine reads `market` first and only falls back to
 * `geoScope` when it is empty.
 *
 * Codes are lowercase, matching the convention already used in
 * `sources.geo_tags_json` (e.g. `"de"`, `"worldwide"`).
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

/**
 * Parses the raw `market` settings column. Going forward this is a
 * JSON-encoded array of market codes (`["de","fr"]`), written by
 * `encodeLocalMarkets`. Installs saved between the single-market picker and
 * multi-select hold a bare scalar (`de`) instead - read those as a one-item
 * list so the existing choice survives the upgrade. Empty means "no local
 * market": the region scope is what applies.
 */
export function parseLocalMarkets(raw: string | null | undefined): LocalMarket[] {
  const text = (raw ?? '').trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter(isLocalMarket);
    }
  } catch {
    // Not JSON - fall through to the legacy single-scalar reading below.
  }
  return isLocalMarket(text) ? [text] : [];
}

export function encodeLocalMarkets(markets: readonly LocalMarket[]): string {
  return JSON.stringify(markets);
}

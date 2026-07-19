/**
 * Multi-region "where to look for openings" scope, shared between Settings
 * (the picker) and the Discover scan engine (the geo filter) - and speaking
 * the same region vocabulary as the Discover location classifier's RegionKey,
 * so a job Discover files under "South America" is the same region a user can
 * restrict scanning to here.
 */
export type GeoScopeKey =
  | 'europe'
  | 'namerica'
  | 'samerica'
  | 'asia'
  | 'oceania'
  | 'mena'
  | 'africa';

export const GEO_SCOPE_KEYS: readonly GeoScopeKey[] = [
  'europe',
  'namerica',
  'samerica',
  'asia',
  'oceania',
  'mena',
  'africa',
];

/**
 * Parses the raw `geoScope` settings column. Going forward this is a
 * JSON-encoded array of GeoScopeKey (`["europe","asia"]`), written by
 * `encodeGeoScopes`. Installs from before multi-select shipped hold a single
 * legacy scalar (`worldwide`|`europe`|`eu`|`usa`|`asia`|`custom`) instead - map
 * those onto the closest key(s) so an existing choice keeps working after the
 * upgrade. An empty array means "worldwide": no restriction.
 */
export function parseGeoScopes(raw: string | null | undefined): GeoScopeKey[] {
  const text = (raw ?? '').trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((k): k is GeoScopeKey => GEO_SCOPE_KEYS.includes(k as GeoScopeKey));
    }
  } catch {
    // Not JSON - fall through to the legacy single-scalar mapping below.
  }
  switch (text) {
    case 'europe':
    case 'eu':
      return ['europe'];
    case 'usa':
      return ['namerica'];
    case 'asia':
      return ['asia'];
    default:
      // 'worldwide' | 'custom' | anything unrecognized -> no restriction.
      return [];
  }
}

export function encodeGeoScopes(scopes: readonly GeoScopeKey[]): string {
  return JSON.stringify(scopes);
}

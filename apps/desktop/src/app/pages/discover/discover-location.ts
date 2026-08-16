/**
 * Location recognition for the Discover feed.
 *
 * Turns a free-text job location ("Berlin, Germany", "Austin, TX",
 * "Sao Paulo, Brazil", "Remote - US") into a stable {country, city, region}.
 * Anything unrecognized (remote-only, empty, unknown text) returns an empty
 * country and rolls into the Other bucket - a normal, selectable filter option,
 * never an always-pass.
 *
 * Why this shape (learn from the earlier fragile version):
 * - Country NAMES and city names match as whole words anywhere in the string,
 *   so "priorities" never triggers the city "Rio".
 * - Short CODES (ISO2, US state / Canadian province abbreviations) are ambiguous
 *   as substrings ("ca" in "Chicago", "de" in "Dresden", "in" in "engineering"),
 *   so a code matches ONLY when it is a standalone comma segment ("berlin, de")
 *   or an UPPERCASE standalone token in the original text ("Austin, TX"). Bare
 *   lowercase English words ("no", "is", "in") therefore never false-trigger.
 * - Cities are checked first (most specific), then US states / CA provinces,
 *   then country name/code, then region-generic fallbacks.
 *
 * This module is pure and unit-tested (discover-location.spec.ts) precisely so
 * we stop re-litigating location classification every few weeks.
 *
 * The vocabulary it matches against - every country, city, US state and
 * Canadian province - lives in `discover-location-tables.ts`. That half grows
 * when a board names a place a new way; the rules here change when a match
 * turns out to be ambiguous.
 */

import {
  CA_PROVINCES,
  CANADA,
  COUNTRY_DEFS,
  RegionCode,
  US_STATES,
  USA,
} from './discover-location-tables';
import { type RegionKey } from '@applye/application';

/** Deterministic classification of one free-text location. */
export interface LocClass {
  country: string;
  city: string;
  region: RegionKey;
}

/** Region display order in the Locations popover. */
export const REGION_ORDER: RegionKey[] = [
  'europe',
  'namerica',
  'samerica',
  'asia',
  'oceania',
  'mena',
  'africa',
  'other',
];

export const OTHER_COUNTRY = 'Other';

const OTHER: LocClass = { country: '', city: '', region: 'other' };

/** Whole-word match: `tok` bounded by string edges or non-alphanumerics. */
function wordHit(haystack: string, tok: string): boolean {
  const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(haystack);
}

/**
 * A short code matches only when unambiguous: either it is an entire
 * comma/pipe/slash segment ("berlin, de") or an UPPERCASE standalone token in
 * the original text ("Austin, TX"). Lowercase English words never trigger it.
 */
function codeHit(raw: string, segments: string[], code: string): boolean {
  if (segments.includes(code)) return true;
  const esc = code.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z])${esc}([^A-Za-z]|$)`).test(raw);
}

function matchStateProvince(
  low: string,
  raw: string,
  segments: string[],
  table: RegionCode[],
  country: string,
  region: RegionKey,
): LocClass | null {
  for (const s of table) {
    if (wordHit(low, s.name) || codeHit(raw, segments, s.code)) {
      return { country, city: '', region };
    }
  }
  return null;
}

/**
 * Deterministic {country, city, region} for a free-text location. Unrecognized
 * input (empty, remote-only, unknown) returns an empty country -> Other bucket.
 */
export function classifyLoc(location: string | null): LocClass {
  const raw = (location ?? '').trim();
  if (!raw) return OTHER;
  const low = raw.toLowerCase();
  const segments = low
    .split(/[,/|·•;(){}[\]]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 1. City (most specific) - resolves both the country and the city.
  for (const def of COUNTRY_DEFS) {
    for (const city of def.cities ?? []) {
      if (city.tokens.some((tok) => wordHit(low, tok))) {
        return { country: def.name, city: city.name, region: def.region };
      }
    }
  }
  // 2. US state / Canadian province - catches "Austin, TX", "Remote - Ohio"
  //    even when the city itself is not enumerated. US wins over CA (see CA/CO).
  const us = matchStateProvince(low, raw, segments, US_STATES, USA, 'namerica');
  if (us) return us;
  const ca = matchStateProvince(low, raw, segments, CA_PROVINCES, CANADA, 'namerica');
  if (ca) return ca;
  // 3. Country name (whole word) or unambiguous code (segment / UPPERCASE token).
  for (const def of COUNTRY_DEFS) {
    if (
      def.names.some((n) => wordHit(low, n)) ||
      (def.codes ?? []).some((c) => codeHit(raw, segments, c))
    ) {
      return { country: def.name, city: '', region: def.region };
    }
  }
  return OTHER;
}

/** Stable selection key for a city ("Germany Berlin"). */

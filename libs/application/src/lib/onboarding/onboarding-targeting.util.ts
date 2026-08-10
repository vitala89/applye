/**
 * The targeting step's own content helpers: reading roles and a pay range out
 * of a skill answer, and the currency handling the compensation slider needs.
 *
 * Split from `onboarding-content.util.ts` when the pair crossed this layer's
 * 250-line budget. The seam is real rather than arithmetic: everything here
 * serves step 4, and everything left there serves the resume, the profile and
 * the CV document.
 */
export function parseArchetypesSkillResponse(text: string): {
  archetypes: string[];
  compRange: string | null;
} {
  const empty = { archetypes: [] as string[], compRange: null as string | null };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const obj = JSON.parse(match[0]) as { archetypes?: unknown; compRange?: unknown };
    const archetypes = Array.isArray(obj.archetypes)
      ? obj.archetypes.filter((x): x is string => typeof x === 'string')
      : [];
    const compRange = typeof obj.compRange === 'string' ? obj.compRange : null;
    return { archetypes, compRange };
  } catch {
    return empty;
  }
}

export interface CompRange {
  currency: string;
  min: number;
  max: number;
}

const DEFAULT_COMP_RANGE: CompRange = { currency: 'USD', min: 80, max: 120 };

/** Best-effort extraction of a currency + two numbers from a free-text AI
 * suggestion (e.g. "EUR 90-120K", or "$140k" and "$190k" separated by any dash
 * character the model chose) so the two numeric
 * min/max inputs can be pre-filled. Never throws; falls back to a sane
 * default range when nothing parseable is found. */
export function parseCompRange(text: string | null | undefined): CompRange {
  if (!text) return { ...DEFAULT_COMP_RANGE };
  const numbers = text.match(/\d+/g);
  if (!numbers || numbers.length < 1) return { ...DEFAULT_COMP_RANGE };
  const min = parseInt(numbers[0], 10);
  const max = numbers.length > 1 ? parseInt(numbers[1], 10) : min;
  const currencyMatch = text.match(/[A-Z]{3}|\$|€|£/);
  const currency = currencyMatch ? currencyMatch[0] : DEFAULT_COMP_RANGE.currency;
  return { currency, min, max: max >= min ? max : min };
}

/** Renders a min/max compensation range back into the free-text format
 * `appendCompensation` expects. Pure inverse of `parseCompRange` for the
 * common case (does not need to round-trip exactly). */
export function formatCompRange(range: CompRange): string {
  const symbol = range.currency.length === 1 ? range.currency : `${range.currency} `;
  return `${symbol}${range.min}K - ${symbol}${range.max}K`;
}

export const CURRENCY_OPTIONS = ['USD', 'EUR'] as const;
export type CurrencyOption = (typeof CURRENCY_OPTIONS)[number];

/** Maps a free-text/symbol currency (from an AI suggestion or a stray
 * parse) onto one of the app's selectable currency codes, so the currency
 * dropdown always has a matching option selected. Defaults to USD for
 * anything not yet supported (e.g. GBP) rather than leaving the select
 * with no match. */
export function normalizeCurrency(raw: string): CurrencyOption {
  const upper = raw.trim().toUpperCase();
  if (upper === '€' || upper === 'EUR') return 'EUR';
  if (upper === '$' || upper === 'USD') return 'USD';
  return 'USD';
}

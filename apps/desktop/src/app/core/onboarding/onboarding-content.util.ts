// structurally compatible subset of CvParsedContent
export interface ParsedCv {
  personalDetails?: {
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
  summary?: string | null;
  experience?: { company: string; role: string; bullets?: string[] }[] | null;
  skills?: string[] | null;
}

export function cvToProfileMarkdown(cv: ParsedCv): string {
  const out: string[] = [];
  const name = cv.personalDetails?.fullName?.trim();
  if (name) out.push(`# ${name}`);
  const contact = [
    cv.personalDetails?.email,
    cv.personalDetails?.phone,
    cv.personalDetails?.address,
  ]
    .filter(Boolean)
    .join(' · ');
  if (contact) out.push(contact);
  if (cv.summary?.trim()) out.push('', '## Summary', cv.summary.trim());
  if (cv.experience?.length) {
    out.push('', '## Experience');
    for (const e of cv.experience) {
      out.push('', `### ${e.role} — ${e.company}`);
      for (const b of e.bullets ?? []) out.push(`- ${b}`);
    }
  }
  if (cv.skills?.length) out.push('', '## Skills', cv.skills.join(', '));
  return out.join('\n').trim();
}

/** Folds the user-edited compensation range into the profile markdown so it
 * survives `saveProfile()` without needing a dedicated `Profile` column
 * (a dual-track comp schema is planned separately). Pure/no-op on blank input. */
export function appendCompensation(md: string, compRange: string): string {
  const range = compRange.trim();
  if (!range) return md;
  return `${md}\n\n## Compensation Target\n${range}`.trim();
}

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
 * suggestion (e.g. "EUR 90-120K", "$140k – $190k") so the two numeric
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
  return `${symbol}${range.min}K – ${symbol}${range.max}K`;
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

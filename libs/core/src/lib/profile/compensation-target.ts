/** Split out of `profile-markdown.ts` when it passed its 400-line budget.
 * The applicant's own pay expectation, from the profile's `## Compensation`
 * section. Distinct from `compensation.ts` beside it, which reads a **job's**
 * advertised salary and compares the two. */

/** Structured compensation target as edited in the profile UI. Persisted in the
 * `## Compensation` markdown body so `ProfileForm` stays markdown-backed. */
export interface CompensationTarget {
  min: string;
  max: string;
  currency: string;
  period: string;
}

export const EMPTY_COMPENSATION: CompensationTarget = {
  min: '',
  max: '',
  currency: '',
  period: '',
};

/** Parses the `## Compensation` body (e.g. "85000 - 110000 EUR per year") into a
 * structured target. Lenient: numbers, currency, and period are each optional.
 * Numbers are extracted positionally (first = min, second = max), so no explicit
 * range-separator regex is needed. */
export function parseCompensation(body: string): CompensationTarget {
  const text = (body || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { ...EMPTY_COMPENSATION };
  const currency = /(?:\bEUR\b|€)/i.test(text) ? 'EUR' : /(?:\bUSD\b|\$)/i.test(text) ? 'USD' : '';
  const period = /(?:per\s+month|\/\s*month|(?<![a-z])p\.?m\.?(?![a-z]))/i.test(text)
    ? 'month'
    : /(?:per\s+year|\/\s*year|per\s+annum|(?<![a-z])p\.?a\.?(?![a-z])|annually)/i.test(text)
      ? 'year'
      : '';
  // Strip currency/period words so only the numeric range remains.
  const numsPart = text
    .replace(/\bEUR\b|\bUSD\b|€|\$/gi, ' ')
    .replace(
      /per\s+(year|month|annum)|annually|(?<![a-z])p\.?a\.?(?![a-z])|(?<![a-z])p\.?m\.?(?![a-z])|\/\s*(year|month)/gi,
      ' ',
    );
  const nums = numsPart.match(/\d[\d.,]*\d|\d/g) ?? [];
  const norm = (n: string) => n.replace(/[.,](?=\d{3}\b)/g, '');
  const min = nums[0] ? norm(nums[0]) : '';
  const max = nums[1] ? norm(nums[1]) : '';
  return { min, max, currency, period };
}

/** Inverse of parseCompensation. Emits only the parts that are set; a fully
 * empty target serializes to ''. */
export function serializeCompensation(c: CompensationTarget): string {
  const min = c.min.trim();
  const max = c.max.trim();
  const currency = c.currency.trim();
  const period = c.period.trim();
  const parts: string[] = [];
  if (min && max) parts.push(`${min} - ${max}`);
  else if (min) parts.push(min);
  else if (max) parts.push(max);
  if (currency) parts.push(currency);
  if (period) parts.push(`per ${period}`);
  return parts.join(' ').trim();
}

/** Salary parsed from a job's free-text `salaryRange`. `currency` is '' when the
 * text carries no recognisable currency. */
export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string;
}

export type CompensationVerdict = 'above' | 'within' | 'below' | 'unknown';

function detectCurrency(text: string): string {
  if (/\bEUR\b|€/i.test(text)) return 'EUR';
  if (/\bUSD\b|\$/i.test(text)) return 'USD';
  return '';
}

/** Expands one numeric token to a number, honouring a trailing k/K (thousands)
 * and stripping thousands separators. "80k" -> 80000, "120,000" -> 120000. */
function toNumber(token: string): number | null {
  const m = /^(\d[\d.,]*\d|\d)\s*([kK])?$/.exec(token.trim());
  if (!m) return null;
  const digits = m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(/,/g, '');
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return m[2] ? n * 1000 : n;
}

/** Parses a free-text salary ("€80k - 100k", "$120,000", "90-110k EUR") into a
 * numeric range + currency. Returns null when no number is found. A single
 * value fills both bounds. k-notation and thousands separators are handled. */
export function parseSalaryRange(text: string | null | undefined): ParsedSalary | null {
  if (!text) return null;
  const currency = detectCurrency(text);
  // Grab number-with-optional-k tokens in order.
  const tokens = text.match(/\d[\d.,]*\d\s*[kK]?|\d\s*[kK]?/g) ?? [];
  const nums = tokens.map(toNumber).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  const min = nums[0];
  const max = nums.length > 1 ? nums[1] : nums[0];
  if (min !== null && max !== null && min > max) {
    return { min: max, max: min, currency };
  }
  return { min, max, currency };
}

/** Compares a profile compensation target against a job's advertised salary.
 * Returns 'unknown' (no badge) whenever a wrong verdict is possible: the target
 * has no number, the job salary does not parse, or the currencies are both known
 * and differ. Otherwise 'below'/'above'/'within' by numeric range overlap. */
export function compareCompensation(
  target: { min: string; max: string; currency: string },
  jobSalary: string | null | undefined,
): CompensationVerdict {
  const tMinDigits = target.min.replace(/[^\d]/g, '');
  const tMaxDigits = target.max.replace(/[^\d]/g, '');
  // A non-empty bound with no digits (e.g. "N/A") is malformed input, not an
  // absent bound - treating it as absent would silently fall back to the
  // other bound and produce a misleading verdict, so bail out to 'unknown'.
  if ((target.min.trim() !== '' && !tMinDigits) || (target.max.trim() !== '' && !tMaxDigits)) {
    return 'unknown';
  }
  const tMin = tMinDigits ? Number(tMinDigits) : null;
  const tMax = tMaxDigits ? Number(tMaxDigits) : null;
  if (tMin === null && tMax === null) return 'unknown';
  const lo = tMin ?? tMax!;
  const hi = tMax ?? tMin!;

  const job = parseSalaryRange(jobSalary);
  if (!job || (job.min === null && job.max === null)) return 'unknown';
  const tc = (target.currency || '').trim().toUpperCase();
  if (tc && job.currency && tc !== job.currency) return 'unknown';
  const jMin = job.min ?? job.max!;
  const jMax = job.max ?? job.min!;

  if (jMax < lo) return 'below';
  if (jMin > hi) return 'above';
  return 'within';
}

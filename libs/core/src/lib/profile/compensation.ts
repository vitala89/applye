/** Salary parsed from a job's free-text `salaryRange`. `currency` is '' when the
 * text carries no recognisable currency. */
export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string;
  period: SalaryPeriod;
}

export type SalaryPeriod = '' | 'year' | 'month' | 'week' | 'day' | 'hour';

export type CompensationVerdict = 'above' | 'within' | 'below' | 'unknown';

function detectCurrency(text: string): string {
  if (/\bEUR\b|€/i.test(text)) return 'EUR';
  if (/\bUSD\b|\$/i.test(text)) return 'USD';
  return '';
}

/** Detects the pay period a salary text names. '' when none is stated. */
function detectPeriod(text: string): SalaryPeriod {
  const t = text.toLowerCase();
  if (/(?<![a-z\d])(?:per\s+hour|\/\s*hr|hourly)(?![a-z\d])/.test(t)) return 'hour';
  if (/(?<![a-z\d])(?:per\s+day|\/\s*day|daily)(?![a-z\d])/.test(t)) return 'day';
  if (/(?<![a-z\d])(?:per\s+week|\/\s*wk|weekly)(?![a-z\d])/.test(t)) return 'week';
  if (/(?<![a-z\d])(?:per\s+month|\/\s*mo(?:nth)?|monthly)(?![a-z\d])/.test(t)) return 'month';
  if (
    /(?<![a-z\d])(?:per\s+year|per\s+annum|\/\s*yr|yearly|annually|p\.a\.?|annum)(?![a-z\d])/.test(
      t,
    )
  )
    return 'year';
  return '';
}

/** Factor to multiply a per-`period` amount by to get an annual figure, or null
 * when the period cannot be reliably annualized (week/day/hour) - the caller then
 * returns 'unknown' rather than risk a wrong verdict. '' defaults to year. */
function annualFactor(period: string): number | null {
  if (period === '' || period === 'year') return 1;
  if (period === 'month') return 12;
  return null;
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
  const period = detectPeriod(text);
  // Strip figures that are not pay: bonus percentages ("15%") and retirement-plan
  // names ("401k", "403(b)", "457b") that would otherwise be misread as salary.
  const forNumbers = text
    .replace(/\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(/\b(?:401|403|457)\s*\(?\s*[kb]\)?/gi, ' ');
  // Grab number-with-optional-k tokens in order.
  const tokens = forNumbers.match(/\d[\d.,]*\d\s*[kK]?|\d\s*[kK]?/g) ?? [];
  const nums = tokens.map(toNumber).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  const min = nums[0];
  const max = nums.length > 1 ? nums[1] : nums[0];
  if (min > max) {
    return { min: max, max: min, currency, period };
  }
  return { min, max, currency, period };
}

/** Compares a profile compensation target against a job's advertised salary.
 * Returns 'unknown' (no badge) whenever a wrong verdict is possible: the target
 * has no number, the job salary does not parse, or the currencies are both known
 * and differ. Otherwise 'below'/'above'/'within' by numeric range overlap. */
export function compareCompensation(
  target: { min: string; max: string; currency: string; period: string },
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

  const tf = annualFactor(target.period);
  const jf = annualFactor(job.period);
  if (tf === null || jf === null) return 'unknown';
  const loA = lo * tf;
  const hiA = hi * tf;
  const jMinA = jMin * jf;
  const jMaxA = jMax * jf;
  if (jMaxA < loA) return 'below';
  if (jMinA > hiA) return 'above';
  return 'within';
}

// A salary snippet must carry a real currency marker; a bare number or "401k"
// (a retirement plan) is NOT treated as a salary, to avoid a wrong badge.
const CURRENCY_MARKER = /€|£|\$|\bEUR\b|\bUSD\b|\bGBP\b/i;
const SALARY_KEYWORD = /salary|compensation|\bpay\b|gehalt|verg(?:u|ue|ü)tung|remuneration|wage/i;

/** Pulls the most salary-looking snippet out of a job description, or null.
 * Conservative: only returns a snippet that contains a currency marker, so
 * numbers unrelated to pay (e.g. "401k plan", team sizes) are never mistaken for
 * a salary. Prefers a line that also names salary/compensation. */
export function extractSalaryFromJd(jd: string | null | undefined): string | null {
  if (!jd) return null;
  const lines = jd
    .replace(/\r\n/g, '\n')
    .split(/\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const withCurrency = lines.filter((l) => CURRENCY_MARKER.test(l));
  if (!withCurrency.length) return null;
  const best = withCurrency.find((l) => SALARY_KEYWORD.test(l)) ?? withCurrency[0];
  return best.slice(0, 140);
}

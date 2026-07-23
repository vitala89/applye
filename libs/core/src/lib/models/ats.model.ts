/**
 * Deterministic ATS check - mirrors `commands/ats.rs`.
 *
 * This is a measurement, not a model opinion: the same CV and posting always
 * produce the same report, and it is computed locally at zero token cost. The
 * AI scoring pass still returns its own `atsPass`/`atsNotes`; those are advice,
 * this is the number.
 */

export type AtsSeverity = 'high' | 'medium' | 'low';

export type AtsVerdict = 'pass' | 'risky' | 'fail';

export interface AtsFinding {
  /** Stable id (e.g. `ats.no_email`), usable as a translation key. */
  id: string;
  severity: AtsSeverity;
  /** English fallback text, always populated. */
  message: string;
}

export interface AtsKeywordCoverage {
  matched: string[];
  missing: string[];
  /** Weighted: terms inside the posting's requirements block count double. */
  percent: number;
}

export interface AtsReport {
  /** 0-100. Keyword coverage is worth 60 points, parsability 40. */
  score: number;
  verdict: AtsVerdict;
  keywords: AtsKeywordCoverage;
  findings: AtsFinding[];
}

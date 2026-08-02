import type { JobOverview } from '@applye/core';

/**
 * The status word for a job that exists but was never claimed. Not a value the
 * `applications` table can hold - there is no application row for these - so it
 * lives beside the real statuses rather than in `APPLICATION_STATUSES`, and it
 * is what the Status column and the status filter show for them.
 */
export const ANALYSED_STATUS = 'analysed';

/**
 * What the Status column shows for a row.
 *
 * A claimed job with no status yet is Saved, which is what claiming means. An
 * unclaimed one is not saved and never was: it exists because analysing a
 * pasted description had to write a row somewhere (ADR-0004). Showing it as
 * Saved, or as an empty cell, is the ambiguity that let these rows go
 * unnoticed in the first place.
 */
export function rowStatus(row: JobOverview): string {
  if (!row.claimed) return ANALYSED_STATUS;
  return row.status ?? 'saved';
}

/**
 * Whether a row belongs in the table right now. Unclaimed rows are returned by
 * the query so they can be found again, but stay behind a filter that is off by
 * default - My Jobs means the jobs the user decided on until they ask otherwise.
 */
export function isRowVisible(row: JobOverview, showAnalysed: boolean): boolean {
  return row.claimed || showAnalysed;
}

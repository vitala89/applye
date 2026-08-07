// Which tracker rows a period, a segment and a status filter select, and what
// the report's three summary figures come to.
//
// Split out of `tracker.component.ts` alongside `TrackerRowsStore`. **Every
// function here existed twice**: `tracker-report-print.component.ts` carried a
// verbatim copy of the period window, the day count, the report-row filter and
// the summary arithmetic, because the hidden print window loads its own rows
// rather than receiving the page's. Two copies of a date rule with no test on
// either is how the sheet and the screen come to disagree about what "the last
// three months" means.

import type { TrackerRow } from '@applye/core';

/** The period the toolbar and the report share. */
export type TrackerRange = 'month' | '3months' | 'all';

/** Which half of the tracker the grid is showing. */
export type TrackerSegment = 'active' | 'archived';

/** Statuses that count as the employer having come back to you. Drives the
 * response rate and the average-days figure on the report. */
export const RESPONDED_STATUSES: readonly string[] = ['interview', 'offer', 'rejected'];

/** Ninety days, in milliseconds. The `3months` window is a rolling ninety days
 * rather than three calendar months - `month` is the calendar one. */
const THREE_MONTH_WINDOW_MS = 90 * 86_400_000;

/**
 * The earliest `appliedAt` a period includes, as `YYYY-MM-DD`, or `null` for no
 * lower bound. `month` is the first of the current calendar month; anything
 * that is neither `all` nor `month` is the rolling ninety-day window.
 *
 * **Takes a plain string on purpose.** The print route reads its period out of
 * a query parameter, so it can be handed anything; falling through to ninety
 * days is what both callers already did with an unrecognised value.
 */
export function trackerRangeStart(range: string, now: Date = new Date()): string | null {
  if (range === 'all') return null;
  if (range === 'month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return new Date(now.getTime() - THREE_MONTH_WINDOW_MS).toISOString().slice(0, 10);
}

/**
 * Whole days from `a` to `b`, or `null` when either is missing, unparseable,
 * or `b` precedes `a`. A negative span means the row's dates contradict each
 * other, and averaging it in would pull the report's figure down.
 *
 * `Number.isFinite` is kept although mutation testing shows it cannot change
 * the result: an unparseable date yields `NaN`, and `NaN >= 0` is already
 * false, while date arithmetic is bounded so `Infinity` never arises. It stays
 * because "reject a non-number" is the intent, and `>= 0` only implements that
 * by a property of `NaN` a reader has to know.
 */
export function daysBetweenDates(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const days = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
  return Number.isFinite(days) && days >= 0 ? Math.round(days) : null;
}

/** The grid's rows: the chosen segment, then the status filter, then the
 * period. An empty status filter means every status. */
export function filterTrackerRows(
  rows: readonly TrackerRow[],
  segment: TrackerSegment,
  statusFilter: string,
  minAppliedAt: string | null,
): TrackerRow[] {
  return rows.filter((r) => {
    if (segment === 'archived' ? !r.archived : r.archived) return false;
    if (statusFilter && (r.status ?? '') !== statusFilter) return false;
    if (minAppliedAt && (r.appliedAt ?? '') < minAppliedAt) return false;
    return true;
  });
}

/**
 * The report's rows: period-filtered, **archived included**, oldest first.
 * The Eigenbemuehungen sheet is a record of what was applied for, so archiving
 * a row on screen must not remove it from the evidence.
 *
 * `.slice()` is redundant today - `.filter()` already returned a fresh array,
 * and mutation testing confirms removing it changes nothing. It stays because
 * it becomes load-bearing the moment the filter is made conditional, which is
 * a one-line edit away, and `.sort()` mutates in place.
 */
export function reportTrackerRows(
  rows: readonly TrackerRow[],
  minAppliedAt: string | null,
): TrackerRow[] {
  return rows
    .filter((r) => !minAppliedAt || (r.appliedAt ?? '') >= minAppliedAt)
    .slice()
    .sort((a, b) => ((a.appliedAt ?? '') < (b.appliedAt ?? '') ? -1 : 1));
}

/** The report's three figures. */
export interface TrackerSummary {
  /** Applications in the period. */
  total: number;
  /** Percentage of them that got a response, rounded. */
  rate: number;
  /** Mean days from applying to the last update, over responded rows only. */
  avg: number;
}

/**
 * Summarizes the rows the report will print. Rows whose dates are missing or
 * contradictory are left out of the average but still counted in the total and
 * the rate - they are real applications with an unusable timestamp.
 */
export function summarizeTrackerRows(rows: readonly TrackerRow[]): TrackerSummary {
  const total = rows.length;
  const responded = rows.filter((r) => RESPONDED_STATUSES.includes(r.status ?? ''));
  const rate = total ? Math.round((responded.length / total) * 100) : 0;
  const days = responded
    .map((r) => daysBetweenDates(r.appliedAt, r.lastUpdate))
    .filter((d): d is number => d != null);
  const avg = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
  return { total, rate, avg };
}

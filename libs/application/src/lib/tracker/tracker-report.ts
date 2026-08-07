// The report sheet's wire format, and how many of its columns fit an A4 row.
//
// Moved out of `tracker-report.component.ts`, where a store could not reach it
// - a library may not import from the app. It is formatting for one screen
// rather than domain vocabulary, so it lives beside its store rather than in
// `libs/core` (ADR-0005, amendment two's "domain or format" test).
//
// `TrackerReportComponent` and the hidden print route import these back from
// `@applye/application`, which is the first time a presentational component
// depends on the layer. Allowed - `type:app -> type:application` - and stated
// here because it is new.

/** Which document is being produced. `de` is the Agentur fuer Arbeit
 * Eigenbemuehungen sheet; `intl` is the generic job-application report. */
export type ReportMarket = 'de' | 'intl';

/** `fit` drops the columns that do not fit an A4 row; `all` wraps them onto a
 * second line per record so nothing is lost. */
export type ReportMode = 'fit' | 'all';

/** A resolved report column: the user's chosen tracker columns, each with an
 * estimated print width (mm) used to decide how many fit an A4 row. */
export interface ReportColumn {
  id: string;
  label: string;
  type: string; // text | date | status | yesno | stage | link | number | select
  width: number; // estimated mm
  custom?: boolean;
}

// A4 printable width minus 2x16mm margins minus the '#' index column, per
// orientation. Used to greedily pack columns into one row.
const BUDGET_PORTRAIT_MM = 170;
const BUDGET_LANDSCAPE_MM = 257;

/**
 * Greedily pack columns (in order) into one A4 row; the rest overflow.
 *
 * The first column is taken **whatever it measures**, so a row is never empty
 * even if one column is wider than the whole page. And packing stops at the
 * first column that does not fit rather than skipping it and trying the next:
 * the sheet must read in the user's chosen column order, so a narrow column
 * may not jump ahead of a wide one that was dropped.
 */
export function reportFit(
  columns: ReportColumn[],
  landscape: boolean,
): { fit: ReportColumn[]; overflow: ReportColumn[] } {
  const budget = landscape ? BUDGET_LANDSCAPE_MM : BUDGET_PORTRAIT_MM;
  const fit: ReportColumn[] = [];
  const overflow: ReportColumn[] = [];
  let used = 0;
  let stopped = false;
  for (const c of columns) {
    if (!stopped && (fit.length === 0 || used + c.width <= budget)) {
      fit.push(c);
      used += c.width;
    } else {
      stopped = true;
      overflow.push(c);
    }
  }
  return { fit, overflow };
}

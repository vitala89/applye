// What the Eigenbemuehungen sheet actually says: the CSV a spreadsheet opens,
// and the plain-text fallback Rust prints when the WYSIWYG render is
// unavailable.
//
// **This is a document the user submits to the Agentur fuer Arbeit**, so the
// tests here assert exact output rather than shape. A wrong period, a missing
// row or a mis-escaped quote is a real-world consequence, not a rendering
// glitch, and none of this had a test before it moved out of the page.
//
// Every function takes its translator as a parameter rather than reading one.
// The document's language is the chosen market's, not the UI's - a German
// sheet must read German out of an English app - so the caller resolves
// `tFor(reportLanguage)` once and passes it down.

import type { TrackerRow } from '@applye/core';
import { ReportColumn, ReportMarket } from './tracker-report';
import { TrackerSummary } from './tracker-rows';
import { trackerCustomValues } from './tracker-columns';

/** Translates one key into the **report's** language. */
export type ReportTranslate = (key: string) => string;

/** The file name offered for a saved report, without extension. Names the
 * German sheet by the term the office uses, so a user with a folder of them
 * can tell one from a generic export. */
export function trackerReportBaseName(market: ReportMarket, stamp: string): string {
  return market === 'de' ? `eigenbemuehungen-${stamp}` : `job-application-report-${stamp}`;
}

/** Contact as one printed field. Either half may be missing, and a row with
 * neither prints empty rather than a bare separator. */
export function trackerContactDisplay(row: TrackerRow): string {
  return [row.contactName, row.contactChannel].filter(Boolean).join(' - ');
}

/**
 * One CSV cell for one report column.
 *
 * A spreadsheet has no width limit, so the CSV carries **every** visible
 * column - the A4 fit calculation never drops anything here.
 */
export function trackerCsvCell(row: TrackerRow, col: ReportColumn, t: ReportTranslate): string {
  const rec = row as unknown as Record<string, unknown>;
  if (col.custom) {
    const v = trackerCustomValues(row)[col.id] ?? '';
    return col.type === 'date' && v ? v.slice(0, 10) : v;
  }
  switch (col.type) {
    case 'status':
      return row.status ? t('status.' + row.status) : '';
    case 'stage':
      return row.nextStageLabel
        ? `${row.nextStageLabel}${row.nextStageAt ? ' ' + row.nextStageAt.slice(0, 10) : ''}`
        : '';
    case 'link':
      return row.sourceUrl ?? '';
    case 'yesno':
      return rec[col.id] == null ? '' : rec[col.id] ? 'yes' : 'no';
    case 'date':
      return rec[col.id] ? String(rec[col.id]).slice(0, 10) : '';
    default:
      return rec[col.id] != null ? String(rec[col.id]).replace(/\n/g, ' ') : '';
  }
}

/** Everything the two documents need that is not a row. */
export interface TrackerReportHeader {
  columns: readonly ReportColumn[];
  rows: readonly TrackerRow[];
  periodLabel: string;
  applicant: string;
  /** `YYYY-MM-DD`. Passed in rather than read from the clock, so the same
   * inputs always produce the same document. */
  generatedOn: string;
  t: ReportTranslate;
}

/** Doubles every quote and wraps the field, which is the whole of RFC 4180's
 * escaping and the reason a company name with a comma does not shift a row. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The spreadsheet export: three metadata rows, a blank line, the header row,
 * then one row per application, numbered from 1.
 */
export function buildTrackerCsv({
  columns,
  rows,
  periodLabel,
  applicant,
  generatedOn,
  t,
}: TrackerReportHeader): string {
  const meta = [
    [t('tracker.report_period'), periodLabel],
    [t('tracker.report_name'), applicant],
    [t('tracker.report_generated'), generatedOn],
  ].map((row) => row.map((c) => csvField(String(c))).join(','));
  const head = ['#', ...columns.map((c) => c.label)];
  const lines = rows.map((r, i) =>
    [String(i + 1), ...columns.map((c) => trackerCsvCell(r, c, t))].map(csvField).join(','),
  );
  return [...meta, '', head.map(csvField).join(','), ...lines].join('\n');
}

/** Truncates with an ellipsis and pads to a fixed column width, so the plain
 * text fallback lines up when printed in a monospaced font. */
function pad(value: string, width: number): string {
  return (value.length > width ? value.slice(0, width - 1) + '…' : value).padEnd(width);
}

/**
 * The plain-text fallback, printed by Rust when the WYSIWYG render is
 * unavailable. A **fixed seven-column** layout rather than the user's chosen
 * columns, because it has no width calculation to fall back on.
 */
export function buildTrackerReportText(
  { rows, periodLabel, applicant, generatedOn, t }: Omit<TrackerReportHeader, 'columns'>,
  summary: TrackerSummary,
): string {
  const header =
    pad('#', 4) +
    pad(t('tracker.col_date'), 12) +
    pad(t('tracker.col_company'), 20) +
    pad(t('tracker.col_role'), 20) +
    pad(t('tracker.col_method'), 12) +
    pad(t('tracker.col_status'), 11) +
    pad(t('tracker.col_contact'), 24);
  const body = rows.map(
    (r, i) =>
      pad(String(i + 1), 4) +
      pad(r.appliedAt ?? '', 12) +
      pad(r.company ?? '', 20) +
      pad(r.title ?? '', 20) +
      pad(r.method ?? '', 12) +
      pad(r.status ?? '', 11) +
      pad(trackerContactDisplay(r), 24),
  );
  return [
    `# ${t('tracker.report_title')}`,
    `${t('tracker.report_period')}: ${periodLabel}`,
    `${t('tracker.report_name')}: ${applicant}`,
    `${t('tracker.report_generated')}: ${generatedOn}`,
    '',
    '## ' + t('tracker.title'),
    header,
    ...body,
    '',
    `${t('tracker.total')}: ${summary.total}   ${t('tracker.response_rate')}: ${summary.rate}%   ${t('tracker.avg_days')}: ${summary.avg}`,
  ].join('\n');
}

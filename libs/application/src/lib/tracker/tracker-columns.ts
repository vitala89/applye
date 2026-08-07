// The Job Tracker's column model: which columns exist, which are showing, how
// wide each one prints, and how a row's value for a column reads as text.
//
// Split out of `tracker.component.ts` alongside `TrackerColumnsStore`. Nothing
// here reads a signal or touches the gateway, so the column set can be
// exercised without a TestBed - the page had no spec at all before this.
//
// Deliberately free of `TranslateService`: a column's *label* is UI text and
// the page supplies it, while the report renders the same columns in its own
// language (ADR-0005, amendment eight). Keeping the labelling out means one
// column list serves both without knowing which language it is in.

import type { TrackerCustomColumn, TrackerRow } from '@applye/core';

/** Widget type for a rendered cell. The first five mirror
 * `TrackerCustomColumn['type']`; the last three are built-in columns only. */
export type TrackerColumnType = TrackerCustomColumn['type'] | 'status' | 'link' | 'stage';

/** A rendered column - a built-in field or a user-defined custom column. */
export interface TrackerColumnDef {
  key: string;
  /** Translation key for a built-in column. Custom columns carry `label`. */
  labelKey?: string;
  /** The user's own wording, for a custom column. Never translated. */
  label?: string;
  src: 'job' | 'app';
  editable?: boolean;
  type?: TrackerColumnType;
  essential?: boolean;
  pin?: boolean;
  custom?: boolean;
}

/** Which columns the tracker grid can show, in render order. `essential`
 * columns are on by default; `pin` cannot be switched off at all. */
export const TRACKER_BASE_COLUMNS: readonly TrackerColumnDef[] = [
  { key: 'company', labelKey: 'tracker.col_company', src: 'job', essential: true, pin: true },
  { key: 'title', labelKey: 'tracker.col_role', src: 'job', essential: true },
  {
    key: 'status',
    labelKey: 'tracker.col_status',
    src: 'app',
    editable: true,
    type: 'status',
    essential: true,
  },
  { key: 'appliedAt', labelKey: 'tracker.col_date', src: 'app', type: 'date', essential: true },
  {
    key: 'nextAction',
    labelKey: 'tracker.col_next_action',
    src: 'app',
    editable: true,
    type: 'text',
    essential: true,
  },
  {
    key: 'nextActionAt',
    labelKey: 'tracker.col_next_action_at',
    src: 'app',
    editable: true,
    type: 'date',
    essential: true,
  },
  {
    key: 'nextStage',
    labelKey: 'tracker.col_next_stage',
    src: 'app',
    type: 'stage',
    essential: true,
  },
  { key: 'techStack', labelKey: 'tracker.col_tech_stack', src: 'job' },
  { key: 'location', labelKey: 'tracker.col_location', src: 'job' },
  { key: 'sourceUrl', labelKey: 'tracker.col_source_url', src: 'job', type: 'link' },
  { key: 'contactName', labelKey: 'tracker.col_contact_name', src: 'app', editable: true },
  { key: 'contactRole', labelKey: 'tracker.col_contact_role', src: 'app', editable: true },
  { key: 'contactChannel', labelKey: 'tracker.col_contact_channel', src: 'app', editable: true },
  { key: 'method', labelKey: 'tracker.col_method', src: 'app' },
  { key: 'interview1At', labelKey: 'tracker.col_interview1', src: 'app', type: 'date' },
  { key: 'followUp2At', labelKey: 'tracker.col_followup2', src: 'app', type: 'date' },
  { key: 'salaryRange', labelKey: 'tracker.col_salary_range', src: 'app', editable: true },
  { key: 'contractType', labelKey: 'tracker.col_contract_type', src: 'app' },
  { key: 'blueCardEligible', labelKey: 'tracker.col_blue_card', src: 'job', type: 'yesno' },
  { key: 'eorProvider', labelKey: 'tracker.col_eor_provider', src: 'app' },
  { key: 'notes', labelKey: 'tracker.col_notes', src: 'app', editable: true },
];

export const TRACKER_ESSENTIAL_COLUMNS: readonly TrackerColumnDef[] = TRACKER_BASE_COLUMNS.filter(
  (c) => c.essential,
);

export const TRACKER_OPTIONAL_COLUMNS: readonly TrackerColumnDef[] = TRACKER_BASE_COLUMNS.filter(
  (c) => !c.essential,
);

/** Visibility map the grid starts from: the essential columns, nothing else. */
export function defaultTrackerColumnState(): Record<string, boolean> {
  return Object.fromEntries(TRACKER_BASE_COLUMNS.map((c) => [c.key, !!c.essential]));
}

/** A stored custom column as a rendered column. Always editable, always `app`
 * side, and always labelled with the user's own wording. */
export function customTrackerColumnDefs(
  custom: readonly TrackerCustomColumn[],
): TrackerColumnDef[] {
  return custom.map((c) => ({
    key: c.id,
    label: c.label,
    src: 'app',
    editable: true,
    type: c.type,
    custom: true,
  }));
}

/** Built-in visible columns in their canonical order, then every custom column.
 * Custom columns are never hidden - the user created them on purpose, so the
 * visibility panel offers no switch for them, only removal. */
export function visibleTrackerColumns(
  state: Readonly<Record<string, boolean>>,
  custom: readonly TrackerCustomColumn[],
): TrackerColumnDef[] {
  return [...TRACKER_BASE_COLUMNS.filter((c) => state[c.key]), ...customTrackerColumnDefs(custom)];
}

/** Rough print width in millimetres, for the A4 fit calculation. Custom columns
 * have no measured content, so they take the narrow default. */
export function trackerColumnWidth(col: TrackerColumnDef): number {
  if (col.custom) return 30;
  return TRACKER_COLUMN_WIDTHS_MM[col.key] ?? 28;
}

const TRACKER_COLUMN_WIDTHS_MM: Readonly<Record<string, number>> = {
  company: 34,
  title: 40,
  status: 22,
  appliedAt: 22,
  nextAction: 36,
  nextActionAt: 26,
  nextStage: 34,
  techStack: 38,
  location: 28,
  sourceUrl: 22,
  contactName: 34,
  contactRole: 26,
  contactChannel: 34,
  method: 18,
  interview1At: 22,
  followUp2At: 24,
  salaryRange: 26,
  contractType: 22,
  blueCardEligible: 22,
  eorProvider: 22,
  notes: 44,
};

/** The row's custom-column values, decoded from its JSON blob. A malformed or
 * absent blob reads as no values rather than throwing - the grid must still
 * render a row whose custom fields were written by an older build. */
export function trackerCustomValues(row: TrackerRow): Record<string, string> {
  if (!row.customFields) return {};
  try {
    return JSON.parse(row.customFields) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * One built-in field as display text. Kept separate from `trackerCellValue`
 * because the inline row editor reads the same fields off a draft object whose
 * custom values live in their own map rather than in `customFields`.
 */
export function trackerFieldText(
  source: Readonly<Record<string, unknown>>,
  col: TrackerColumnDef,
): string {
  const v = source[col.key];
  if (v == null) return '';
  if (col.type === 'yesno') return v ? 'yes' : 'no';
  if (col.key.endsWith('At')) return String(v).slice(0, 10);
  return String(v);
}

/** One cell of the grid as display text, for a built-in or a custom column. */
export function trackerCellValue(row: TrackerRow, col: TrackerColumnDef): string {
  if (col.custom) return trackerCustomValues(row)[col.key] ?? '';
  return trackerFieldText(row as unknown as Record<string, unknown>, col);
}

/** `2026-08-07` as `07 Aug 26`. Returns the input unchanged when it is not a
 * dashed date, so a half-typed value in an editable cell still renders. */
export function formatTrackerDate(v: string): string {
  if (!v) return '';
  const [y, m, d] = v.slice(0, 10).split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return m ? `${d} ${months[+m - 1]} ${y.slice(2)}` : v;
}

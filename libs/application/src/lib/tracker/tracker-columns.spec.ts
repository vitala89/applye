import type { TrackerCustomColumn, TrackerRow } from '@applye/core';
import {
  TRACKER_BASE_COLUMNS,
  TRACKER_ESSENTIAL_COLUMNS,
  TRACKER_OPTIONAL_COLUMNS,
  TrackerColumnDef,
  customTrackerColumnDefs,
  defaultTrackerColumnState,
  formatTrackerDate,
  trackerCellValue,
  trackerColumnWidth,
  trackerCustomValues,
  trackerFieldText,
  visibleTrackerColumns,
} from './tracker-columns';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, ...over };
}

function col(over: Partial<TrackerColumnDef> = {}): TrackerColumnDef {
  return { key: 'notes', src: 'app', ...over };
}

const CUSTOM: TrackerCustomColumn[] = [
  { id: 'cf_1', label: 'Referral', type: 'text', sort: 0 },
  { id: 'cf_2', label: 'Take-home', type: 'yesno', sort: 1 },
];

describe('the tracker column set', () => {
  it('splits into essential and optional, with nothing in both or neither', () => {
    expect(TRACKER_ESSENTIAL_COLUMNS.length + TRACKER_OPTIONAL_COLUMNS.length).toBe(
      TRACKER_BASE_COLUMNS.length,
    );
    expect(TRACKER_ESSENTIAL_COLUMNS.every((c) => c.essential)).toBe(true);
    expect(TRACKER_OPTIONAL_COLUMNS.every((c) => !c.essential)).toBe(true);
  });

  it('has unique keys, so the visibility map cannot collide', () => {
    const keys = TRACKER_BASE_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('starts with the essential columns showing and the optional ones hidden', () => {
    const state = defaultTrackerColumnState();
    expect(state['company']).toBe(true);
    expect(state['nextStage']).toBe(true);
    expect(state['techStack']).toBe(false);
    expect(state['notes']).toBe(false);
  });
});

describe('visibleTrackerColumns', () => {
  // Asymmetric on purpose: an essential column switched OFF and an optional one
  // switched ON. A filter that read `c.essential` instead of the state map
  // would pass a fixture where the two agree, and fail this one.
  it('reads the state map, not the essential flag', () => {
    const state = { ...defaultTrackerColumnState(), company: false, techStack: true };
    const keys = visibleTrackerColumns(state, []).map((c) => c.key);

    expect(keys).not.toContain('company');
    expect(keys).toContain('techStack');
  });

  it('keeps the canonical order and appends every custom column after it', () => {
    const state = { ...defaultTrackerColumnState(), notes: true };
    const keys = visibleTrackerColumns(state, CUSTOM).map((c) => c.key);

    expect(keys.indexOf('company')).toBeLessThan(keys.indexOf('notes'));
    expect(keys.slice(-2)).toEqual(['cf_1', 'cf_2']);
  });

  it('shows every custom column regardless of the state map', () => {
    const state = { ...defaultTrackerColumnState(), cf_1: false, cf_2: false };
    expect(visibleTrackerColumns(state, CUSTOM).map((c) => c.key)).toContain('cf_1');
  });

  it('treats a missing state entry as hidden', () => {
    expect(visibleTrackerColumns({}, []).length).toBe(0);
  });
});

describe('customTrackerColumnDefs', () => {
  it('carries the user label, marks the column custom, and keeps its type', () => {
    expect(customTrackerColumnDefs(CUSTOM)[1]).toEqual({
      key: 'cf_2',
      label: 'Take-home',
      src: 'app',
      editable: true,
      type: 'yesno',
      custom: true,
    });
  });
});

describe('trackerColumnWidth', () => {
  it('uses the measured width for a built-in column', () => {
    expect(trackerColumnWidth(col({ key: 'notes' }))).toBe(44);
    expect(trackerColumnWidth(col({ key: 'method' }))).toBe(18);
  });

  it('falls back to the default for an unmeasured built-in column', () => {
    expect(trackerColumnWidth(col({ key: 'unmeasured' }))).toBe(28);
  });

  // Asymmetric: a custom column whose key collides with a measured built-in.
  // Dropping the custom check would return 44 here and pass every fixture whose
  // custom key is absent from the width map.
  it('gives a custom column the narrow width even when its key is measured', () => {
    expect(trackerColumnWidth(col({ key: 'notes', custom: true }))).toBe(30);
  });
});

describe('trackerCustomValues', () => {
  it('decodes the blob', () => {
    expect(trackerCustomValues(row({ customFields: '{"cf_1":"Ada"}' }))).toEqual({ cf_1: 'Ada' });
  });

  it('reads an absent blob as no values', () => {
    expect(trackerCustomValues(row())).toEqual({});
  });

  it('reads a malformed blob as no values rather than throwing', () => {
    expect(trackerCustomValues(row({ customFields: '{not json' }))).toEqual({});
  });

  it('reads an empty-string blob as no values', () => {
    expect(trackerCustomValues(row({ customFields: '' }))).toEqual({});
  });
});

describe('trackerFieldText', () => {
  it('renders an absent value as empty', () => {
    expect(trackerFieldText({}, col({ key: 'notes' }))).toBe('');
  });

  // `false` is falsy but not nullish, and it must reach the yesno branch.
  // Weakening `v == null` to `!v` returns '' here and passes every other case.
  it('renders a false yesno as "no", not as empty', () => {
    expect(
      trackerFieldText(
        { blueCardEligible: false },
        col({ key: 'blueCardEligible', type: 'yesno' }),
      ),
    ).toBe('no');
    expect(
      trackerFieldText({ blueCardEligible: true }, col({ key: 'blueCardEligible', type: 'yesno' })),
    ).toBe('yes');
  });

  it('renders a zero as "0", not as empty', () => {
    expect(trackerFieldText({ notes: 0 }, col({ key: 'notes' }))).toBe('0');
  });

  it('truncates a timestamp in an -At column to its date', () => {
    expect(trackerFieldText({ appliedAt: '2026-08-07T09:30:00Z' }, col({ key: 'appliedAt' }))).toBe(
      '2026-08-07',
    );
  });

  it('leaves a column whose key merely contains "At" alone', () => {
    expect(trackerFieldText({ Attachment: 'a-very-long-value' }, col({ key: 'Attachment' }))).toBe(
      'a-very-long-value',
    );
  });

  // The two branches are checked in order. A yesno column whose key ends in
  // "At" proves which one wins; swapping the checks slices "yes" to "yes".
  it('checks yesno before the -At suffix', () => {
    expect(trackerFieldText({ verifiedAt: true }, col({ key: 'verifiedAt', type: 'yesno' }))).toBe(
      'yes',
    );
  });
});

describe('trackerCellValue', () => {
  it('reads a built-in column off the row', () => {
    expect(trackerCellValue(row({ company: 'Aiven' }), col({ key: 'company' }))).toBe('Aiven');
  });

  it('reads a custom column out of the blob', () => {
    expect(
      trackerCellValue(row({ customFields: '{"cf_1":"Ada"}' }), col({ key: 'cf_1', custom: true })),
    ).toBe('Ada');
  });

  it('renders a custom column with no stored value as empty', () => {
    expect(trackerCellValue(row({ customFields: '{}' }), col({ key: 'cf_1', custom: true }))).toBe(
      '',
    );
  });

  // Asymmetric: a custom column whose key ends in "At" and whose row also has a
  // built-in field of that name. The custom branch returns the blob value
  // verbatim; falling through would return the sliced row field instead.
  it('takes the custom branch first, and does not truncate the value', () => {
    const r = row({ customFields: '{"cf_At":"2026-08-07T09:30:00Z"}' });
    expect(trackerCellValue(r, col({ key: 'cf_At', custom: true }))).toBe('2026-08-07T09:30:00Z');
  });
});

describe('formatTrackerDate', () => {
  it('renders a dashed date as day, short month and two-digit year', () => {
    expect(formatTrackerDate('2026-08-07')).toBe('07 Aug 26');
  });

  it('picks the month by its one-based number', () => {
    expect(formatTrackerDate('2026-01-15')).toBe('15 Jan 26');
    expect(formatTrackerDate('2026-12-15')).toBe('15 Dec 26');
  });

  it('truncates a timestamp before formatting it', () => {
    expect(formatTrackerDate('2026-03-09T22:15:00Z')).toBe('09 Mar 26');
  });

  it('renders an empty value as empty', () => {
    expect(formatTrackerDate('')).toBe('');
  });

  it('returns a value that is not a dashed date unchanged', () => {
    expect(formatTrackerDate('soon')).toBe('soon');
  });
});

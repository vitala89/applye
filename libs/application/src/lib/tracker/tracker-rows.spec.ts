import type { TrackerRow } from '@applye/core';
import {
  RESPONDED_STATUSES,
  daysBetweenDates,
  filterTrackerRows,
  reportTrackerRows,
  summarizeTrackerRows,
  trackerRangeStart,
} from './tracker-rows';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, ...over };
}

describe('trackerRangeStart', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  it('has no lower bound for the whole history', () => {
    expect(trackerRangeStart('all', now)).toBeNull();
  });

  it('starts a calendar month on its first day', () => {
    expect(trackerRangeStart('month', now)).toBe('2026-08-01');
  });

  // padStart is invisible for a two-digit month, so a single-digit one is the
  // only fixture that can catch it being dropped.
  it('zero-pads a single-digit month', () => {
    expect(trackerRangeStart('month', new Date('2026-03-19T12:00:00Z'))).toBe('2026-03-01');
  });

  it('makes three months a rolling ninety days, not three calendar months', () => {
    expect(trackerRangeStart('3months', now)).toBe('2026-05-09');
  });

  // The print route reads its period from a query parameter, so it can be
  // handed anything. Both callers already fell through to ninety days.
  it('reads an unrecognised period as the ninety-day window', () => {
    expect(trackerRangeStart('', now)).toBe('2026-05-09');
    expect(trackerRangeStart('last-tuesday', now)).toBe('2026-05-09');
  });
});

describe('daysBetweenDates', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetweenDates('2026-08-01', '2026-08-08')).toBe(7);
  });

  it('rounds a partial day', () => {
    expect(daysBetweenDates('2026-08-01T00:00:00Z', '2026-08-02T20:00:00Z')).toBe(2);
  });

  it('reads a same-day pair as zero, not as missing', () => {
    expect(daysBetweenDates('2026-08-01', '2026-08-01')).toBe(0);
  });

  it('has no answer when either date is absent', () => {
    expect(daysBetweenDates(undefined, '2026-08-08')).toBeNull();
    expect(daysBetweenDates('2026-08-01', undefined)).toBeNull();
    expect(daysBetweenDates('', '')).toBeNull();
  });

  // A row whose last update precedes its application date contradicts itself.
  // Averaging a negative span in would pull the report's figure down.
  it('has no answer when the second date precedes the first', () => {
    expect(daysBetweenDates('2026-08-08', '2026-08-01')).toBeNull();
  });

  it('has no answer when a date cannot be parsed', () => {
    expect(daysBetweenDates('2026-08-01', 'soon')).toBeNull();
  });
});

describe('filterTrackerRows', () => {
  const rows: TrackerRow[] = [
    row({ id: 1, status: 'applied', appliedAt: '2026-08-01' }),
    row({ id: 2, status: 'offer', appliedAt: '2026-06-01', archived: true }),
    row({ id: 3, status: 'applied', appliedAt: '2026-06-01' }),
    row({ id: 4, status: 'applied', archived: false }),
  ];
  const ids = (r: TrackerRow[]) => r.map((x) => x.id);

  it('shows the unarchived rows in the active segment', () => {
    expect(ids(filterTrackerRows(rows, 'active', '', null))).toEqual([1, 3, 4]);
  });

  it('shows only the archived rows in the archived segment', () => {
    expect(ids(filterTrackerRows(rows, 'archived', '', null))).toEqual([2]);
  });

  // `archived` is optional, so a row that has never been archived carries
  // `undefined` rather than `false`. Both must read as active.
  it('treats a missing archived flag as active', () => {
    expect(ids(filterTrackerRows([row({ id: 9 })], 'active', '', null))).toEqual([9]);
    expect(ids(filterTrackerRows([row({ id: 9 })], 'archived', '', null))).toEqual([]);
  });

  it('narrows by status, and an empty filter means every status', () => {
    expect(ids(filterTrackerRows(rows, 'active', 'applied', null))).toEqual([1, 3, 4]);
    expect(ids(filterTrackerRows(rows, 'active', 'offer', null))).toEqual([]);
    expect(ids(filterTrackerRows(rows, 'active', '', null))).toEqual([1, 3, 4]);
  });

  it('keeps a row with no status when no status is filtered for', () => {
    expect(ids(filterTrackerRows([row({ id: 9 })], 'active', '', null))).toEqual([9]);
    expect(ids(filterTrackerRows([row({ id: 9 })], 'active', 'applied', null))).toEqual([]);
  });

  it('drops rows applied for before the period starts', () => {
    expect(ids(filterTrackerRows(rows, 'active', '', '2026-07-01'))).toEqual([1]);
  });

  // Asymmetric on the two date shapes: a row dated exactly on the boundary
  // stays, a row with no date at all goes. Only a `<` comparison against the
  // empty-string fallback produces both.
  it('keeps a row dated exactly on the boundary and drops an undated one', () => {
    const boundary = [row({ id: 1, appliedAt: '2026-07-01' }), row({ id: 2 })];
    expect(ids(filterTrackerRows(boundary, 'active', '', '2026-07-01'))).toEqual([1]);
  });

  it('keeps an undated row when there is no lower bound', () => {
    expect(ids(filterTrackerRows([row({ id: 2 })], 'active', '', null))).toEqual([2]);
  });

  it('applies all three filters together', () => {
    expect(ids(filterTrackerRows(rows, 'active', 'applied', '2026-07-01'))).toEqual([1]);
  });

  it('does not mutate the input', () => {
    const input = [row({ id: 1, archived: true }), row({ id: 2 })];
    filterTrackerRows(input, 'active', '', null);
    expect(ids(input)).toEqual([1, 2]);
  });
});

describe('reportTrackerRows', () => {
  it('sorts oldest first', () => {
    const rows = [
      row({ id: 1, appliedAt: '2026-08-01' }),
      row({ id: 2, appliedAt: '2026-06-01' }),
      row({ id: 3, appliedAt: '2026-07-01' }),
    ];
    expect(reportTrackerRows(rows, null).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  // The Eigenbemuehungen sheet is a record of what was applied for, so
  // archiving a row on screen must not remove it from the evidence. This is the
  // one place the report and the grid deliberately disagree.
  it('includes archived rows, unlike the grid', () => {
    const rows = [row({ id: 1, appliedAt: '2026-08-01', archived: true })];
    expect(reportTrackerRows(rows, null).map((r) => r.id)).toEqual([1]);
    expect(filterTrackerRows(rows, 'active', '', null)).toEqual([]);
  });

  it('keeps a row dated exactly on the boundary', () => {
    const rows = [row({ id: 1, appliedAt: '2026-07-01' }), row({ id: 2, appliedAt: '2026-06-30' })];
    expect(reportTrackerRows(rows, '2026-07-01').map((r) => r.id)).toEqual([1]);
  });

  it('drops an undated row once a period is set, and keeps it otherwise', () => {
    const rows = [row({ id: 1 })];
    expect(reportTrackerRows(rows, '2026-07-01')).toEqual([]);
    expect(reportTrackerRows(rows, null).map((r) => r.id)).toEqual([1]);
  });

  it('does not reorder the caller"s array', () => {
    const rows = [row({ id: 1, appliedAt: '2026-08-01' }), row({ id: 2, appliedAt: '2026-06-01' })];
    reportTrackerRows(rows, null);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('summarizeTrackerRows', () => {
  it('counts nothing as zero rather than dividing by it', () => {
    expect(summarizeTrackerRows([])).toEqual({ total: 0, rate: 0, avg: 0 });
  });

  it('counts every status toward the total but only responses toward the rate', () => {
    const rows = [
      row({ id: 1, status: 'applied' }),
      row({ id: 2, status: 'interview' }),
      row({ id: 3, status: 'saved' }),
    ];
    expect(summarizeTrackerRows(rows)).toMatchObject({ total: 3, rate: 33 });
  });

  it('treats interview, offer and rejected as responses, and nothing else', () => {
    for (const status of RESPONDED_STATUSES) {
      expect(summarizeTrackerRows([row({ status })]).rate).toBe(100);
    }
    for (const status of ['saved', 'applied', 'cancelled']) {
      expect(summarizeTrackerRows([row({ status })]).rate).toBe(0);
    }
  });

  it('averages the days to respond over responded rows only', () => {
    const rows = [
      row({ id: 1, status: 'interview', appliedAt: '2026-08-01', lastUpdate: '2026-08-05' }),
      row({ id: 2, status: 'offer', appliedAt: '2026-08-01', lastUpdate: '2026-08-09' }),
      // Applied, not a response: its 40-day span must not enter the average.
      row({ id: 3, status: 'applied', appliedAt: '2026-06-01', lastUpdate: '2026-07-11' }),
    ];
    expect(summarizeTrackerRows(rows)).toEqual({ total: 3, rate: 67, avg: 6 });
  });

  // Asymmetric: two responded rows, only one with usable dates. A row still
  // counts toward the total and the rate when its dates are unusable - it is a
  // real application with a broken timestamp, not a missing one.
  it('counts a responded row with unusable dates in the rate but not the average', () => {
    const rows = [
      row({ id: 1, status: 'interview', appliedAt: '2026-08-01', lastUpdate: '2026-08-05' }),
      row({ id: 2, status: 'offer', appliedAt: '2026-08-09', lastUpdate: '2026-08-01' }),
    ];
    expect(summarizeTrackerRows(rows)).toEqual({ total: 2, rate: 100, avg: 4 });
  });

  it('reports no average when no responded row has usable dates', () => {
    expect(summarizeTrackerRows([row({ status: 'offer' })])).toEqual({
      total: 1,
      rate: 100,
      avg: 0,
    });
  });

  it('reads a row with no status as no response', () => {
    expect(summarizeTrackerRows([row({}), row({ status: 'offer' })])).toMatchObject({
      total: 2,
      rate: 50,
    });
  });
});

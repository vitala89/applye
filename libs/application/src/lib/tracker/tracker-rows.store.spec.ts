import { TestBed } from '@angular/core/testing';
import type { Settings, TrackerRow } from '@applye/core';
import { DbService, DocumentsGateway, TrackerGateway } from '@applye/data';
import { TrackerRowsStore } from './tracker-rows.store';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, jobId: 100, ...over };
}

function createStore(rows: TrackerRow[] = [], settings: Partial<Settings> | null = null) {
  const db = {
    trackerRows: jest.fn().mockResolvedValue(rows),
    getSettings: jest.fn().mockResolvedValue(settings),
    setApplicationArchived: jest.fn().mockResolvedValue(undefined),
    deleteJob: jest.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      TrackerRowsStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: TrackerGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(TrackerRowsStore), db };
}

/**
 * Loads, then widens the period to the whole history.
 *
 * The store's default range is a rolling ninety days, so a fixture with no
 * `appliedAt` - or with one dated far enough back - is filtered out before any
 * other rule is reached. Tests whose subject is the segment, the status filter
 * or a write say so explicitly rather than depending on how close the fixture's
 * dates happen to be to the day the suite runs.
 */
async function loadAllPeriods(store: TrackerRowsStore): Promise<void> {
  await store.load();
  store.range.set('all');
}

describe('TrackerRowsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts loading, on the active segment, over the last three months', () => {
    const { store } = createStore();
    expect(store.loading()).toBe(true);
    expect(store.segment()).toBe('active');
    expect(store.range()).toBe('3months');
    expect(store.statusFilter()).toBe('');
  });

  describe('load', () => {
    it('takes the rows and the settings, and clears loading', async () => {
      const { store } = createStore([row({ id: 1 }), row({ id: 2 })], { uiLanguage: 'de' });
      await store.load();

      expect(store.all().map((r) => r.id)).toEqual([1, 2]);
      expect(store.isGerman()).toBe(true);
      expect(store.loading()).toBe(false);
    });

    it('empties the rows when the gateway fails, and does not reject', async () => {
      const { store, db } = createStore([row()]);
      await store.load();
      db.trackerRows.mockRejectedValue(new Error('locked'));

      await expect(store.load()).resolves.toBeUndefined();
      expect(store.all()).toEqual([]);
      expect(store.loading()).toBe(false);
    });

    // Asymmetric on the two ways `settings()` ends up null. The page defaults
    // the report market from a database that has no settings row, and must not
    // from a read that failed - so a single null cannot answer both, and
    // `loadError` is what separates them.
    it('tells a failed read apart from a database with no settings row', async () => {
      const { store, db } = createStore([], null);

      await store.load();
      expect(store.settings()).toBeNull();
      expect(store.loadError()).toBe(false);

      db.getSettings.mockRejectedValue(new Error('locked'));
      await store.load();
      expect(store.settings()).toBeNull();
      expect(store.loadError()).toBe(true);
    });

    it('clears a previous failure on a load that succeeds', async () => {
      const { store, db } = createStore();
      db.trackerRows.mockRejectedValueOnce(new Error('locked'));
      await store.load();
      expect(store.loadError()).toBe(true);

      await store.load();
      expect(store.loadError()).toBe(false);
    });

    // The two reads are one round trip, not two in sequence.
    it('reads each gateway method exactly once per load', async () => {
      const { store, db } = createStore();
      await store.load();
      expect(db.trackerRows).toHaveBeenCalledTimes(1);
      expect(db.getSettings).toHaveBeenCalledTimes(1);
    });

    it('reads a missing settings row as not German', async () => {
      const { store } = createStore([], null);
      await store.load();
      expect(store.isGerman()).toBe(false);
    });
  });

  describe('the derived views', () => {
    const rows = [
      row({ id: 1, jobId: 101, status: 'applied', appliedAt: '2026-08-01' }),
      row({ id: 2, jobId: 102, status: 'offer', appliedAt: '2026-08-02', archived: true }),
      row({ id: 3, jobId: 103, status: 'applied', appliedAt: '2026-08-03' }),
    ];

    it('shows the active rows and counts both segments', async () => {
      const { store } = createStore(rows);
      await loadAllPeriods(store);

      expect(store.view().map((r) => r.id)).toEqual([1, 3]);
      expect(store.activeCount()).toBe(2);
      expect(store.archivedCount()).toBe(1);
    });

    it('follows the segment', async () => {
      const { store } = createStore(rows);
      await loadAllPeriods(store);
      store.segment.set('archived');

      expect(store.view().map((r) => r.id)).toEqual([2]);
    });

    it('follows the status filter', async () => {
      const { store } = createStore(rows);
      await loadAllPeriods(store);
      store.statusFilter.set('applied');

      expect(store.view().map((r) => r.id)).toEqual([1, 3]);
    });

    // Asymmetric on the two counts against the two narrowing controls: the tabs
    // label how much is in each segment, so narrowing the grid must not change
    // them. A count derived from `view()` would follow the filter and pass any
    // fixture where nothing is filtered out.
    it('keeps both counts unchanged when the toolbar narrows the grid', async () => {
      const { store } = createStore(rows);
      await loadAllPeriods(store);
      store.statusFilter.set('offer');
      store.range.set('month');

      expect(store.view().map((r) => r.id)).toEqual([]);
      expect(store.activeCount()).toBe(2);
      expect(store.archivedCount()).toBe(1);
    });

    // The report and the grid deliberately disagree about archived rows.
    it('includes archived rows in the report and sorts them oldest first', async () => {
      const { store } = createStore(rows);
      await loadAllPeriods(store);

      expect(store.reportRows().map((r) => r.id)).toEqual([1, 2, 3]);
      expect(store.summary()).toMatchObject({ total: 3 });
    });

    // The reason `loadAllPeriods` exists, asserted rather than assumed: on the
    // default period a row with no application date is filtered out of both the
    // grid and the report, while the segment counts still see it.
    it('hides an undated row under the default period but still counts it', async () => {
      const { store } = createStore([row({ id: 9, jobId: 909 })]);
      await store.load();

      expect(store.range()).toBe('3months');
      expect(store.view()).toEqual([]);
      expect(store.reportRows()).toEqual([]);
      expect(store.activeCount()).toBe(1);

      store.range.set('all');
      expect(store.view().map((r) => r.id)).toEqual([9]);
    });

    it('leaves the report unaffected by the segment and the status filter', async () => {
      const { store } = createStore(rows);
      await loadAllPeriods(store);
      store.segment.set('archived');
      store.statusFilter.set('offer');

      expect(store.reportRows().map((r) => r.id)).toEqual([1, 2, 3]);
    });
  });

  describe('setArchived', () => {
    it('archives a row in place and moves it between the segments', async () => {
      const { store, db } = createStore([row({ id: 1 }), row({ id: 2 })]);
      await loadAllPeriods(store);

      await store.setArchived(row({ id: 1 }), true);

      expect(db.setApplicationArchived).toHaveBeenCalledWith(1, true);
      expect(store.view().map((r) => r.id)).toEqual([2]);
      expect(store.archivedCount()).toBe(1);
    });

    it('restores an archived row', async () => {
      const { store } = createStore([row({ id: 1, archived: true })]);
      await loadAllPeriods(store);

      await store.setArchived(row({ id: 1, archived: true }), false);

      expect(store.activeCount()).toBe(1);
      expect(store.archivedCount()).toBe(0);
    });

    it('leaves every other row alone', async () => {
      const { store } = createStore([row({ id: 1 }), row({ id: 2 })]);
      await loadAllPeriods(store);

      await store.setArchived(row({ id: 1 }), true);

      expect(store.all().find((r) => r.id === 2)?.archived).toBeUndefined();
    });

    it('propagates a gateway failure and leaves the row where it was', async () => {
      const { store, db } = createStore([row({ id: 1 })]);
      await loadAllPeriods(store);
      db.setApplicationArchived.mockRejectedValue(new Error('busy'));

      await expect(store.setArchived(row({ id: 1 }), true)).rejects.toThrow('busy');
      expect(store.activeCount()).toBe(1);
      expect(store.archivedCount()).toBe(0);
    });
  });

  describe('remove', () => {
    it('deletes the job behind the row and drops the row', async () => {
      const { store, db } = createStore([row({ id: 1, jobId: 101 }), row({ id: 2, jobId: 102 })]);
      await loadAllPeriods(store);

      await expect(store.remove(row({ id: 1, jobId: 101 }))).resolves.toBe(true);

      expect(db.deleteJob).toHaveBeenCalledWith(101);
      expect(store.all().map((r) => r.id)).toEqual([2]);
    });

    // Asymmetric on the row's two ids: the gateway takes `jobId`, the list is
    // filtered by `id`. Fixtures where they are equal cannot tell the two apart.
    it('deletes by jobId but removes by id', async () => {
      const { store, db } = createStore([row({ id: 7, jobId: 700 })]);
      await loadAllPeriods(store);

      await store.remove(row({ id: 7, jobId: 700 }));

      expect(db.deleteJob).toHaveBeenCalledWith(700);
      expect(store.all()).toEqual([]);
    });

    // Two rows against one job. The single-row fixture above cannot tell
    // `r.id !== row.id` from `r.jobId !== row.jobId` - both remove the target -
    // and only a shared jobId makes the second drop a row it should not.
    it('removes exactly the row asked for when two rows share a job', async () => {
      const { store } = createStore([row({ id: 1, jobId: 100 }), row({ id: 2, jobId: 100 })]);
      await loadAllPeriods(store);

      await store.remove(row({ id: 1, jobId: 100 }));

      expect(store.all().map((r) => r.id)).toEqual([2]);
    });

    it('reports a row with no job as no write, and does not reach the gateway', async () => {
      const { store, db } = createStore([row({ id: 1, jobId: undefined })]);
      await loadAllPeriods(store);

      await expect(store.remove(row({ id: 1, jobId: undefined }))).resolves.toBe(false);
      expect(db.deleteJob).not.toHaveBeenCalled();
      expect(store.all().map((r) => r.id)).toEqual([1]);
    });

    it('deletes a job whose id is zero rather than reading it as absent', async () => {
      const { store, db } = createStore([row({ id: 1, jobId: 0 })]);
      await loadAllPeriods(store);

      await expect(store.remove(row({ id: 1, jobId: 0 }))).resolves.toBe(true);
      expect(db.deleteJob).toHaveBeenCalledWith(0);
    });

    it('propagates a gateway failure and keeps the row', async () => {
      const { store, db } = createStore([row({ id: 1, jobId: 101 })]);
      await loadAllPeriods(store);
      db.deleteJob.mockRejectedValue(new Error('foreign key'));

      await expect(store.remove(row({ id: 1, jobId: 101 }))).rejects.toThrow('foreign key');
      expect(store.all().map((r) => r.id)).toEqual([1]);
    });
  });
});

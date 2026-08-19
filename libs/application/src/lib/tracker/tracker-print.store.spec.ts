import { TestBed } from '@angular/core/testing';
import type { TrackerRow } from '@applye/core';
import { DbService, DocumentsGateway, TrackerGateway } from '@applye/data';
import { TrackerPrintStore } from './tracker-print.store';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, ...over };
}

function createStore(rows: TrackerRow[] = []) {
  const db = {
    trackerRows: jest.fn().mockResolvedValue(rows),
    printWindowReady: jest.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      TrackerPrintStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: TrackerGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(TrackerPrintStore), db };
}

describe('TrackerPrintStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with nothing to print', () => {
    const { store } = createStore();
    expect(store.rows()).toEqual([]);
    expect(store.summary()).toEqual({ total: 0, rate: 0, avg: 0 });
  });

  describe('load', () => {
    it('sorts the rows oldest first and summarizes them', async () => {
      const { store } = createStore([
        row({ id: 1, status: 'offer', appliedAt: '2026-08-05', lastUpdate: '2026-08-09' }),
        row({ id: 2, status: 'applied', appliedAt: '2026-08-01' }),
      ]);

      await store.load('all');

      expect(store.rows().map((r) => r.id)).toEqual([2, 1]);
      expect(store.summary()).toEqual({ total: 2, rate: 50, avg: 4 });
    });

    // The whole reason this store exists: the hidden print window loads its own
    // rows, so its period rule must be the one the screen uses. Before this it
    // was a second copy with no test on either.
    // Asserts the summary as well as the rows. Asserting only the rows lets a
    // summary computed from the unnarrowed list pass, and the sheet would then
    // print in-period rows under an all-time total.
    it('narrows both the rows and the summary to the period it is given', async () => {
      const { store } = createStore([
        row({ id: 1, status: 'offer', appliedAt: '2020-01-01' }),
        row({ id: 2, status: 'applied', appliedAt: '2026-08-01' }),
      ]);

      await store.load('all');
      expect(store.rows().map((r) => r.id)).toEqual([1, 2]);
      expect(store.summary()).toMatchObject({ total: 2, rate: 50 });

      await store.load('month');
      expect(store.rows().map((r) => r.id)).toEqual([2]);
      expect(store.summary()).toMatchObject({ total: 1, rate: 0 });
    });

    it('includes archived rows, because the sheet is a record of what was applied for', async () => {
      const { store } = createStore([row({ id: 1, appliedAt: '2026-08-01', archived: true })]);

      await store.load('all');

      expect(store.rows().map((r) => r.id)).toEqual([1]);
      expect(store.summary().total).toBe(1);
    });

    it('prints an empty sheet when the gateway fails rather than hanging the export', async () => {
      const { store, db } = createStore();
      db.trackerRows.mockRejectedValue(new Error('locked'));

      await expect(store.load('all')).resolves.toBeUndefined();
      expect(store.rows()).toEqual([]);
      expect(store.summary()).toEqual({ total: 0, rate: 0, avg: 0 });
    });

    // Asymmetric: the first load is non-empty and the second fails, so a catch
    // that left the previous rows in place would print the wrong sheet.
    it('replaces the previous rows on a failed reload rather than reprinting them', async () => {
      const { store, db } = createStore([row({ id: 1, appliedAt: '2026-08-01' })]);
      await store.load('all');
      db.trackerRows.mockRejectedValue(new Error('locked'));

      await store.load('all');

      expect(store.rows()).toEqual([]);
    });

    it('reads the gateway exactly once', async () => {
      const { store, db } = createStore();
      await store.load('all');
      expect(db.trackerRows).toHaveBeenCalledTimes(1);
    });
  });

  describe('markPrintWindowReady', () => {
    it('tells the gateway the window is safe to print', async () => {
      const { store, db } = createStore();
      await store.markPrintWindowReady();
      expect(db.printWindowReady).toHaveBeenCalledTimes(1);
    });

    it('does not signal readiness merely because rows loaded', async () => {
      const { store, db } = createStore([row()]);
      await store.load('all');
      expect(db.printWindowReady).not.toHaveBeenCalled();
    });
  });
});

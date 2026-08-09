import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { JobOverview } from '@applye/core';
import { JobsStore } from '@applye/data';
import { MyJobsStore } from './my-jobs.store';

const row = (over: Partial<JobOverview> = {}): JobOverview =>
  ({
    id: 1,
    company: 'Acme',
    title: 'Engineer',
    claimed: true,
    status: 'applied',
    score: 70,
    legitimacyTier: 'green',
    createdAt: '2026-08-01',
    source: 'paste',
    ...over,
  }) as JobOverview;

function createStore(rows: JobOverview[], deleteJob = jest.fn().mockResolvedValue(undefined)) {
  const overview = signal(rows);
  const jobs = {
    overview,
    loading: signal(false),
    loadError: signal(false),
    loadOverview: jest.fn().mockResolvedValue(undefined),
    deleteJob,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [MyJobsStore, { provide: JobsStore, useValue: jobs }],
  });
  return { store: TestBed.inject(MyJobsStore), jobs, overview };
}

describe('MyJobsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('what the table shows', () => {
    /** ADR-0004: unclaimed rows are returned by the query so they can be found
     * again, but stay behind a filter that is off by default. */
    it('hides unclaimed rows until they are asked for', () => {
      const { store } = createStore([row({ id: 1 }), row({ id: 2, claimed: false })]);

      expect(store.view().map((r) => r.id)).toEqual([1]);

      store.showAnalysed.set(true);
      expect(store.view().map((r) => r.id)).toEqual([1, 2]);
    });

    it('searches company and title together, case-insensitively', () => {
      const { store } = createStore([
        row({ id: 1, company: 'Acme', title: 'Engineer' }),
        row({ id: 2, company: 'Globex', title: 'Designer' }),
      ]);

      store.search.set('  GLOB  ');
      expect(store.view().map((r) => r.id)).toEqual([2]);

      store.search.set('engineer');
      expect(store.view().map((r) => r.id)).toEqual([1]);
    });

    /** The status filter must be able to select the pseudo-status too. */
    it('filters by the analysed pseudo-status like any other', () => {
      const { store } = createStore([row({ id: 1 }), row({ id: 2, claimed: false })]);
      store.showAnalysed.set(true);

      store.statusFilter.set('analysed');

      expect(store.view().map((r) => r.id)).toEqual([2]);
    });

    it('treats a missing legitimacy tier as green', () => {
      const { store } = createStore([
        row({ id: 1, legitimacyTier: undefined }),
        row({ id: 2, legitimacyTier: 'red' }),
      ]);

      store.legitFilter.set('green');

      expect(store.view().map((r) => r.id)).toEqual([1]);
    });

    /** An unscored job scores -1 for the comparison, so a minimum of 0 excludes
     * it rather than letting a null pass as zero. */
    it('excludes unscored jobs from a minimum score', () => {
      const { store } = createStore([row({ id: 1, score: 80 }), row({ id: 2, score: null })]);

      store.minScore.set(0);

      expect(store.view().map((r) => r.id)).toEqual([1]);
    });

    it('separates "no jobs at all" from "the filters hid them"', () => {
      const { store } = createStore([row({ id: 1 })]);
      store.search.set('nothing matches this');

      expect(store.view()).toHaveLength(0);
      expect(store.isEmpty()).toBe(false);
    });
  });

  describe('sorting', () => {
    it('starts a new column ascending and flips it on the second click', () => {
      const { store } = createStore([row({ id: 1, company: 'B' }), row({ id: 2, company: 'A' })]);

      store.setSort('company');
      expect([store.sortKey(), store.sortDir()]).toEqual(['company', 'asc']);
      expect(store.view().map((r) => r.id)).toEqual([2, 1]);

      store.setSort('company');
      expect(store.sortDir()).toBe('desc');
      expect(store.view().map((r) => r.id)).toEqual([1, 2]);
    });

    it('sorts numbers numerically rather than as strings', () => {
      const { store } = createStore([
        row({ id: 1, score: 9 }),
        row({ id: 2, score: 80 }),
        row({ id: 3, score: 100 }),
      ]);

      store.setSort('score');

      expect(store.view().map((r) => r.score)).toEqual([9, 80, 100]);
    });
  });

  describe('deleting', () => {
    it('refuses silently when nothing is targeted', async () => {
      const { store, jobs } = createStore([row()]);

      expect(await store.confirmDelete()).toBeNull();
      expect(jobs.deleteJob).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('closes the confirmation once the row is gone', async () => {
      const { store, jobs } = createStore([row({ id: 7 })]);
      store.requestDelete(row({ id: 7 }));

      expect(await store.confirmDelete()).toBe(true);
      expect(jobs.deleteJob).toHaveBeenCalledWith(7);
      expect(store.deleteTarget()).toBeNull();
    });

    /**
     * A failed delete keeps the confirmation open, because closing it would
     * claim the row is gone when it is still there.
     */
    it('keeps the confirmation open and records the failure', async () => {
      const { store } = createStore(
        [row({ id: 7 })],
        jest.fn().mockRejectedValue(new Error('locked')),
      );
      store.requestDelete(row({ id: 7 }));

      expect(await store.confirmDelete()).toBe(false);
      expect(store.error()).toContain('locked');
      expect(store.deleteTarget()).not.toBeNull();
      expect(store.deleting()).toBe(false);
    });
  });
});

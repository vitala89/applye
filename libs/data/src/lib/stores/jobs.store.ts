import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Job, JobOverview } from '@applye/core';
import { DbService } from '../services/db.service';

type JobsState = {
  overview: JobOverview[];
  selected: Job | null;
  overviewLoaded: boolean;
  loading: boolean;
  loadError: boolean;
  mutating: boolean;
};

const initialState: JobsState = {
  overview: [],
  selected: null,
  overviewLoaded: false,
  loading: false,
  loadError: false,
  mutating: false,
};

/**
 * Shared reactive projection over the jobs list + currently open job detail.
 * SQLite (via DbService) stays the source of truth - this store only mirrors
 * it in memory so My Jobs and the job detail view stay in sync without a
 * full reload after every mutation.
 */
export const JobsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ overview, selected }) => ({
    selectedId: computed(() => selected()?.id ?? null),
    count: computed(() => overview().length),
  })),
  withMethods((store, db = inject(DbService)) => ({
    async loadOverview(force = false): Promise<void> {
      if (store.overviewLoaded() && !force) return;
      patchState(store, { loading: true, loadError: false });
      try {
        const overview = await db.listJobsOverview();
        patchState(store, { overview, overviewLoaded: true });
      } catch {
        patchState(store, { loadError: true });
      } finally {
        patchState(store, { loading: false });
      }
    },

    async loadJob(id: number): Promise<Job | null> {
      const job = await db.getJob(id);
      patchState(store, { selected: job });
      return job;
    },

    async deleteJob(id: number): Promise<void> {
      patchState(store, { mutating: true });
      try {
        await db.deleteJob(id);
        patchState(store, {
          overview: store.overview().filter((row) => row.id !== id),
          selected: store.selected()?.id === id ? null : store.selected(),
        });
      } finally {
        patchState(store, { mutating: false });
      }
    },

    patchOverviewRow(id: number, patch: Partial<JobOverview>): void {
      patchState(store, {
        overview: store.overview().map((row) => (row.id === id ? { ...row, ...patch } : row)),
      });
    },
  })),
);

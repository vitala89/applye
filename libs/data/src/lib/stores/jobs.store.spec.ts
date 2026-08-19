import { TestBed } from '@angular/core/testing';
import { JobOverview } from '@applye/core';
import { JobsGateway } from '../services/jobs.gateway';
import { JobsStore } from './jobs.store';

/**
 * The store is a cache in front of SQLite, so the behaviour worth pinning is
 * where it may and may not skip a read, and whether the in-memory mirror stays
 * truthful after a mutation. `libs/data` had one spec for the whole layer
 * before this; the store is the part of it that holds state, so it is the part
 * most able to drift.
 */
const row = (id: number): JobOverview =>
  ({ id, company: `Company ${id}`, title: `Role ${id}` }) as JobOverview;

describe('JobsStore', () => {
  let db: {
    listJobsOverview: jest.Mock<Promise<JobOverview[]>, []>;
    deleteJob: jest.Mock<Promise<void>, [number]>;
  };
  let store: JobsStore;

  beforeEach(() => {
    db = {
      listJobsOverview: jest.fn().mockResolvedValue([row(1), row(2)]),
      deleteJob: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: JobsGateway, useValue: db }],
    });
    store = TestBed.inject(JobsStore);
  });

  it('starts empty, with nothing loading and no error', () => {
    expect(store.overview()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.loadError()).toBe(false);
  });

  it('reads the overview once and caches it', async () => {
    await store.loadOverview();
    await store.loadOverview();

    expect(db.listJobsOverview).toHaveBeenCalledTimes(1);
    expect(store.overview().map((r) => r.id)).toEqual([1, 2]);
  });

  it('re-reads when forced', async () => {
    await store.loadOverview();
    db.listJobsOverview.mockResolvedValue([row(3)]);
    await store.loadOverview(true);

    expect(db.listJobsOverview).toHaveBeenCalledTimes(2);
    expect(store.overview().map((r) => r.id)).toEqual([3]);
  });

  it('records a failed read without leaving `loading` stuck on', async () => {
    db.listJobsOverview.mockRejectedValue(new Error('database is locked'));
    await store.loadOverview();

    expect(store.loadError()).toBe(true);
    expect(store.loading()).toBe(false);
    expect(store.overview()).toEqual([]);
  });

  it('clears a previous error on the next attempt, and retries the read', async () => {
    db.listJobsOverview.mockRejectedValueOnce(new Error('database is locked'));
    await store.loadOverview();
    expect(store.loadError()).toBe(true);

    // A failed load must not mark the overview as cached, or the retry below
    // would be skipped and the screen would stay empty until a forced reload.
    await store.loadOverview();

    expect(store.loadError()).toBe(false);
    expect(store.overview().map((r) => r.id)).toEqual([1, 2]);
  });

  it('drops the deleted row from the mirror', async () => {
    await store.loadOverview();
    await store.deleteJob(1);

    expect(db.deleteJob).toHaveBeenCalledWith(1);
    expect(store.overview().map((r) => r.id)).toEqual([2]);
  });

  it('leaves the mirror alone when the delete throws', async () => {
    await store.loadOverview();
    db.deleteJob.mockRejectedValue(new Error('foreign key constraint failed'));

    await expect(store.deleteJob(1)).rejects.toThrow();
    expect(store.overview().map((r) => r.id)).toEqual([1, 2]);
  });

  it('patches one row and leaves the others untouched', async () => {
    await store.loadOverview();
    store.patchOverviewRow(2, { title: 'Renamed' } as Partial<JobOverview>);

    expect(store.overview().find((r) => r.id === 2)?.title).toBe('Renamed');
    expect(store.overview().find((r) => r.id === 1)?.title).toBe('Role 1');
  });

  it('ignores a patch for an id it does not hold', async () => {
    await store.loadOverview();
    store.patchOverviewRow(99, { title: 'Nowhere' } as Partial<JobOverview>);

    expect(store.overview().map((r) => r.title)).toEqual(['Role 1', 'Role 2']);
  });
});

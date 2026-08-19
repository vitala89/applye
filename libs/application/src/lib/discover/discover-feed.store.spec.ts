import { TestBed } from '@angular/core/testing';
import type { DiscoverFeedItem } from '@applye/core';
import { DbService, DiscoverGateway, DocumentsGateway } from '@applye/data';
import { DiscoverFeedStore, FEED_PAGE } from './discover-feed.store';

function item(): DiscoverFeedItem {
  return {
    id: 1,
    title: 'Senior Frontend Engineer',
    company: 'Northwind Labs',
    location: 'Berlin, Germany',
    source: 'remoteok',
    createdAt: '2026-08-01',
    discoverShownAt: '2026-08-02',
    saved: false,
  } as unknown as DiscoverFeedItem;
}

interface Db {
  discoverFeed: jest.Mock;
  discoverDismiss: jest.Mock;
  discoverClear: jest.Mock;
  upsertApplication: jest.Mock;
}

function createStore(over: Partial<Db> = {}): { store: DiscoverFeedStore; db: Db } {
  const db: Db = {
    discoverFeed: jest.fn().mockResolvedValue([]),
    discoverDismiss: jest.fn().mockResolvedValue(undefined),
    discoverClear: jest.fn().mockResolvedValue(0),
    upsertApplication: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DiscoverFeedStore,
      // One stub, two tokens: the store reads the feed through
      // `DiscoverGateway` and still saves an application through `DbService`,
      // which belongs to the jobs domain and has not moved.
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: DiscoverGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(DiscoverFeedStore), db };
}

describe('DiscoverFeedStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
  });

  describe('reading the feed', () => {
    it('starts empty, showing the first page', () => {
      const { store } = createStore();
      expect(store.rows()).toEqual([]);
      expect(store.displayCount()).toBe(FEED_PAGE);
      expect(store.hasClearableJobs()).toBe(false);
    });

    /**
     * `discoverShownAt` is the database's record of having shown the row. Null
     * means it has not been, which is the whole meaning of the "new" marker.
     */
    it('marks a row as new only when the database never showed it', async () => {
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([
          { ...item(), id: 1, discoverShownAt: null },
          { ...item(), id: 2, discoverShownAt: '2026-08-02' },
        ]),
      });
      await store.load();
      expect(store.rows().map((r) => r.isNew)).toEqual([true, false]);
    });

    it('reads every row back as not dismissed', async () => {
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([item(), { ...item(), id: 2 }]),
      });
      await store.load();
      expect(store.rows().every((r) => !r.dismissed)).toBe(true);
    });

    /** A fresh read is a fresh list: the window must not stay scrolled open. */
    it('resets the render window on every read', async () => {
      const { store } = createStore();
      store.showMore();
      store.showMore();
      expect(store.displayCount()).toBe(FEED_PAGE * 3);

      await store.load();
      expect(store.displayCount()).toBe(FEED_PAGE);
    });

    it('grows the window by one page at a time', () => {
      const { store } = createStore();
      store.showMore();
      expect(store.displayCount()).toBe(FEED_PAGE * 2);
    });
  });

  describe('hasClearableJobs', () => {
    it('is false when every row is saved, because clearing would delete nothing', async () => {
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([{ ...item(), saved: true }]),
      });
      await store.load();
      expect(store.hasClearableJobs()).toBe(false);
    });

    it('is true as soon as one row is unsaved', async () => {
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([
          { ...item(), id: 1, saved: true },
          { ...item(), id: 2 },
        ]),
      });
      await store.load();
      expect(store.hasClearableJobs()).toBe(true);
    });
  });

  describe('saving a row', () => {
    it('writes it, then marks the row saved and no longer new', async () => {
      const { store, db } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([{ ...item(), discoverShownAt: null }]),
      });
      await store.load();

      const error = await store.save(1);

      expect(error).toBeNull();
      expect(db.upsertApplication).toHaveBeenCalledWith({ jobId: 1, status: 'saved' });
      expect(store.rows()[0]).toMatchObject({ saved: true, isNew: false });
    });

    /**
     * Mirrored after the write, unlike dismissal: saving is what the user asked
     * for, so a failure means it did not happen and showing it as saved would
     * be a lie the toast then contradicts.
     */
    it('leaves the row alone when the write fails', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([item()]),
        upsertApplication: jest.fn().mockRejectedValue(new Error('db is gone')),
      });
      await store.load();

      const error = await store.save(1);

      expect(error).toContain('db is gone');
      expect(store.rows()[0].saved).toBe(false);
    });

    it('touches only the row it was given', async () => {
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([item(), { ...item(), id: 2 }]),
      });
      await store.load();
      await store.save(2);
      expect(store.rows().map((r) => r.saved)).toEqual([false, true]);
    });
  });

  describe('dismissing a row', () => {
    /**
     * Mirrored before the write, unlike saving: dismissal is a triage gesture
     * over a long list with an undo in reach, and waiting for the database
     * would make the list feel stuck.
     */
    it('hides the row before the write, not after', async () => {
      let release: (v: unknown) => void = () => undefined;
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([item()]),
        discoverDismiss: jest.fn().mockImplementation(() => new Promise((r) => (release = r))),
      });
      await store.load();

      const pending = store.setDismissed(1, true);
      expect(store.rows()[0].dismissed).toBe(true);

      release(undefined);
      expect(await pending).toBeNull();
    });

    it('brings it back on undo', async () => {
      const { store, db } = createStore({ discoverFeed: jest.fn().mockResolvedValue([item()]) });
      await store.load();

      await store.setDismissed(1, true);
      await store.setDismissed(1, false);

      expect(store.rows()[0].dismissed).toBe(false);
      expect(db.discoverDismiss).toHaveBeenLastCalledWith(1, false);
    });

    /** The row stays hidden and the failure is reported; the next read is truth. */
    it('reports a failed write without putting the row back', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([item()]),
        discoverDismiss: jest.fn().mockRejectedValue(new Error('db is gone')),
      });
      await store.load();

      const error = await store.setDismissed(1, true);

      expect(error).toContain('db is gone');
      expect(store.rows()[0].dismissed).toBe(true);
    });
  });

  describe('clearing the feed', () => {
    it('reports how many were removed and reads the feed back', async () => {
      const discoverFeed = jest.fn().mockResolvedValueOnce([item(), { ...item(), id: 2 }]);
      const { store, db } = createStore({
        discoverFeed,
        discoverClear: jest.fn().mockResolvedValue(2),
      });
      await store.load();
      expect(store.rows()).toHaveLength(2);

      discoverFeed.mockResolvedValue([]);
      const result = await store.clear();

      expect(result).toEqual({ removed: 2 });
      expect(store.rows()).toEqual([]);
      expect(db.discoverClear).toHaveBeenCalled();
    });

    it('reports the failure and leaves the rows alone', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { store } = createStore({
        discoverFeed: jest.fn().mockResolvedValue([item()]),
        discoverClear: jest.fn().mockRejectedValue(new Error('db is gone')),
      });
      await store.load();

      const result = await store.clear();

      expect(result).toEqual({ error: expect.stringContaining('db is gone') });
      expect(store.rows()).toHaveLength(1);
    });

    /**
     * The caller about to scan anyway does not want the feed read back: those
     * rows are replaced moments later, so the read is one round trip for rows
     * nobody sees.
     */
    it('discards without reading the feed back', async () => {
      const discoverFeed = jest.fn().mockResolvedValue([item()]);
      const { store } = createStore({
        discoverFeed,
        discoverClear: jest.fn().mockResolvedValue(3),
      });
      await store.load();
      discoverFeed.mockClear();

      expect(await store.discardUnsaved()).toBe(3);
      expect(discoverFeed).not.toHaveBeenCalled();
    });

    /** That caller continues past a failure, so this one raises rather than reports. */
    it('raises from discardUnsaved rather than reporting', async () => {
      const { store } = createStore({
        discoverClear: jest.fn().mockRejectedValue(new Error('db is gone')),
      });
      await expect(store.discardUnsaved()).rejects.toThrow('db is gone');
    });
  });
});

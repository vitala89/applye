import { TestBed } from '@angular/core/testing';
import type { TrackerCustomColumn } from '@applye/core';
import { TrackerGateway } from '@applye/data';
import { TrackerColumnsStore } from './tracker-columns.store';

function column(over: Partial<TrackerCustomColumn> = {}): TrackerCustomColumn {
  return { id: 'cf_1', label: 'Referral', type: 'text', sort: 0, ...over };
}

function createStore(stored: TrackerCustomColumn[] = []) {
  const db = {
    trackerCustomColumns: jest.fn().mockResolvedValue(stored),
    addTrackerCustomColumn: jest
      .fn()
      .mockImplementation((id: string, label: string, type: TrackerCustomColumn['type']) =>
        Promise.resolve(column({ id, label, type })),
      ),
    removeTrackerCustomColumn: jest.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [TrackerColumnsStore, { provide: TrackerGateway, useValue: db }],
  });
  return { store: TestBed.inject(TrackerColumnsStore), db };
}

describe('TrackerColumnsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with the essential columns showing and no custom columns', () => {
    const { store } = createStore();
    expect(store.isVisible('company')).toBe(true);
    expect(store.isVisible('techStack')).toBe(false);
    expect(store.customColumns()).toEqual([]);
    expect(store.visibleColumns().every((c) => !c.custom)).toBe(true);
  });

  it('reads an unknown key as hidden', () => {
    const { store } = createStore();
    expect(store.isVisible('no-such-column')).toBe(false);
  });

  describe('load', () => {
    it('takes the stored custom columns', async () => {
      const { store } = createStore([column(), column({ id: 'cf_2', label: 'Take-home' })]);
      await store.load();

      expect(store.customColumns().map((c) => c.id)).toEqual(['cf_1', 'cf_2']);
      expect(
        store
          .visibleColumns()
          .slice(-2)
          .map((c) => c.key),
      ).toEqual(['cf_1', 'cf_2']);
    });

    it('does not reject when the gateway fails, and still renders the built-in columns', async () => {
      const { store, db } = createStore();
      db.trackerCustomColumns.mockRejectedValue(new Error('locked'));

      await expect(store.load()).resolves.toBeUndefined();
      expect(store.customColumns()).toEqual([]);
      expect(store.visibleColumns().length).toBeGreaterThan(0);
    });

    // Asymmetric: the list is non-empty BEFORE the failing reload. With an
    // empty store, "keep what you have" and "reset to []" agree, and a catch
    // that wiped the user's columns would pass. The page reloads its columns
    // after every row save, so this path is reached by an ordinary save.
    it('keeps the columns already loaded when a later reload fails', async () => {
      const { store, db } = createStore([column(), column({ id: 'cf_2', label: 'Take-home' })]);
      await store.load();
      db.trackerCustomColumns.mockRejectedValue(new Error('locked'));

      await store.load();

      expect(store.customColumns().map((c) => c.id)).toEqual(['cf_1', 'cf_2']);
      expect(store.visibleColumns().map((c) => c.key)).toContain('cf_2');
    });

    it('reads the gateway exactly once', async () => {
      const { store, db } = createStore();
      await store.load();
      expect(db.trackerCustomColumns).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggle', () => {
    it('switches a hidden column on and a showing column off', () => {
      const { store } = createStore();
      store.toggle('techStack');
      store.toggle('company');

      expect(store.isVisible('techStack')).toBe(true);
      expect(store.isVisible('company')).toBe(false);
    });

    it('moves the column into and out of the visible list', () => {
      const { store } = createStore();
      expect(store.visibleColumns().map((c) => c.key)).not.toContain('location');

      store.toggle('location');
      expect(store.visibleColumns().map((c) => c.key)).toContain('location');
    });

    it('leaves every other column alone', () => {
      const { store } = createStore();
      store.toggle('techStack');

      expect(store.isVisible('company')).toBe(true);
      expect(store.isVisible('location')).toBe(false);
    });

    // Recorded rather than desired: `pin` blocks the switch in the column
    // panel's markup, not here. Preserved verbatim from the page so this
    // migration changes no behaviour; moving the guard into the store is a
    // separate decision.
    it('does not itself refuse a pinned column', () => {
      const { store } = createStore();
      store.toggle('company');
      expect(store.isVisible('company')).toBe(false);
    });
  });

  describe('addColumn', () => {
    it('creates the column, appends it, and clears the form', async () => {
      const { store, db } = createStore();
      store.newColumnName.set('  Referral  ');
      store.newColumnType.set('yesno');

      const created = await store.addColumn();

      expect(db.addTrackerCustomColumn).toHaveBeenCalledWith(
        expect.stringMatching(/^cf_\d+$/),
        'Referral',
        'yesno',
      );
      expect(created?.label).toBe('Referral');
      expect(store.customColumns().map((c) => c.label)).toEqual(['Referral']);
      expect(store.newColumnName()).toBe('');
      expect(store.newColumnType()).toBe('text');
    });

    it('shows the new column in the visible list straight away', async () => {
      const { store } = createStore();
      store.newColumnName.set('Referral');
      await store.addColumn();

      expect(store.visibleColumns().at(-1)).toMatchObject({ custom: true, label: 'Referral' });
    });

    it('reports a blank name as no write, and does not reach the gateway', async () => {
      const { store, db } = createStore();
      store.newColumnName.set('   ');

      await expect(store.addColumn()).resolves.toBeNull();
      expect(db.addTrackerCustomColumn).not.toHaveBeenCalled();
      expect(store.customColumns()).toEqual([]);
    });

    // Asymmetric on the two form signals: the name is non-default AND the type
    // is non-default, so a failure that reset only one of them is visible.
    it('propagates a gateway failure and keeps both form fields', async () => {
      const { store, db } = createStore();
      db.addTrackerCustomColumn.mockRejectedValue(new Error('disk full'));
      store.newColumnName.set('Referral');
      store.newColumnType.set('date');

      await expect(store.addColumn()).rejects.toThrow('disk full');
      expect(store.newColumnName()).toBe('Referral');
      expect(store.newColumnType()).toBe('date');
      expect(store.customColumns()).toEqual([]);
    });

    it('writes exactly once per call', async () => {
      const { store, db } = createStore();
      store.newColumnName.set('Referral');
      await store.addColumn();
      expect(db.addTrackerCustomColumn).toHaveBeenCalledTimes(1);
      expect(db.trackerCustomColumns).not.toHaveBeenCalled();
    });
  });

  describe('removeColumn', () => {
    it('removes the named column and leaves the others', async () => {
      const { store, db } = createStore([column(), column({ id: 'cf_2', label: 'Take-home' })]);
      await store.load();

      await store.removeColumn('cf_1');

      expect(db.removeTrackerCustomColumn).toHaveBeenCalledWith('cf_1');
      expect(store.customColumns().map((c) => c.id)).toEqual(['cf_2']);
    });

    it('propagates a gateway failure and keeps the column', async () => {
      const { store, db } = createStore([column()]);
      await store.load();
      db.removeTrackerCustomColumn.mockRejectedValue(new Error('busy'));

      await expect(store.removeColumn('cf_1')).rejects.toThrow('busy');
      expect(store.customColumns().map((c) => c.id)).toEqual(['cf_1']);
    });

    it('leaves the list alone when the id is unknown', async () => {
      const { store } = createStore([column()]);
      await store.load();

      await store.removeColumn('cf_missing');
      expect(store.customColumns().map((c) => c.id)).toEqual(['cf_1']);
    });
  });
});

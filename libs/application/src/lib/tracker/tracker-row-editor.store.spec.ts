import { TestBed } from '@angular/core/testing';
import type { TrackerRow } from '@applye/core';
import { DbService, TrackerGateway } from '@applye/data';
import { TrackerColumnDef } from './tracker-columns';
import { TrackerRowEditorStore } from './tracker-row-editor.store';
import { TrackerRowsStore } from './tracker-rows.store';

function row(over: Partial<TrackerRow> = {}): TrackerRow {
  return { id: 1, jobId: 100, ...over };
}

function col(over: Partial<TrackerColumnDef> = {}): TrackerColumnDef {
  return { key: 'notes', src: 'app', editable: true, ...over };
}

function createStore(rows: TrackerRow[] = []) {
  const db = {
    trackerRows: jest.fn().mockResolvedValue(rows),
    getSettings: jest.fn().mockResolvedValue(null),
    updateApplicationTrackerFields: jest.fn().mockResolvedValue(undefined),
    setApplicationStatus: jest.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      TrackerRowsStore,
      TrackerRowEditorStore,
      { provide: DbService, useValue: db },
      { provide: TrackerGateway, useValue: db },
    ],
  });
  return {
    store: TestBed.inject(TrackerRowEditorStore),
    rows: TestBed.inject(TrackerRowsStore),
    db,
    reload: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TrackerRowEditorStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with nothing open', () => {
    const { store } = createStore();
    expect(store.editId()).toBeNull();
    expect(store.draft()).toBeNull();
    expect(store.saving()).toBe(false);
  });

  describe('start and cancel', () => {
    it('opens a row over a copy of it, with its custom values decoded', () => {
      const { store } = createStore();
      store.start(row({ id: 5, notes: 'hi', customFields: '{"cf_1":"yes"}' }));

      expect(store.editId()).toBe(5);
      expect(store.draft()).toMatchObject({ id: 5, notes: 'hi' });
      expect(store.draftCustom()).toEqual({ cf_1: 'yes' });
    });

    // The draft is a copy, so typing into it must not reach the list the grid
    // is rendering from.
    it('does not write through to the row it was opened on', () => {
      const { store } = createStore();
      const original = row({ id: 5, notes: 'before' });
      store.start(original);
      store.setValue(col({ key: 'notes' }), 'after');

      expect(original.notes).toBe('before');
      expect(store.draft()?.notes).toBe('after');
    });

    it('reads a malformed custom blob as no values rather than throwing', () => {
      const { store } = createStore();
      store.start(row({ customFields: '{not json' }));
      expect(store.draftCustom()).toEqual({});
    });

    it('knows which row is open', () => {
      const { store } = createStore();
      store.start(row({ id: 5 }));

      expect(store.isEditing(row({ id: 5 }))).toBe(true);
      expect(store.isEditing(row({ id: 6 }))).toBe(false);
    });

    it('closes and discards the draft', () => {
      const { store } = createStore();
      store.start(row({ id: 5 }));
      store.cancel();

      expect(store.editId()).toBeNull();
      expect(store.draft()).toBeNull();
      expect(store.isEditing(row({ id: 5 }))).toBe(false);
    });
  });

  describe('setValue', () => {
    // Asymmetric on the two sinks: a built-in column writes the draft row, a
    // custom one writes the map, and neither may touch the other.
    it('routes a built-in column to the draft and a custom one to the map', () => {
      const { store } = createStore();
      store.start(row({ id: 5 }));

      store.setValue(col({ key: 'notes' }), 'written');
      store.setValue(col({ key: 'cf_1', custom: true }), 'typed');

      expect(store.draft()?.notes).toBe('written');
      expect(store.draftCustom()).toEqual({ cf_1: 'typed' });
      expect(store.draft()).not.toHaveProperty('cf_1');
    });

    it('reads back through value(), for both kinds of column', () => {
      const { store } = createStore();
      store.start(row({ id: 5 }));

      store.setValue(col({ key: 'notes' }), 'written');
      store.setValue(col({ key: 'cf_1', custom: true }), 'typed');

      expect(store.value(col({ key: 'notes' }))).toBe('written');
      expect(store.value(col({ key: 'cf_1', custom: true }))).toBe('typed');
    });

    it('keeps custom values already typed when another is written', () => {
      const { store } = createStore();
      store.start(row({ id: 5 }));

      store.setValue(col({ key: 'cf_1', custom: true }), 'one');
      store.setValue(col({ key: 'cf_2', custom: true }), 'two');

      expect(store.draftCustom()).toEqual({ cf_1: 'one', cf_2: 'two' });
    });

    it('does nothing to a draft that is not open', () => {
      const { store } = createStore();
      store.setValue(col({ key: 'notes' }), 'written');
      expect(store.draft()).toBeNull();
    });
  });

  describe('save', () => {
    it('writes the fields, closes the editor and reloads', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5, status: 'applied' })]);
      await rows.load();
      store.start(row({ id: 5, status: 'applied' }));
      store.setValue(col({ key: 'notes' }), 'written');

      await expect(store.save(reload)).resolves.toBe(true);

      expect(db.updateApplicationTrackerFields).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5, notes: 'written' }),
      );
      expect(reload).toHaveBeenCalledTimes(1);
      expect(store.editId()).toBeNull();
      expect(store.draft()).toBeNull();
      expect(store.saving()).toBe(false);
    });

    it('writes the status only when it changed', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5, status: 'applied' })]);
      await rows.load();

      store.start(row({ id: 5, status: 'applied' }));
      await store.save(reload);
      expect(db.setApplicationStatus).not.toHaveBeenCalled();

      store.start(row({ id: 5, status: 'applied' }));
      store.setValue(col({ key: 'status', type: 'status' }), 'offer');
      await store.save(reload);
      expect(db.setApplicationStatus).toHaveBeenCalledWith(5, 'offer');
    });

    // Asymmetric on the two writes: the fields always go, the status only
    // sometimes. A fixture where both fire cannot show the second is
    // conditional, and one where neither does cannot show the first is not.
    it('writes the fields even when the status did not change', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5, status: 'applied' })]);
      await rows.load();
      store.start(row({ id: 5, status: 'applied' }));

      await store.save(reload);

      expect(db.updateApplicationTrackerFields).toHaveBeenCalledTimes(1);
      expect(db.setApplicationStatus).not.toHaveBeenCalled();
    });

    it('compares the status against the stored row, not against the draft', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5, status: 'applied' })]);
      await rows.load();
      store.start(row({ id: 5, status: 'offer' })); // draft opened from a stale row

      await store.save(reload);

      expect(db.setApplicationStatus).toHaveBeenCalledWith(5, 'offer');
    });

    it('reports no draft as no write, and does not reach the gateway', async () => {
      const { store, db, reload } = createStore();

      await expect(store.save(reload)).resolves.toBe(false);
      expect(db.updateApplicationTrackerFields).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    // `saving` guards re-entry, so a second click while the first write is in
    // flight must not produce a second write.
    it('refuses a second save while one is running', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5 })]);
      await rows.load();
      let release: () => void = () => undefined;
      db.updateApplicationTrackerFields.mockReturnValue(
        new Promise<void>((r) => (release = () => r())),
      );
      store.start(row({ id: 5 }));

      const first = store.save(reload);
      await expect(store.save(reload)).resolves.toBe(false);
      release();
      await first;

      expect(db.updateApplicationTrackerFields).toHaveBeenCalledTimes(1);
    });

    it('holds saving true for the whole operation, reload included', async () => {
      const { store, rows, reload } = createStore([row({ id: 5 })]);
      await rows.load();
      store.start(row({ id: 5 }));
      reload.mockImplementation(async () => {
        expect(store.saving()).toBe(true);
      });

      await store.save(reload);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(store.saving()).toBe(false);
    });

    it('propagates a field-write failure and keeps the editor open over the draft', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5 })]);
      await rows.load();
      db.updateApplicationTrackerFields.mockRejectedValue(new Error('disk full'));
      store.start(row({ id: 5 }));
      store.setValue(col({ key: 'notes' }), 'written');

      await expect(store.save(reload)).rejects.toThrow('disk full');

      expect(store.editId()).toBe(5);
      expect(store.draft()?.notes).toBe('written');
      expect(store.saving()).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    });

    it('propagates a status-write failure, having already written the fields', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5, status: 'applied' })]);
      await rows.load();
      db.setApplicationStatus.mockRejectedValue(new Error('busy'));
      store.start(row({ id: 5, status: 'applied' }));
      store.setValue(col({ key: 'status', type: 'status' }), 'offer');

      await expect(store.save(reload)).rejects.toThrow('busy');

      expect(db.updateApplicationTrackerFields).toHaveBeenCalledTimes(1);
      expect(store.editId()).toBe(5);
      expect(reload).not.toHaveBeenCalled();
    });

    it('clears saving after a failure, so the row can be saved again', async () => {
      const { store, rows, db, reload } = createStore([row({ id: 5 })]);
      await rows.load();
      db.updateApplicationTrackerFields.mockRejectedValueOnce(new Error('disk full'));
      store.start(row({ id: 5 }));

      await expect(store.save(reload)).rejects.toThrow('disk full');
      await expect(store.save(reload)).resolves.toBe(true);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import type { Settings } from '@applye/core';
import { DbService, DocumentsGateway, JobsGateway, KeysService } from '@applye/data';
import { SettingsStore } from './settings.store';

const ROW = { provider: 'claude', aiMode: 'api', uiLanguage: 'en' } as Settings;

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    getSettings: jest.fn().mockResolvedValue(ROW),
    updateSettings: jest.fn().mockImplementation(async (p) => ({ ...ROW, ...p })),
    resetAllData: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  const keys = {
    deleteProviderKey: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SettingsStore,
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: KeysService, useValue: keys },
    ],
  });
  return { store: TestBed.inject(SettingsStore), db, keys };
}

describe('SettingsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('loading', () => {
    /** The page re-applies the locale and asks about the key from this return
     * value, rather than re-reading the signal it just set. */
    it('returns the row it loaded', async () => {
      const { store } = createStore();

      expect(await store.load()).toEqual(ROW);
      expect(store.record()).toEqual(ROW);
      expect(store.loading()).toBe(false);
    });

    it('answers null and carries what to say', async () => {
      const { store } = createStore({ getSettings: jest.fn().mockRejectedValue(new Error('io')) });

      expect(await store.load()).toBeNull();
      expect(store.error()).toContain('io');
      expect(store.loading()).toBe(false);
    });
  });

  describe('patching and saving', () => {
    it('records a field without writing it', async () => {
      const { store, db } = createStore();
      await store.load();

      store.patch('uiLanguage', 'de');

      expect(store.record()?.uiLanguage).toBe('de');
      expect(db.updateSettings).not.toHaveBeenCalled();
    });

    it('does nothing when nothing is loaded', () => {
      const { store } = createStore();
      store.patch('uiLanguage', 'de');
      expect(store.record()).toBeNull();
    });

    it('writes the whole row on save and adopts what came back', async () => {
      const { store, db } = createStore({
        updateSettings: jest.fn().mockResolvedValue({ ...ROW, uiLanguage: 'de' }),
      });
      await store.load();

      expect(await store.save()).toBe(true);
      expect(db.updateSettings).toHaveBeenCalledWith(ROW);
      expect(store.record()?.uiLanguage).toBe('de');
      expect(store.saving()).toBe(false);
    });

    it('reports a failed save', async () => {
      const { store } = createStore({
        updateSettings: jest.fn().mockRejectedValue(new Error('disk')),
      });
      await store.load();

      expect(await store.save()).toBe(false);
      expect(store.error()).toContain('disk');
      expect(store.saving()).toBe(false);
    });
  });

  describe('persisting a subset immediately', () => {
    it('writes only what it was given and keeps the record in step', async () => {
      const { store, db } = createStore();
      await store.load();

      expect(await store.persist({ geoScope: 'europe', market: '' })).toBe(true);
      expect(db.updateSettings).toHaveBeenCalledWith({ geoScope: 'europe', market: '' });
      expect(store.record()?.geoScope).toBe('europe');
    });

    /** The optimistic write has to be undone exactly, or the screen shows a
     * value the database refused. */
    it('rolls back to what was there when the write fails', async () => {
      const { store } = createStore({
        updateSettings: jest.fn().mockRejectedValue(new Error('locked')),
      });
      await store.load();

      expect(await store.persist({ geoScope: 'europe' })).toBe(false);
      expect(store.record()).toEqual(ROW);
      expect(store.error()).toContain('locked');
    });
  });

  describe('the factory reset', () => {
    it('wipes the database and every provider key', async () => {
      const { store, db, keys } = createStore();

      expect(await store.resetAllData()).toBe(true);
      expect(db.resetAllData).toHaveBeenCalled();
      expect(keys.deleteProviderKey).toHaveBeenCalledTimes(5);
    });

    /** A provider with no stored key throws; one miss must not abort the rest
     * and leave a keychain half cleared. */
    it('keeps clearing keys when one provider has none', async () => {
      const { store, keys } = createStore({
        deleteProviderKey: jest
          .fn()
          .mockRejectedValueOnce(new Error('no entry'))
          .mockResolvedValue(undefined),
      });

      expect(await store.resetAllData()).toBe(true);
      expect(keys.deleteProviderKey).toHaveBeenCalledTimes(5);
    });

    /** The page reloads on success, so the flag stays set - clearing it here
     * would flash the armed dialog back for one frame. */
    it('stays in the running state on success', async () => {
      const { store } = createStore();
      store.requestReset(true);

      await store.resetAllData();

      expect(store.resetting()).toBe(true);
      expect(store.confirmingReset()).toBe(true);
    });

    /** On failure the confirmation closes as well: an armed "delete everything"
     * dialog is not a state to hand back over an error already reported. */
    it('closes the confirmation and stops running when the wipe fails', async () => {
      const { store } = createStore({
        resetAllData: jest.fn().mockRejectedValue(new Error('busy')),
      });
      store.requestReset(true);

      expect(await store.resetAllData()).toBe(false);
      expect(store.resetting()).toBe(false);
      expect(store.confirmingReset()).toBe(false);
      expect(store.error()).toContain('busy');
    });

    it('refuses a second reset while one is running', async () => {
      const { store, db } = createStore();
      store.resetting.set(true);

      expect(await store.resetAllData()).toBe(false);
      expect(db.resetAllData).not.toHaveBeenCalled();
    });
  });
});

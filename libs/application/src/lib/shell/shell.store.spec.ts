import { TestBed } from '@angular/core/testing';
import type { Settings } from '@applye/core';
import { DbService } from '@applye/data';
import { ShellStore } from './shell.store';

const SIDEBAR_KEY = 'applye.sidebar.collapsed';

const settings = (over: Partial<Settings> = {}): Settings =>
  ({ id: 1, uiLanguage: 'de', ...over }) as Settings;

function createStore(getSettings: jest.Mock) {
  const db = { getSettings };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [ShellStore, { provide: DbService, useValue: db }],
  });
  return { store: TestBed.inject(ShellStore), db };
}

describe('ShellStore', () => {
  beforeEach(() => globalThis.localStorage?.clear());
  afterEach(() => TestBed.resetTestingModule());

  describe('the stored UI language', () => {
    it('exposes the language the settings row holds', async () => {
      const { store } = createStore(jest.fn().mockResolvedValue(settings({ uiLanguage: 'de' })));

      expect(await store.load()).toBe(true);
      expect(store.uiLanguage()).toBe('de');
      expect(store.error()).toBe('');
    });

    /**
     * The shell keeps its defaults on a failed read and says nothing. That is a
     * failure, not a refusal, so `error` fills even though nothing renders it -
     * the distinction rule three of the store contract asks for.
     */
    it('fills error and leaves the language null when the read fails', async () => {
      const { store } = createStore(jest.fn().mockRejectedValue(new Error('db is gone')));

      expect(await store.load()).toBe(false);
      expect(store.uiLanguage()).toBeNull();
      expect(store.error()).toContain('db is gone');
    });

    /** A settings row without a language is not an error - it is the default. */
    it('leaves the language null when the row carries none', async () => {
      const { store } = createStore(
        jest.fn().mockResolvedValue(settings({ uiLanguage: undefined as unknown as 'en' })),
      );

      expect(await store.load()).toBe(true);
      expect(store.uiLanguage()).toBeNull();
      expect(store.error()).toBe('');
    });

    it('clears a previous error on the next successful read', async () => {
      const getSettings = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce(settings({ uiLanguage: 'fr' }));
      const { store } = createStore(getSettings);

      await store.load();
      expect(store.error()).not.toBe('');

      await store.load();
      expect(store.error()).toBe('');
      expect(store.uiLanguage()).toBe('fr');
    });
  });

  describe('the sidebar rail', () => {
    it('starts expanded when nothing was remembered', () => {
      const { store } = createStore(jest.fn().mockResolvedValue(settings()));

      expect(store.sidebarCollapsed()).toBe(false);
    });

    it('starts collapsed when the last session collapsed it', () => {
      globalThis.localStorage.setItem(SIDEBAR_KEY, '1');
      const { store } = createStore(jest.fn().mockResolvedValue(settings()));

      expect(store.sidebarCollapsed()).toBe(true);
    });

    /** The preference is per-machine, so it is written where it is read from -
     * localStorage - rather than into the settings table. */
    it('persists both directions of the toggle', () => {
      const { store } = createStore(jest.fn().mockResolvedValue(settings()));

      store.toggleSidebar();
      expect(store.sidebarCollapsed()).toBe(true);
      expect(globalThis.localStorage.getItem(SIDEBAR_KEY)).toBe('1');

      store.toggleSidebar();
      expect(store.sidebarCollapsed()).toBe(false);
      expect(globalThis.localStorage.getItem(SIDEBAR_KEY)).toBe('0');
    });

    it('does not touch the database when the rail is toggled', () => {
      const { store, db } = createStore(jest.fn().mockResolvedValue(settings()));

      store.toggleSidebar();

      expect(db.getSettings).not.toHaveBeenCalled();
    });
  });
});

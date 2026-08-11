import { TestBed } from '@angular/core/testing';
import { DbService } from '@applye/data';
import { BootGateStore } from './boot-gate.store';

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    getSettings: jest.fn().mockResolvedValue({ healthCheckSeen: true, onboardingSeen: true }),
    updateSettings: jest.fn().mockResolvedValue({}),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [BootGateStore, { provide: DbService, useValue: db }],
  });
  return { store: TestBed.inject(BootGateStore), db };
}

describe('BootGateStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('load', () => {
    /** A user who has been through both gates goes straight into the app. */
    it('opens the app when both flags are set', async () => {
      const { store } = createStore();
      expect(await store.load()).toBe('app');
    });

    /**
     * The welcome screen wins over the tour. It is the screen that *writes*
     * `healthCheckSeen`, so opening the tour first would leave the user able to
     * finish onboarding and then be shown the welcome screen afterwards.
     */
    it('opens the welcome screen first, even when onboarding is also unseen', async () => {
      const { store } = createStore({
        getSettings: jest.fn().mockResolvedValue({ healthCheckSeen: false, onboardingSeen: false }),
      });

      expect(await store.load()).toBe('first-launch');
    });

    it('opens onboarding once the welcome screen has been seen', async () => {
      const { store } = createStore({
        getSettings: jest.fn().mockResolvedValue({ healthCheckSeen: true, onboardingSeen: false }),
      });

      expect(await store.load()).toBe('onboarding');
    });

    /**
     * Fails open. Blocking startup on a health-flag read would trap the user
     * outside an application whose data is otherwise fine, and the flags are
     * the least important thing the app knows.
     */
    it('opens the app when the settings read throws', async () => {
      const { store } = createStore({
        getSettings: jest.fn().mockRejectedValue(new Error('db is locked')),
      });

      expect(await store.load()).toBe('app');
    });
  });

  describe('dismiss', () => {
    /**
     * Starting the tour must not mark onboarding seen - the tour is about to run,
     * and writing the flag here would stop it auto-opening the one time it should.
     */
    it('marks only the welcome seen when the tour is starting', async () => {
      const { store, db } = createStore();

      expect(await store.dismiss(true)).toBe(true);
      expect(db.updateSettings).toHaveBeenCalledWith({ healthCheckSeen: true });
    });

    /** Skipping marks both, so the tour never auto-opens; the empty-profile
     * banner is what nudges from inside the app instead. */
    it('marks onboarding seen as well when the tour is skipped', async () => {
      const { store, db } = createStore();

      expect(await store.dismiss(false)).toBe(true);
      expect(db.updateSettings).toHaveBeenCalledWith({
        healthCheckSeen: true,
        onboardingSeen: true,
      });
    });

    /**
     * The failure is recorded but never thrown: a user whose preference could not
     * be saved should still leave the welcome screen rather than be trapped on it.
     */
    it('records a failed write and still resolves', async () => {
      const { store } = createStore({
        updateSettings: jest.fn().mockRejectedValue(new Error('disk is full')),
      });

      expect(await store.dismiss(true)).toBe(false);
      expect(store.error()).toContain('disk is full');
    });

    it('clears a previous error on the next successful write', async () => {
      const { store } = createStore({
        updateSettings: jest
          .fn()
          .mockRejectedValueOnce(new Error('transient'))
          .mockResolvedValueOnce({}),
      });

      await store.dismiss(true);
      expect(store.error()).not.toBe('');

      await store.dismiss(true);
      expect(store.error()).toBe('');
    });
  });
});

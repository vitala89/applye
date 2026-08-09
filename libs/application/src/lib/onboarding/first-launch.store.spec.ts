import { TestBed } from '@angular/core/testing';
import { DbService } from '@applye/data';
import { FirstLaunchStore } from './first-launch.store';

function createStore(updateSettings: jest.Mock) {
  const db = { updateSettings };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [FirstLaunchStore, { provide: DbService, useValue: db }],
  });
  return { store: TestBed.inject(FirstLaunchStore), db };
}

describe('FirstLaunchStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  /**
   * Starting the tour must not mark onboarding seen - the tour is about to run,
   * and writing the flag here would stop it auto-opening the one time it should.
   */
  it('marks only the welcome seen when the tour is starting', async () => {
    const { store, db } = createStore(jest.fn().mockResolvedValue({}));

    expect(await store.dismiss(true)).toBe(true);
    expect(db.updateSettings).toHaveBeenCalledWith({ healthCheckSeen: true });
  });

  /** Skipping marks both, so the tour never auto-opens; the empty-profile
   * banner is what nudges from inside the app instead. */
  it('marks onboarding seen as well when the tour is skipped', async () => {
    const { store, db } = createStore(jest.fn().mockResolvedValue({}));

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
    const { store } = createStore(jest.fn().mockRejectedValue(new Error('disk is full')));

    expect(await store.dismiss(true)).toBe(false);
    expect(store.error()).toContain('disk is full');
  });

  it('clears a previous error on the next successful write', async () => {
    const { store } = createStore(
      jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce({}),
    );

    await store.dismiss(true);
    expect(store.error()).not.toBe('');

    await store.dismiss(true);
    expect(store.error()).toBe('');
  });
});

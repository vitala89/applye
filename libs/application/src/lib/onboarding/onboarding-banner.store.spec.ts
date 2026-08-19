import { TestBed } from '@angular/core/testing';
import type { Profile, Settings } from '@applye/core';
import { DocumentsGateway, JobsGateway, ProfileSettingsGateway } from '@applye/data';
import { OnboardingBannerStore } from './onboarding-banner.store';

const settings = (over: Partial<Settings> = {}): Settings =>
  ({ id: 1, onboardingSeen: true, healthCheckSeen: true, ...over }) as Settings;
const profile = (fullMd: string): Profile => ({ id: 1, fullMd, updatedAt: '' }) as Profile;

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    getSettings: jest.fn().mockResolvedValue(settings()),
    getProfile: jest.fn().mockResolvedValue(null),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      OnboardingBannerStore,
      { provide: ProfileSettingsGateway, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(OnboardingBannerStore), db };
}

describe('OnboardingBannerStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts hidden, so nothing flashes before the read lands', () => {
    const { store } = createStore();
    expect(store.visible()).toBe(false);
  });

  it('shows the nudge when onboarding was skipped and the profile is empty', async () => {
    const { store } = createStore();
    await store.load();
    expect(store.visible()).toBe(true);
  });

  it('stays hidden once the profile has content', async () => {
    const { store } = createStore({ getProfile: jest.fn().mockResolvedValue(profile('# Jane')) });
    await store.load();
    expect(store.visible()).toBe(false);
  });

  /**
   * The behaviour the component had before this state moved, and worth pinning
   * where it now lives: a banner is not worth an error state, and nagging a
   * user whose profile may well be complete is the worse of the two failures.
   */
  it('hides rather than rejecting when the gateway fails', async () => {
    const { store } = createStore({
      getSettings: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.visible()).toBe(false);
  });

  it('dismisses without touching the gateway again', async () => {
    const { store, db } = createStore();
    await store.load();
    store.dismiss();
    expect(store.visible()).toBe(false);
    expect(db.getSettings).toHaveBeenCalledTimes(1);
  });
});

import { TestBed } from '@angular/core/testing';
import { DocumentsGateway, JobsGateway, ProfileSettingsGateway } from '@applye/data';
import { DiscoverProfileContextStore } from './discover-profile-context.store';

interface Db {
  getProfile: jest.Mock;
  getSettings: jest.Mock;
}

const SETTINGS = {
  uiLanguage: 'en',
  geoScope: 'worldwide',
  market: null,
  lastScanMarket: null,
};

function createStore(over: Partial<Db> = {}): { store: DiscoverProfileContextStore; db: Db } {
  const db: Db = {
    getProfile: jest.fn().mockResolvedValue(null),
    getSettings: jest.fn().mockResolvedValue(SETTINGS),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DiscoverProfileContextStore,
      { provide: ProfileSettingsGateway, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(DiscoverProfileContextStore), db };
}

describe('DiscoverProfileContextStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with nothing to score against', () => {
    const { store } = createStore();
    expect(store.archetypes()).toEqual([]);
    expect(store.keywords()).toEqual([]);
    expect(store.hasCompTarget()).toBe(false);
    expect(store.geoScope()).toBe('worldwide');
  });

  describe('reading the profile', () => {
    it('survives a profile that does not exist yet', async () => {
      const { store } = createStore({ getProfile: jest.fn().mockResolvedValue(null) });
      await store.load();
      expect(store.archetypes()).toEqual([]);
      expect(store.keywords()).toEqual([]);
    });

    it('derives the keywords from the target roles', async () => {
      const { store } = createStore({
        getProfile: jest.fn().mockResolvedValue({
          targetArchetypes: JSON.stringify([
            { name: 'Frontend Engineer', fit: 'primary', sellWhen: '' },
          ]),
        }),
      });
      await store.load();

      expect(store.archetypes()).toHaveLength(1);
      expect(store.keywords().length).toBeGreaterThan(0);
    });

    /** Empty keywords is what "we cannot score this" means downstream. */
    it('has no keywords when no target role is set', async () => {
      const { store } = createStore({
        getProfile: jest.fn().mockResolvedValue({ targetArchetypes: null }),
      });
      await store.load();
      expect(store.keywords()).toEqual([]);
    });

    it('reads the compensation target out of the profile markdown', async () => {
      const { store } = createStore({
        getProfile: jest.fn().mockResolvedValue({
          fullMd:
            '## Compensation\n\n- Min: 90000\n- Max: 120000\n- Currency: EUR\n- Period: year\n',
        }),
      });
      await store.load();

      expect(store.hasCompTarget()).toBe(true);
      expect(store.compTarget().currency).toBe('EUR');
    });

    /**
     * Either end alone is a target, and a floor with no ceiling is the common
     * way people state one - requiring both would silently disable the salary
     * comparison for them.
     *
     * Only the floor-only case is tested, because only it exists: the parser is
     * positional and takes the first two numbers it finds, so a ceiling stated
     * without a floor is read as a floor. There is no markdown that produces a
     * `max` without a `min`.
     */
    it('counts a target stated as a floor with no ceiling', async () => {
      const { store } = createStore({
        getProfile: jest
          .fn()
          .mockResolvedValue({ fullMd: '## Compensation\n\n90000 EUR per year\n' }),
      });
      await store.load();

      expect(store.compTarget().min).toBe('90000');
      expect(store.compTarget().max).toBe('');
      expect(store.hasCompTarget()).toBe(true);
    });

    it('has no compensation target when the profile states none', async () => {
      const { store } = createStore({ getProfile: jest.fn().mockResolvedValue({ fullMd: '' }) });
      await store.load();
      expect(store.hasCompTarget()).toBe(false);
      expect(store.compTarget()).toEqual({ min: '', max: '', currency: '', period: '' });
    });
  });

  describe('reading the settings', () => {
    it('takes the geo scope, falling back to worldwide when it is blank', async () => {
      const { store: set } = createStore({
        getSettings: jest.fn().mockResolvedValue({ ...SETTINGS, geoScope: 'europe' }),
      });
      await set.load();
      expect(set.geoScope()).toBe('europe');

      const { store: blank } = createStore({
        getSettings: jest.fn().mockResolvedValue({ ...SETTINGS, geoScope: '' }),
      });
      await blank.load();
      expect(blank.geoScope()).toBe('worldwide');
    });

    /**
     * Markets are stored as a JSON array of known codes. A legacy single scalar
     * still reads as a one-item list, and anything unrecognised reads as none -
     * a market nothing serves must not silently narrow the search.
     */
    it('parses the selected markets', async () => {
      const { store } = createStore({
        getSettings: jest.fn().mockResolvedValue({ ...SETTINGS, market: '["de","pl"]' }),
      });
      await store.load();
      expect(store.markets()).toEqual(['de', 'pl']);
    });

    it('reads a legacy single market as a one-item list, and an unknown one as none', async () => {
      const { store: legacy } = createStore({
        getSettings: jest.fn().mockResolvedValue({ ...SETTINGS, market: 'de' }),
      });
      await legacy.load();
      expect(legacy.markets()).toEqual(['de']);

      const { store: unknown } = createStore({
        getSettings: jest.fn().mockResolvedValue({ ...SETTINGS, market: 'atlantis' }),
      });
      await unknown.load();
      expect(unknown.markets()).toEqual([]);
    });
  });

  /**
   * The banner exists to tell a stale feed from a fresh one: it is true when
   * the feed on screen was scanned under a different market than the one now
   * selected.
   */
  describe('the rescan banner', () => {
    it('is quiet when the feed was scanned under the current market', async () => {
      const { store } = createStore({
        getSettings: jest
          .fn()
          .mockResolvedValue({ ...SETTINGS, market: '["de"]', lastScanMarket: '["de"]' }),
      });
      await store.load();
      expect(store.marketChangedSinceScan()).toBe(false);
    });

    it('fires when the selected market no longer matches the scanned one', async () => {
      const { store } = createStore({
        getSettings: jest
          .fn()
          .mockResolvedValue({ ...SETTINGS, market: '["de","pl"]', lastScanMarket: '["de"]' }),
      });
      await store.load();
      expect(store.marketChangedSinceScan()).toBe(true);
    });

    /**
     * Compared as JSON rather than by set membership on purpose: order is part
     * of what the settings stored, and the same two countries in a different
     * order came from a different edit.
     */
    it('treats a reordered market list as changed', async () => {
      const { store } = createStore({
        getSettings: jest
          .fn()
          .mockResolvedValue({ ...SETTINGS, market: '["pl","de"]', lastScanMarket: '["de","pl"]' }),
      });
      await store.load();
      expect(store.marketChangedSinceScan()).toBe(true);
    });

    it('goes quiet once a scan records the market it ran under', async () => {
      const { store } = createStore({
        getSettings: jest
          .fn()
          .mockResolvedValue({ ...SETTINGS, market: '["de","pl"]', lastScanMarket: '["de"]' }),
      });
      await store.load();
      expect(store.marketChangedSinceScan()).toBe(true);

      store.markScanned();

      expect(store.marketChangedSinceScan()).toBe(false);
      expect(store.markets()).toEqual(['de', 'pl']);
    });
  });

  it('reads the profile and the settings together rather than one after the other', async () => {
    const order: string[] = [];
    const { store } = createStore({
      getProfile: jest.fn().mockImplementation(async () => {
        order.push('profile');
        return null;
      }),
      getSettings: jest.fn().mockImplementation(async () => {
        order.push('settings');
        return SETTINGS;
      }),
    });
    await store.load();
    // Both were in flight before either resolved.
    expect(order).toEqual(['profile', 'settings']);
  });

  it('raises when a read fails, leaving the page to report it', async () => {
    const { store } = createStore({
      getSettings: jest.fn().mockRejectedValue(new Error('db is gone')),
    });
    await expect(store.load()).rejects.toThrow('db is gone');
  });
});

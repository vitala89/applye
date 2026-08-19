import { TestBed } from '@angular/core/testing';
import {
  type MarketSourcePlan,
  type Settings,
  encodeGeoScopes,
  encodeLocalMarkets,
} from '@applye/core';
import {
  DbService,
  DiscoverGateway,
  DocumentsGateway,
  JobsGateway,
  KeysService,
} from '@applye/data';
import { GeoTargetStore } from './geo-target.store';
import { SettingsStore } from './settings.store';

const PLAN = {
  toEnable: [{ id: 1, name: 'StepStone', host: 'stepstone.de' }],
  toDisable: [],
} as unknown as MarketSourcePlan;

const EMPTY_PLAN = { toEnable: [], toDisable: [] } as unknown as MarketSourcePlan;

function createStore(row: Partial<Settings> = {}, over: Record<string, jest.Mock> = {}) {
  const db = {
    getSettings: jest.fn().mockResolvedValue({ geoScope: '', market: '', ...row } as Settings),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    marketSourcePlan: jest.fn().mockResolvedValue(PLAN),
    applyMarketSourcePlan: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SettingsStore,
      GeoTargetStore,
      // One stub, two tokens: the store itself reads the source plan through
      // `DiscoverGateway`, and its `SettingsStore` dependency still writes
      // settings through `DbService`, which has not moved.
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: DiscoverGateway, useValue: db },
      { provide: KeysService, useValue: {} },
    ],
  });
  return {
    store: TestBed.inject(GeoTargetStore),
    settings: TestBed.inject(SettingsStore),
    db,
  };
}

async function loaded(row: Partial<Settings> = {}, over: Record<string, jest.Mock> = {}) {
  const ctx = createStore(row, over);
  await ctx.settings.load();
  return ctx;
}

describe('GeoTargetStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('the two modes are mutually exclusive', () => {
    it('picking a region clears every market', async () => {
      const { store, db, settings } = await loaded({ market: encodeLocalMarkets(['de']) });

      expect(await store.toggleScope('europe')).toBe(true);

      expect(db.updateSettings).toHaveBeenCalledWith({
        geoScope: encodeGeoScopes(['europe']),
        market: encodeLocalMarkets([]),
      });
      expect(settings.record()?.market).toBe(encodeLocalMarkets([]));
    });

    it('picking a market clears the region scope', async () => {
      const { store, db } = await loaded({ geoScope: encodeGeoScopes(['europe']) });

      await store.toggleMarket('de');

      expect(db.updateSettings).toHaveBeenCalledWith({
        geoScope: encodeGeoScopes([]),
        market: encodeLocalMarkets(['de']),
      });
    });

    it('refuses Worldwide when the search is already unrestricted', async () => {
      const { store, db } = await loaded();
      store.error.set('an older failure');

      expect(await store.setWorldwide()).toBeNull();

      expect(db.updateSettings).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('clears both halves for Worldwide', async () => {
      const { store, db } = await loaded({ geoScope: encodeGeoScopes(['europe']) });

      expect(await store.setWorldwide()).toBe(true);
      expect(db.updateSettings).toHaveBeenCalledWith({
        geoScope: encodeGeoScopes([]),
        market: encodeLocalMarkets([]),
      });
    });
  });

  describe('the source-change offer', () => {
    it('is prepared but never written by itself', async () => {
      const { store, db } = await loaded();

      await store.toggleMarket('de');

      expect(db.marketSourcePlan).toHaveBeenCalledWith(['de']);
      expect(db.applyMarketSourcePlan).not.toHaveBeenCalled();
      expect(store.plan()).toEqual(PLAN);
    });

    it('offers nothing when the plan would change nothing', async () => {
      const { store } = await loaded(
        {},
        { marketSourcePlan: jest.fn().mockResolvedValue(EMPTY_PLAN) },
      );

      await store.toggleMarket('de');

      expect(store.plan()).toBeNull();
    });

    /** The market itself is already saved; refusing that over a missing
     * suggestion would be the wrong trade. */
    it('saves the market even when the suggestion cannot be fetched', async () => {
      const { store, settings } = await loaded(
        {},
        { marketSourcePlan: jest.fn().mockRejectedValue(new Error('offline')) },
      );

      expect(await store.toggleMarket('de')).toBe(true);
      expect(settings.record()?.market).toBe(encodeLocalMarkets(['de']));
      expect(store.plan()).toBeNull();
    });

    /**
     * A rolled-back save must never lead to enabling sources: that would fetch
     * on the user's behalf for a market the settings row does not hold.
     */
    it('offers nothing when the market itself did not persist', async () => {
      const { store, db } = await loaded(
        {},
        { updateSettings: jest.fn().mockRejectedValue(new Error('locked')) },
      );

      expect(await store.toggleMarket('de')).toBe(false);

      expect(db.marketSourcePlan).not.toHaveBeenCalled();
      expect(store.plan()).toBeNull();
      expect(store.error()).toContain('locked');
    });

    /** The pending confirmation belongs to the market that opened it, and must
     * not survive leaving market mode. */
    it('drops a pending offer when the user switches back to regions', async () => {
      const { store } = await loaded({ market: encodeLocalMarkets(['de']) });
      store.plan.set(PLAN);

      await store.toggleScope('europe');

      expect(store.plan()).toBeNull();
    });

    it('applies both sides and clears the offer', async () => {
      const { store, db } = await loaded();
      store.plan.set(PLAN);

      expect(await store.applyPlan()).toBe(true);
      expect(db.applyMarketSourcePlan).toHaveBeenCalledWith([1], []);
      expect(store.plan()).toBeNull();
      expect(store.applyingPlan()).toBe(false);
    });

    it('refuses to apply nothing, and clears what the last failure said', async () => {
      const { store, db } = await loaded();
      store.error.set('an older failure');

      expect(await store.applyPlan()).toBeNull();

      expect(db.applyMarketSourcePlan).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('keeps the offer when applying it fails', async () => {
      const { store } = await loaded(
        {},
        { applyMarketSourcePlan: jest.fn().mockRejectedValue(new Error('busy')) },
      );
      store.plan.set(PLAN);

      expect(await store.applyPlan()).toBe(false);
      expect(store.plan()).toEqual(PLAN);
      expect(store.error()).toContain('busy');
    });

    it('dismisses without writing', async () => {
      const { store, db } = await loaded();
      store.plan.set(PLAN);

      store.dismissPlan();

      expect(store.plan()).toBeNull();
      expect(db.applyMarketSourcePlan).not.toHaveBeenCalled();
    });
  });
});

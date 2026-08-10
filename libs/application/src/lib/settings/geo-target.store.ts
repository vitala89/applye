import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type GeoScopeKey,
  type LocalMarket,
  type MarketSourcePlan,
  encodeGeoScopes,
  encodeLocalMarkets,
  parseGeoScopes,
  parseLocalMarkets,
} from '@applye/core';
import { DbService } from '@applye/data';
import { type GeoTarget, toggleMarket, toggleRegion, worldwide } from './geo-target';
import { SettingsStore } from './settings.store';

/**
 * Where the user wants to work, in exactly one of two mutually exclusive modes,
 * and the source change a market pick can offer.
 *
 *   regions - `geoScope` holds continent keys, or is empty, which is Worldwide.
 *   markets - `market` holds country codes and `geoScope` is cleared, so the
 *             scan engine's "market first, else geoScope" read is unambiguous.
 *
 * **Every toggle persists immediately**, unlike the rest of this screen. The
 * setting drives live Discover scan behaviour, so a choice has to take effect
 * even if the user never presses Save - the same call Discover's own source
 * toggles make.
 *
 * **A rolled-back save must not lead to enabling sources.** `toggleMarket` only
 * offers a source plan once the settings row actually holds that market;
 * otherwise Applye would be preparing to fetch on the user's behalf for a
 * market they are not on.
 */
@Injectable()
export class GeoTargetStore {
  private readonly db = inject(DbService);
  private readonly settings = inject(SettingsStore);

  readonly plan = signal<MarketSourcePlan | null>(null);
  readonly applyingPlan = signal(false);
  readonly error = signal('');

  private readonly scopes = computed<ReadonlySet<GeoScopeKey>>(
    () => new Set(parseGeoScopes(this.settings.record()?.geoScope)),
  );

  private readonly markets = computed<ReadonlySet<LocalMarket>>(
    () => new Set(parseLocalMarkets(this.settings.record()?.market)),
  );

  private current(): GeoTarget {
    return { scopes: [...this.scopes()], markets: [...this.markets()] };
  }

  private isWorldwide(): boolean {
    return this.markets().size === 0 && this.scopes().size === 0;
  }

  /**
   * Picking a region switches back to region mode, dropping every market. The
   * pending confirmation belongs to the market that opened it and must not
   * survive leaving market mode, so it is cleared before the new scope is
   * persisted rather than after.
   */
  async toggleScope(key: GeoScopeKey): Promise<boolean> {
    this.error.set('');
    this.plan.set(null);
    return this.persist(toggleRegion(this.current(), key));
  }

  /** `null` when the search is already unrestricted - a refusal, not a save. */
  async setWorldwide(): Promise<boolean | null> {
    this.error.set('');
    this.plan.set(null);
    if (this.isWorldwide()) return null;
    return this.persist(worldwide());
  }

  /** Picking a market switches to market mode, dropping the region scope, and
   * then offers to match the built-in sources to it. */
  async toggleMarket(market: LocalMarket): Promise<boolean> {
    this.error.set('');
    const next = toggleMarket(this.current(), market);
    if (!(await this.persist(next))) return false;
    await this.offerSources(next.markets);
    return true;
  }

  /**
   * Prepares what the confirmation will show. **Never writes by itself**: a
   * built-in source reaching the network is always the user's explicit choice.
   * A failed lookup simply offers nothing - the market itself is already saved,
   * and refusing that over a missing suggestion would be the wrong trade.
   */
  private async offerSources(markets: LocalMarket[]): Promise<void> {
    if (!markets.length) {
      this.plan.set(null);
      return;
    }
    try {
      const plan = await this.db.marketSourcePlan(markets);
      this.plan.set(plan.toEnable.length || plan.toDisable.length ? plan : null);
    } catch {
      this.plan.set(null);
    }
  }

  /** `null` when there is nothing to apply, or an apply already running. */
  async applyPlan(): Promise<boolean | null> {
    this.error.set('');
    const plan = this.plan();
    if (!plan || this.applyingPlan()) return null;
    this.applyingPlan.set(true);
    try {
      await this.db.applyMarketSourcePlan(
        plan.toEnable.map((s) => s.id),
        plan.toDisable.map((s) => s.id),
      );
      this.plan.set(null);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.applyingPlan.set(false);
    }
  }

  dismissPlan(): void {
    this.plan.set(null);
  }

  /** Both halves in one write - they change together or not at all. */
  private async persist(next: GeoTarget): Promise<boolean> {
    const ok = await this.settings.persist({
      geoScope: encodeGeoScopes(next.scopes),
      market: encodeLocalMarkets(next.markets),
    });
    if (!ok) this.error.set(this.settings.error());
    return ok;
  }
}

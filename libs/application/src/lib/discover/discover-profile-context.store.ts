import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type Archetype,
  archetypeKeywordBag,
  parseArchetypes,
  parseLocalMarkets,
  parseProfileMd,
} from '@applye/core';
import { ProfileSettingsGateway } from '@applye/data';

/** The compensation target read out of the profile markdown. */
export interface CompensationTarget {
  min: string;
  max: string;
  currency: string;
  period: string;
}

const NO_TARGET: CompensationTarget = { min: '', max: '', currency: '', period: '' };

/**
 * What Discover reads a job posting *against*: the profile's target roles and
 * compensation, and the geography the settings narrow the search to.
 *
 * **Component-scoped**, like the rest of Discover's state. Nothing here is
 * expensive to read again, and a stale profile would silently change what every
 * score means.
 *
 * Read once at load and then only compared against. The single exception is
 * `markScanned`, which is how a finished scan records the market it ran under -
 * that is what makes the "market changed, rescan" banner able to tell a stale
 * feed from a fresh one.
 */
@Injectable()
export class DiscoverProfileContextStore {
  private readonly db = inject(ProfileSettingsGateway);

  private readonly archetypesState = signal<Archetype[]>([]);
  private readonly keywordsState = signal<string[]>([]);
  private readonly compTargetState = signal<CompensationTarget>(NO_TARGET);
  private readonly geoScopeState = signal('worldwide');
  private readonly marketsState = signal<string[]>([]);
  private readonly lastScanMarketState = signal<string[]>([]);

  /** The profile's target roles, as the archetype matcher wants them. */
  readonly archetypes = this.archetypesState.asReadonly();
  /** Keywords derived from those roles; empty means "we cannot score". */
  readonly keywords = this.keywordsState.asReadonly();
  readonly compTarget = this.compTargetState.asReadonly();
  readonly geoScope = this.geoScopeState.asReadonly();
  /** Country codes the builtin source list is narrowed to. */
  readonly markets = this.marketsState.asReadonly();

  /** True when the user has a compensation target to compare against. */
  readonly hasCompTarget = computed(
    () => !!(this.compTargetState().min || this.compTargetState().max),
  );

  /**
   * True when the feed on screen was scanned under a different market than the
   * one now selected, which is what the rescan banner offers to fix.
   *
   * Compared as JSON rather than by set membership on purpose: order is part of
   * what the settings stored, and two identical lists in a different order came
   * from two different edits.
   */
  readonly marketChangedSinceScan = computed(
    () => JSON.stringify(this.marketsState()) !== JSON.stringify(this.lastScanMarketState()),
  );

  /** Reads the profile and the settings. Throws; the page reports. */
  async load(): Promise<void> {
    const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);

    const archetypes = parseArchetypes(profile?.targetArchetypes);
    this.archetypesState.set(archetypes);
    this.keywordsState.set(archetypeKeywordBag(archetypes));

    const parsed = parseProfileMd(profile?.fullMd ?? '');
    this.compTargetState.set({
      min: parsed.compMin,
      max: parsed.compMax,
      currency: parsed.compCurrency,
      period: parsed.compPeriod,
    });

    this.geoScopeState.set(settings.geoScope || 'worldwide');
    this.marketsState.set(parseLocalMarkets(settings.market));
    this.lastScanMarketState.set(parseLocalMarkets(settings.lastScanMarket));
  }

  /**
   * Records that the feed on screen was scanned under the current market, which
   * closes the rescan banner until the market changes again.
   */
  markScanned(): void {
    this.lastScanMarketState.set(this.marketsState());
  }
}

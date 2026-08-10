import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  GEO_SCOPE_KEYS,
  GeoScopeKey,
  LOCAL_MARKETS,
  LocalMarket,
  MarketSourcePlan,
  Settings,
  parseGeoScopes,
  parseLocalMarkets,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * "Where do you want to work?" - answered in exactly one of two mutually
 * exclusive modes, and the pending source change a market pick can offer.
 *
 *   regions - `geoScope` holds continent keys, or is empty, which renders as
 *             Worldwide (no restriction at all).
 *   markets - `market` holds country codes, and `geoScope` is cleared so the
 *             regions take no part in the scan.
 *
 * The inactive row stays clickable, because clicking it is how the user
 * switches back; it is muted, and the hint says so.
 *
 * This component renders and reports. Which half is active is derived from the
 * settings row it is given, so there is no second copy of that state to fall
 * out of step; deciding what a toggle means, persisting it, and asking for the
 * source plan all stay with the page.
 */
@Component({
  selector: 'app-settings-geo-target',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-geo-target.component.html',
  styleUrl: './settings-geo-target.component.scss',
})
export class SettingsGeoTargetComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly settings = input.required<Settings>();
  /** The confirmation offered after a market pick, or `null` for none. */
  readonly plan = input<MarketSourcePlan | null>(null);
  readonly applyingPlan = input(false);

  readonly scopeToggled = output<GeoScopeKey>();
  readonly worldwideSelected = output<void>();
  readonly marketToggled = output<LocalMarket>();
  readonly planApplied = output<void>();
  readonly planDismissed = output<void>();

  protected readonly geoScopeKeys = GEO_SCOPE_KEYS;
  protected readonly localMarkets = LOCAL_MARKETS;

  private readonly scopesSelected = computed<ReadonlySet<GeoScopeKey>>(
    () => new Set(parseGeoScopes(this.settings().geoScope)),
  );

  private readonly marketsSelected = computed<ReadonlySet<LocalMarket>>(
    () => new Set(parseLocalMarkets(this.settings().market)),
  );

  /** True while local markets own the search, so the region row is inert. */
  protected readonly marketModeActive = computed(() => this.marketsSelected().size > 0);

  protected scopeChecked(key: GeoScopeKey): boolean {
    return !this.marketModeActive() && this.scopesSelected().has(key);
  }

  protected worldwideChecked(): boolean {
    return !this.marketModeActive() && this.scopesSelected().size === 0;
  }

  protected marketChecked(market: LocalMarket): boolean {
    return this.marketsSelected().has(market);
  }
}

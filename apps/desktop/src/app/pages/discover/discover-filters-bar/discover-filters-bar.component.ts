import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule, Trash2 } from 'lucide-angular';
import {
  DiscoverFeedStore,
  DiscoverFiltersStore,
  DiscoverPageStore,
  type RegionGroup,
  type RegionKey,
  srcLabel,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { DiscoverFilterMenuComponent } from '../discover-filter-menu/discover-filter-menu.component';
import { buildRegionGroups } from '../discover-region-groups';

/**
 * The Discover filter row: the search box, the three filter menus, the
 * new/all tabs and Clear list.
 *
 * It takes **no inputs**. Every store it reads is provided by the Discover page,
 * so injecting them here resolves up the component tree to the same instances -
 * a dozen inputs and outputs would restate that wiring without changing it.
 *
 * `FormsModule` is imported for one binding, the search box's `[ngModel]`.
 * Without it the attribute is inert and the box silently stops filtering, which
 * is the shape that broke Discover's `routerLink` when the sources drawer was
 * extracted: a directive does not travel with the markup that uses it.
 */
@Component({
  selector: 'app-discover-filters-bar',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DiscoverFilterMenuComponent],
  templateUrl: './discover-filters-bar.component.html',
  styleUrl: './discover-filters-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverFiltersBarComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly sel = inject(DiscoverFiltersStore);
  protected readonly page = inject(DiscoverPageStore);
  protected readonly feed = inject(DiscoverFeedStore);

  protected readonly icons = { remove: Trash2, chevron: ChevronDown };

  /** The source badge's text. Pure, so it is bound as a field. */
  protected readonly srcLabel = srcLabel;

  protected readonly sourceOptions = computed(() => this.page.sourceOptions());

  /**
   * The Locations tree, built from what the feed actually contains.
   *
   * Built here rather than read from a store because `buildRegionGroups` calls
   * `classifyLoc`, which reads the 811-line location vocabulary that stays in
   * this page - moving it into `libs/application` costs 13 kB of initial bundle
   * for a lazily-routed screen. See `docs/architecture.md`.
   */
  protected readonly availableRegions = computed<RegionGroup[]>(() =>
    buildRegionGroups(this.feed.rows()),
  );

  /** The region row's label. Locale-dependent, so it lives with the markup that
   * renders it rather than in the store that holds the selection. */
  protected regionLabel(key: RegionKey): string {
    return this.t()(`discover.region_${key}`);
  }

  /**
   * The chevron sits inside the row's own click target, so expanding a level
   * must not also select it. Stopping the event is the component's job - the
   * store holds selection state and knows nothing about the DOM.
   */
  protected expandRegion(key: RegionKey, event: Event): void {
    event.stopPropagation();
    this.sel.toggleRegionExpand(key);
  }

  protected expandCountry(name: string, event: Event): void {
    event.stopPropagation();
    this.sel.toggleCountryExpand(name);
  }
}

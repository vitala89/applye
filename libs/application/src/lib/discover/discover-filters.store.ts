import { Injectable, computed, signal } from '@angular/core';
import { toggled } from './discover-sources.util';
import {
  type CountryNode,
  type RegionGroup,
  type RegionKey,
  type SelectionState,
  cityKey,
  countrySelectionState,
  regionSelectionState,
  withCountryToggled,
  withRegionToggled,
} from './discover-location-selection';

/** How a posting's location reads once `workTypeOf` has classified it. */
export type WorkType = 'remote' | 'hybrid' | 'onsite';

/** The feed's two views: everything, or only what the user has not saved yet. */
export type DiscoverTab = 'new' | 'all';

/**
 * What the Discover user has narrowed the feed to: the search text, the source,
 * work-type and location selections, the tab, and which rows of the location
 * tree are expanded.
 *
 * **Selection state and nothing else.** It holds no feed reference and reads no
 * rows, which is what keeps the dependency between the two stores pointing one
 * way - `DiscoverFeedStore` will read these selections to filter and section its
 * rows, and nothing here ever needs to ask what the feed contains. Deciding that
 * before the extraction, rather than after, is what stops the pair injecting
 * each other (ADR-0005; the same call `parseAndFilter` forced on the job page).
 *
 * An empty selection set means "all", never "none" - a filter the user has not
 * touched must not hide anything.
 *
 * `regionLabel` is deliberately absent. It translates a region key for the
 * popover, and this layer holds no locales - the rule `pipeline-card-view.ts`
 * records for the function modules, applied here because the label is
 * presentation rather than selection.
 */
@Injectable()
export class DiscoverFiltersStore {
  readonly query = signal('');
  readonly sourceSel = signal<ReadonlySet<string>>(new Set());
  readonly workTypeSel = signal<ReadonlySet<WorkType>>(new Set());
  /** Selected keys: country names, city keys ("Germany Berlin"), 'Other'. */
  readonly countrySel = signal<ReadonlySet<string>>(new Set());
  readonly expandedRegions = signal<ReadonlySet<RegionKey>>(new Set());
  readonly expandedCountries = signal<ReadonlySet<string>>(new Set());
  readonly tab = signal<DiscoverTab>('new');

  /** The three work types, in the order the filter menu lists them. */
  readonly allWorkTypes: readonly WorkType[] = ['remote', 'hybrid', 'onsite'];

  /** Badge counts on the filter buttons. Zero renders no badge, which is the
   * same thing "all" means. */
  readonly countryCount = computed(() => this.countrySel().size);
  readonly typeCount = computed(() => this.workTypeSel().size);
  readonly sourceCount = computed(() => this.sourceSel().size);

  // ---- work-type checkboxes ----

  workChecked(w: WorkType): boolean {
    return this.workTypeSel().has(w);
  }

  toggleWork(w: WorkType): void {
    this.workTypeSel.update((set) => toggled(set, w));
  }

  clearWork(): void {
    this.workTypeSel.set(new Set());
  }

  // ---- source checkboxes ----

  sourceChecked(name: string): boolean {
    return this.sourceSel().has(name);
  }

  toggleSourceFilter(name: string): void {
    this.sourceSel.update((set) => toggled(set, name));
  }

  clearSources(): void {
    this.sourceSel.set(new Set());
  }

  // ---- location tree: expansion ----

  regionExpanded(key: RegionKey): boolean {
    return this.expandedRegions().has(key);
  }

  toggleRegionExpand(key: RegionKey): void {
    this.expandedRegions.update((set) => toggled(set, key));
  }

  countryExpanded(name: string): boolean {
    return this.expandedCountries().has(name);
  }

  toggleCountryExpand(name: string): void {
    this.expandedCountries.update((set) => toggled(set, name));
  }

  // ---- location tree: selection ----

  cityChecked(country: string, city: string): boolean {
    return this.countrySel().has(cityKey(country, city));
  }

  toggleCity(country: string, city: string): void {
    this.countrySel.update((set) => toggled(set, cityKey(country, city)));
  }

  countryState(node: CountryNode): SelectionState {
    return countrySelectionState(this.countrySel(), node);
  }

  toggleCountryTree(node: CountryNode): void {
    this.countrySel.update((set) => withCountryToggled(set, node));
  }

  regionState(group: RegionGroup): SelectionState {
    return regionSelectionState(this.countrySel(), group);
  }

  toggleRegion(group: RegionGroup): void {
    this.countrySel.update((set) => withRegionToggled(set, group));
  }

  clearLocations(): void {
    this.countrySel.set(new Set());
  }
}

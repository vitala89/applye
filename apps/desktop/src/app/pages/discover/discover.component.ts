import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Compass,
  Info,
  LucideAngularModule,
  Plus,
  RefreshCw,
  Rss,
  Scan,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { DiscoverDetailScoreComponent } from './discover-detail-score/discover-detail-score.component';
import { DbService } from '@applye/data';
import {
  parseLocalMarkets,
  parseProfileMd,
  compareCompensation,
  parseArchetypes,
  archetypeKeywordBag,
  matchArchetype,
  tierRank,
} from '@applye/core';
import type {
  CompensationVerdict,
  ScanSourceResult,
  ArchetypeMatch,
  ArchetypeFit,
  Archetype,
} from '@applye/core';
import { classifyLoc, cityKey, type LocClass, type RegionKey } from './discover-location';
import { toggled } from './discover-sources.util';
import { DiscoverSourcesDrawerComponent } from './discover-sources-drawer/discover-sources-drawer.component';
import { DiscoverSourcesService, formatScanTime } from './discover-sources.service';

import { type FeedRow, type FeedSection, filterFeedRows, splitFeedSections } from './discover-feed';

import {
  type CountryNode,
  type RegionGroup,
  type SelectionState,
  buildRegionGroups,
  countrySelectionState,
  regionSelectionState,
  withCountryToggled,
  withRegionToggled,
} from './discover-location-selection';
import { DiscoverDetailHeroComponent } from './discover-detail-hero/discover-detail-hero.component';
import { DiscoverFeedRowComponent } from './discover-feed-row/discover-feed-row.component';
import { DiscoverFilterMenuComponent } from './discover-filter-menu/discover-filter-menu.component';
import { DiscoverDetailStore, DiscoverFeedStore, DiscoverScanStore } from '@applye/application';
import { ToastService } from '../../core/toast/toast.service';

type View = 'skeleton' | 'first' | 'never' | 'scanning' | 'feed' | 'caughtup';
type WorkType = 'remote' | 'hybrid' | 'onsite';
type Tab = 'new' | 'all';

/** A titled block of feed rows ("For you" / "More openings"). */
/** One block of the deterministically parsed job description. */
const REMOTE_MARKERS = ['remote', 'anywhere', 'worldwide', 'global', 'distributed'];

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    RouterLink,
    DiscoverSourcesDrawerComponent,
    DiscoverDetailScoreComponent,
    DiscoverDetailHeroComponent,
    DiscoverFeedRowComponent,
    DiscoverFilterMenuComponent,
  ],
  providers: [DiscoverSourcesService, DiscoverDetailStore, DiscoverScanStore, DiscoverFeedStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss',
})
export class DiscoverComponent {
  private readonly i18n = inject(TranslateService);
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    compass: Compass,
    scan: Scan,
    rescan: RefreshCw,
    check: Check,
    close: X,
    plus: Plus,
    chevron: ChevronDown,
    external: ArrowUpRight,
    info: Info,
    remove: Trash2,
    source: Rss,
    back: ChevronLeft,
    sparkles: Sparkles,
    shield: ShieldCheck,
  };

  private readonly sourcesSvc = inject(DiscoverSourcesService);

  /** Read-through onto the service that owns the list: the scan runs over the
   * enabled sources and the header counts them. Editing them is the drawer's. */
  protected readonly sources = this.sourcesSvc.all;
  protected readonly everScanned = this.sourcesSvc.everScanned;
  protected readonly enabledCount = this.sourcesSvc.enabledCount;

  // ------------------------------------------------------------------ state
  protected readonly loading = signal(true);
  /** The scanned jobs and every write that changes one. Component-scoped. */
  protected readonly feedStore = inject(DiscoverFeedStore);
  /**
   * Aliases onto the feed store, following `jobs.component.ts`: the template
   * keeps one short name per idea, and the longer path in a binding pushes the
   * expression past the print width, which is five wrapped lines the ratchet
   * counts.
   */
  protected readonly displayCount = this.feedStore.displayCount;
  protected readonly hasClearableJobs = this.feedStore.hasClearableJobs;
  /** The scan and the console that narrates it. Component-scoped. */
  protected readonly scan = inject(DiscoverScanStore);
  protected readonly drawerOpen = signal(false);
  /** The open job's detail screen. Component-scoped: one page, one open job. */
  protected readonly detail = inject(DiscoverDetailStore);
  private readonly profileKeywords = signal<string[]>([]);
  private readonly archetypes = signal<Archetype[]>([]);
  protected readonly geoScope = signal('worldwide');
  /** Settings.market - the country codes narrowing the builtin sources list. */
  protected readonly markets = signal<string[]>([]);
  /** The market the feed on screen was last scanned under, from settings. */
  private readonly lastScanMarket = signal<string[]>([]);
  /** Session-only dismissal of the "market changed" banner. */
  private readonly rescanBannerDismissed = signal(false);
  /** In flight for the whole refresh (clear + scan), so a double-click on the
   * market-changed banner cannot fire two clears. `scanning()` alone does not
   * cover the clear that runs before the scan starts. */
  protected readonly refreshingForMarket = signal(false);
  /** Profile compensation target (min/max/currency/period), parsed from the saved
   * profile markdown; empty strings when the user set no target. */
  private readonly compTarget = signal<{
    min: string;
    max: string;
    currency: string;
    period: string;
  }>({
    min: '',
    max: '',
    currency: '',
    period: '',
  });
  /** True when the user has a compensation target to compare against. */
  protected readonly hasCompTarget = computed(
    () => !!(this.compTarget().min || this.compTarget().max),
  );

  /** Salary-fit verdict for the open detail job vs the profile target. */
  protected readonly compVerdict = computed<CompensationVerdict>(() =>
    compareCompensation(this.compTarget(), this.detail.salary()),
  );

  // filters (empty selection set = "all")
  protected readonly query = signal('');
  protected readonly sourceSel = signal<ReadonlySet<string>>(new Set());
  protected readonly workTypeSel = signal<ReadonlySet<WorkType>>(new Set());
  /** Selected keys: country names, city keys ("Germany Berlin"), 'Other'. */
  protected readonly countrySel = signal<ReadonlySet<string>>(new Set());
  protected readonly expandedRegions = signal<ReadonlySet<RegionKey>>(new Set());
  protected readonly expandedCountries = signal<ReadonlySet<string>>(new Set());
  protected readonly tab = signal<Tab>('new');
  /** Two-step inline confirm for "Clear list" (no modal, per product register). */
  protected readonly clearConfirm = signal(false);
  protected readonly clearing = signal(false);

  protected readonly allWorkTypes: readonly WorkType[] = ['remote', 'hybrid', 'onsite'];

  constructor() {
    void this.load();
    // Infinite scroll: when the end-of-feed sentinel enters the viewport, render
    // the next page. The effect re-attaches whenever the sentinel appears (it
    // only exists in the feed view) and cleans up its observer.
    effect((onCleanup) => {
      const el = this.loadMoreSentinel()?.nativeElement;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting) && this.hasMoreFeed()) {
            this.loadMoreFeed();
          }
        },
        { rootMargin: '400px' },
      );
      io.observe(el);
      onCleanup(() => io.disconnect());
    });
  }

  // --------------------------------------------------------------- derived
  protected readonly view = computed<View>(() => {
    if (this.loading()) return 'skeleton';
    if (this.scan.scanning()) return 'scanning';
    const active = this.feedStore.rows().filter((r) => !r.dismissed).length;
    const anyEnabled = this.sources().some((s) => s.isEnabled);
    const everScanned = this.sources().some((s) => s.lastScanAt);
    if (active === 0 && !anyEnabled) return 'first';
    if (active === 0 && !everScanned) return 'never';
    if (active === 0) return 'caughtup';
    return 'feed';
  });

  /** Per-source results of the last scan, parsed from sources.lastScanJson. */
  private readonly lastResults = computed<ScanSourceResult[]>(() =>
    this.sources()
      .map((s) => {
        if (!s.lastScanJson) return null;
        try {
          return JSON.parse(s.lastScanJson) as ScanSourceResult;
        } catch {
          return null;
        }
      })
      .filter((r): r is ScanSourceResult => r !== null),
  );

  protected readonly newCount = computed(() =>
    this.lastResults().reduce((sum, r) => sum + r.newJobs, 0),
  );
  protected readonly filteredCount = computed(() =>
    this.lastResults().reduce((sum, r) => sum + r.filteredOut, 0),
  );

  protected readonly lastScanLabel = computed(() => {
    const times = this.sources()
      .map((s) => s.lastScanAt)
      .filter((v): v is string => !!v)
      .sort();
    const latest = times[times.length - 1];
    return latest ? formatScanTime(latest) : '';
  });

  /** Distinct source names present in the feed, for the source select. */
  protected readonly sourceOptions = computed(() => {
    const names = new Set<string>();
    for (const row of this.feedStore.rows()) if (row.source) names.add(row.source);
    return [...names].sort();
  });

  protected readonly visibleRows = computed<FeedRow[]>(() =>
    filterFeedRows(
      this.feedStore.rows(),
      {
        query: this.query(),
        sources: this.sourceSel(),
        works: this.workTypeSel(),
        countries: this.countrySel(),
        tab: this.tab(),
      },
      (location) => this.workTypeOf(location),
    ),
  );

  /**
   * True when the job's title matches one of the profile's target-role keywords.
   * Drives the "For you" bucket - a soft ranking, never a hard filter, so the
   * rest of the feed still shows under "More openings".
   */
  protected matchesProfile(row: FeedRow): boolean {
    return this.archetypeBadge(row) !== null;
  }

  /**
   * Per-row best-fit archetype, computed once per feed/archetype change. The badge
   * is read from the template, the For-you filter, and the tier sort, so caching by
   * row id avoids re-tokenizing every archetype on each change-detection pass.
   */
  private readonly badgeByRow = computed<Map<number, ArchetypeMatch | null>>(() => {
    const list = this.archetypes();
    const cache = new Map<number, ArchetypeMatch | null>();
    for (const row of this.feedStore.rows())
      cache.set(row.id, matchArchetype(row.title ?? '', list));
    return cache;
  });

  /** Best-fit archetype for a feed row (title only; JD not loaded in the feed). */
  protected archetypeBadge(row: FeedRow): ArchetypeMatch | null {
    const cache = this.badgeByRow();
    if (cache.has(row.id)) return cache.get(row.id) ?? null;
    // Row not in the current feed snapshot (defensive): match directly.
    return matchArchetype(row.title ?? '', this.archetypes());
  }

  private rowTierRank(row: FeedRow): number {
    const m = this.archetypeBadge(row);
    return m ? tierRank(m.fit) : 0;
  }

  /**
   * The feed split into "For you" (matches target roles) and "More openings".
   * With no target roles set, a single unlabelled section holds everything, so
   * the two-tier UI never shows an empty or confusing header.
   */
  protected readonly feedSections = computed<FeedSection[]>(() =>
    splitFeedSections(
      this.visibleRows(),
      this.profileKeywords().length > 0,
      (row) => this.matchesProfile(row),
      (row) => this.rowTierRank(row),
      { forYou: this.t()('discover.for_you'), more: this.t()('discover.more_openings') },
    ),
  );

  /** Sentinel element at the end of the feed; when it scrolls into view, load more. */
  private readonly loadMoreSentinel = viewChild<ElementRef<HTMLElement>>('loadMore');

  /** Total rows across all sections (the full, unwindowed feed the filters allow). */
  protected readonly totalFeedRows = computed(() =>
    this.feedSections().reduce((sum, s) => sum + s.total, 0),
  );

  /** More rows exist than are currently rendered. */
  protected readonly hasMoreFeed = computed(
    () => this.totalFeedRows() > this.feedStore.displayCount(),
  );

  /**
   * Any unsaved scanned job exists at all - independent of the current filters
   * and search query, because Clear list removes the whole inbox, not just the
   * visible slice. Drives disabling the Clear list button when there is
   * nothing for it to do.
   */

  /**
   * The feed windowed to `displayCount`: rows are handed out across sections in
   * order (For you first), so only the visible slice ever hits the DOM. Section
   * headers still report their full `total`.
   */
  protected readonly renderedSections = computed<FeedSection[]>(() => {
    let budget = this.feedStore.displayCount();
    const out: FeedSection[] = [];
    for (const s of this.feedSections()) {
      if (budget <= 0) break;
      const rows = s.rows.slice(0, budget);
      budget -= rows.length;
      out.push({ ...s, rows });
    }
    return out;
  });

  /** Render one more page. Called by the scroll sentinel and the manual button. */
  protected loadMoreFeed(): void {
    this.feedStore.showMore();
  }

  /** Distinct source names present in the feed (for the Sources checkboxes). */
  protected readonly availableSources = computed(() => this.sourceOptions());

  /**
   * Region -> countries -> cities actually present in the current feed. Only
   * regions, countries and cities that appear in scanned jobs are offered; an
   * "Other" bucket collects unknown and remote-anywhere locations.
   */
  protected readonly availableRegions = computed<RegionGroup[]>(() =>
    buildRegionGroups(this.feedStore.rows()),
  );

  /** Row currently open in the detail screen. */
  protected readonly detailRow = computed<FeedRow | null>(() => {
    const id = this.detail.id();
    if (id === null) return null;
    return this.feedStore.rows().find((r) => r.id === id) ?? null;
  });

  /** Count badges for the filter buttons (0 = "all"). */
  protected readonly countryCount = computed(() => this.countrySel().size);
  protected readonly typeCount = computed(() => this.workTypeSel().size);
  protected readonly sourceCount = computed(() => this.sourceSel().size);

  protected readonly shownCount = computed(
    () => this.visibleRows().filter((r) => !r.dismissed).length,
  );

  protected readonly showHeader = computed(
    () => this.view() !== 'first' && this.view() !== 'skeleton',
  );
  protected readonly showStrip = computed(
    () => (this.view() === 'feed' || this.view() === 'caughtup') && this.everScanned(),
  );
  protected readonly showConsole = computed(
    () => this.view() === 'scanning' || (this.scan.expanded() && this.showStrip()),
  );

  /** True when the selected market no longer matches the feed on screen, so the
   * results shown are for a market the user has moved away from. */
  protected readonly marketChangedSinceScan = computed(() => {
    if (this.rescanBannerDismissed()) return false;
    return JSON.stringify(this.markets()) !== JSON.stringify(this.lastScanMarket());
  });

  // ------------------------------------------------------------------ load
  private async load(): Promise<void> {
    try {
      const [sources, profile, settings] = await Promise.all([
        this.db.listSources(),
        this.db.getProfile(),
        this.db.getSettings(),
        this.feedStore.load(),
      ]);
      this.sources.set(sources);
      const arch = parseArchetypes(profile?.targetArchetypes);
      this.archetypes.set(arch);
      this.profileKeywords.set(archetypeKeywordBag(arch));
      const cf = parseProfileMd(profile?.fullMd ?? '');
      this.compTarget.set({
        min: cf.compMin,
        max: cf.compMax,
        currency: cf.compCurrency,
        period: cf.compPeriod,
      });
      this.geoScope.set(settings.geoScope || 'worldwide');
      this.markets.set(parseLocalMarkets(settings.market));
      this.lastScanMarket.set(parseLocalMarkets(settings.lastScanMarket));
    } catch (e) {
      console.error('discover: load failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  // ------------------------------------------------------------------ scan
  /**
   * The store runs the scan and narrates it; everything the fresh results mean
   * for this page happens in the continuation, while the console is still open
   * and where a failure still narrates as a failed scan.
   */
  protected async runScan(): Promise<void> {
    const error = await this.scan.run(
      this.sources()
        .filter((s) => s.isEnabled)
        .map((s) => s.name ?? ''),
      async () => {
        await this.feedStore.load();
        await this.sourcesSvc.reload();
        this.lastScanMarket.set(this.markets());
        this.rescanBannerDismissed.set(false);
      },
    );
    if (error) this.toast.error(error);
  }

  // -------------------------------------------------------- market-changed
  /** From the market-changed banner: drop the stale unsaved results and rescan
   * for the current market. Saved and dismissed jobs are untouched (see
   * db_discover_clear). Then scan(), which realigns lastScanMarket. */
  protected async refreshForMarket(): Promise<void> {
    if (this.refreshingForMarket() || this.scan.scanning()) return;
    this.refreshingForMarket.set(true);
    try {
      try {
        await this.feedStore.discardUnsaved();
      } catch (e) {
        console.error('discover: clear before refresh failed', e);
      }
      await this.runScan();
    } finally {
      this.refreshingForMarket.set(false);
    }
  }

  protected dismissRescanBanner(): void {
    this.rescanBannerDismissed.set(true);
  }

  // ----------------------------------------------------------- clear inbox
  /** Open the confirm modal. No-op when there is nothing unsaved to clear. */
  protected askClearFeed(): void {
    if (!this.feedStore.hasClearableJobs()) return;
    this.clearConfirm.set(true);
  }

  protected cancelClearFeed(): void {
    if (this.clearing()) return;
    this.clearConfirm.set(false);
  }

  /**
   * Delete every unsaved scanned job, reload the (now empty) feed, and toast the
   * count removed so the destructive action is acknowledged.
   */
  protected async confirmClearFeed(): Promise<void> {
    if (this.clearing()) return;
    this.clearing.set(true);
    try {
      const result = await this.feedStore.clear();
      if ('error' in result) {
        this.toast.error(result.error);
        return;
      }
      this.clearConfirm.set(false);
      this.toast.success(this.t()('discover.clear_done').replace('{n}', String(result.removed)));
    } finally {
      this.clearing.set(false);
    }
  }

  // ---------------------------------------------------------------- triage
  /** Row click: open the full-screen job detail. */
  protected openDetail(row: FeedRow): void {
    if (row.dismissed) return;
    this.detail.open(row.id, {
      keywords: this.profileKeywords(),
      fit: this.archetypeBadge(row)?.fit ?? null,
      title: row.title ?? '',
    });
  }

  protected closeDetail(): void {
    this.detail.close();
  }

  /** i18n label for an archetype tier badge. */
  protected archBadgeLabel(fit: ArchetypeFit): string {
    return this.t()('discover.arch_' + fit);
  }

  /** The archetype badge as a row renders it: tier plus its label. Pairs the
   * two calls the markup used to make, so the feed row and the detail hero each
   * take one input rather than two. */
  protected rowArchetype(row: FeedRow): { fit: ArchetypeFit; label: string } | null {
    const m = this.archetypeBadge(row);
    return m ? { fit: m.fit, label: this.archBadgeLabel(m.fit) } : null;
  }

  // ------------------------------------------------------- location filters
  protected workTypeOf(location: string | null): WorkType {
    const loc = (location ?? '').toLowerCase();
    if (loc.includes('hybrid')) return 'hybrid';
    if (this.isRemote(location)) return 'remote';
    return 'onsite';
  }

  /**
   * Deterministic country + city + region for a free-text location. Delegates
   * to the pure, unit-tested `classifyLoc` in ./discover-location so the
   * recognition rules live in one testable place.
   */
  protected classifyLoc(location: string | null): LocClass {
    return classifyLoc(location);
  }

  /** Stable selection key for a city ("Germany Berlin"). */
  private cityKey(country: string, city: string): string {
    return cityKey(country, city);
  }

  // ---- work-type checkbox helpers ----
  protected workChecked(w: WorkType): boolean {
    return this.workTypeSel().has(w);
  }

  protected toggleWork(w: WorkType): void {
    this.workTypeSel.update((set) => toggled(set, w));
  }

  protected clearWork(): void {
    this.workTypeSel.set(new Set());
  }

  // ---- source checkbox helpers ----
  protected sourceChecked(name: string): boolean {
    return this.sourceSel().has(name);
  }

  protected toggleSourceFilter(name: string): void {
    this.sourceSel.update((set) => toggled(set, name));
  }

  protected clearSources(): void {
    this.sourceSel.set(new Set());
  }

  // ---- location checkbox helpers (region -> country -> city) ----
  protected regionLabel(key: RegionKey): string {
    return this.t()(`discover.region_${key}`);
  }

  protected regionExpanded(key: RegionKey): boolean {
    return this.expandedRegions().has(key);
  }

  protected toggleRegionExpand(key: RegionKey, event: Event): void {
    event.stopPropagation();
    this.expandedRegions.update((set) => toggled(set, key));
  }

  protected countryExpanded(name: string): boolean {
    return this.expandedCountries().has(name);
  }

  protected toggleCountryExpand(name: string, event: Event): void {
    event.stopPropagation();
    this.expandedCountries.update((set) => toggled(set, name));
  }

  protected cityChecked(country: string, city: string): boolean {
    return this.countrySel().has(this.cityKey(country, city));
  }

  protected toggleCity(country: string, city: string): void {
    this.countrySel.update((set) => toggled(set, this.cityKey(country, city)));
  }

  protected countryState(node: CountryNode): SelectionState {
    return countrySelectionState(this.countrySel(), node);
  }

  protected toggleCountryTree(node: CountryNode): void {
    this.countrySel.update((set) => withCountryToggled(set, node));
  }

  protected regionState(group: RegionGroup): SelectionState {
    return regionSelectionState(this.countrySel(), group);
  }

  protected toggleRegion(group: RegionGroup): void {
    this.countrySel.update((set) => withRegionToggled(set, group));
  }

  protected clearLocations(): void {
    this.countrySel.set(new Set());
  }

  // ------------------------------------------------------------ detail misc
  /** Deterministic tip line under the raw score. */
  protected tipText(row: FeedRow): string {
    if (this.detail.verdict() === 'strong') return this.t()('discover.tip_strong');
    const kw = this.matchedKeywords(row)[0] ?? this.profileKeywords()[0]?.toUpperCase() ?? '';
    return this.t()('discover.tip_other').replace('{kw}', kw);
  }

  /** Save (if needed) and jump into the job's AI scoring flow. */
  protected async rescore(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    if (!row.saved) await this.saveRow(row, event);
    await this.router.navigate(['/jobs', row.id]);
  }

  protected async saveRow(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    const error = await this.feedStore.save(row.id);
    if (error) this.toast.error(error);
    else this.toast.success(this.t()('discover.saved_ok'));
  }

  protected async dismissRow(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    this.detail.closeIfOpen(row.id);
    const error = await this.feedStore.setDismissed(row.id, true);
    if (error) this.toast.error(error);
  }

  protected async undoDismiss(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    const error = await this.feedStore.setDismissed(row.id, false);
    if (error) this.toast.error(error);
  }

  protected async openOriginal(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    if (row.sourceUrl) await openUrl(row.sourceUrl);
  }

  // --------------------------------------------------------------- helpers
  /** Short mono badge label for a source name ("We Work Remotely" -> WWR). */
  protected srcLabel(name: string | null): string {
    if (!name) return '';
    if (/^we work remotely$/i.test(name)) return 'WWR';
    return name.toUpperCase();
  }

  protected matchedKeywords(row: FeedRow): string[] {
    const title = (row.title ?? '').toLowerCase();
    return this.profileKeywords()
      .filter((kw) => title.includes(kw))
      .slice(0, 4)
      .map((kw) => kw.toUpperCase());
  }

  protected ago(created: string | null): string {
    if (!created) return '';
    const then = new Date(created.replace(' ', 'T') + 'Z').getTime();
    if (Number.isNaN(then)) return '';
    const hours = Math.floor((Date.now() - then) / 3_600_000);
    if (hours < 1) return this.t()('discover.ago_now');
    if (hours < 24) return this.t()('discover.ago_h').replace('{n}', String(hours));
    return this.t()('discover.ago_d').replace('{n}', String(Math.floor(hours / 24)));
  }

  protected isRemote(location: string | null): boolean {
    const loc = (location ?? '').toLowerCase();
    return REMOTE_MARKERS.some((m) => loc.includes(m));
  }

  protected readonly skeletonRows = [
    { w1: '62%', w2: '34%' },
    { w1: '48%', w2: '40%' },
    { w1: '56%', w2: '30%' },
    { w1: '44%', w2: '36%' },
    { w1: '60%', w2: '28%' },
    { w1: '50%', w2: '38%' },
  ];
}

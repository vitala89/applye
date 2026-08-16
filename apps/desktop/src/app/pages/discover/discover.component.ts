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
import { Router } from '@angular/router';
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
import { compareCompensation, matchArchetype, tierRank } from '@applye/core';
import type {
  CompensationVerdict,
  ScanSourceResult,
  ArchetypeMatch,
  ArchetypeFit,
} from '@applye/core';
import { classifyLoc, type LocClass } from './discover-location';
import { buildRegionGroups } from './discover-region-groups';
import { type RegionGroup, type RegionKey } from '@applye/application';
import { DiscoverSourcesDrawerComponent } from './discover-sources-drawer/discover-sources-drawer.component';

import { type FeedRow, type FeedSection, filterFeedRows, splitFeedSections } from './discover-feed';

import { DiscoverDetailHeroComponent } from './discover-detail-hero/discover-detail-hero.component';
import { DiscoverFeedRowComponent } from './discover-feed-row/discover-feed-row.component';
import { DiscoverFilterMenuComponent } from './discover-filter-menu/discover-filter-menu.component';
import {
  DiscoverDetailStore,
  DiscoverFeedStore,
  DiscoverFiltersStore,
  DiscoverProfileContextStore,
  DiscoverScanStore,
  DiscoverSourcesStore,
  formatScanTime,
} from '@applye/application';
import { ToastService } from '@applye/application';

type View = 'skeleton' | 'first' | 'never' | 'scanning' | 'feed' | 'caughtup';
type WorkType = 'remote' | 'hybrid' | 'onsite';

/** A titled block of feed rows ("For you" / "More openings"). */
/** One block of the deterministically parsed job description. */
const REMOTE_MARKERS = ['remote', 'anywhere', 'worldwide', 'global', 'distributed'];

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    DiscoverSourcesDrawerComponent,
    DiscoverDetailScoreComponent,
    DiscoverDetailHeroComponent,
    DiscoverFeedRowComponent,
    DiscoverFilterMenuComponent,
  ],
  providers: [
    DiscoverSourcesStore,
    DiscoverDetailStore,
    DiscoverScanStore,
    DiscoverFeedStore,
    DiscoverFiltersStore,
    DiscoverProfileContextStore,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss',
})
export class DiscoverComponent {
  private readonly i18n = inject(TranslateService);
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

  private readonly sourcesSvc = inject(DiscoverSourcesStore);

  /** Read-through onto the store that owns the list: the scan runs over the
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
  /** What the user has narrowed the feed to. Selection state only - it holds no
   * feed reference, which is what keeps the two stores pointing one way. */
  protected readonly sel = inject(DiscoverFiltersStore);
  /** The open job's detail screen. Component-scoped: one page, one open job. */
  protected readonly detail = inject(DiscoverDetailStore);
  /** What a posting is read against: target roles, pay and geography. */
  protected readonly context = inject(DiscoverProfileContextStore);
  /** Session-only dismissal of the "market changed" banner. */
  private readonly rescanBannerDismissed = signal(false);
  /** In flight for the whole refresh (clear + scan), so a double-click on the
   * market-changed banner cannot fire two clears. `scanning()` alone does not
   * cover the clear that runs before the scan starts. */
  protected readonly refreshingForMarket = signal(false);

  /** Salary-fit verdict for the open detail job vs the profile target. */
  protected readonly compVerdict = computed<CompensationVerdict>(() =>
    compareCompensation(this.context.compTarget(), this.detail.salary()),
  );

  /** Two-step inline confirm for "Clear list" (no modal, per product register). */
  protected readonly clearConfirm = signal(false);
  protected readonly clearing = signal(false);

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
        query: this.sel.query(),
        sources: this.sel.sourceSel(),
        works: this.sel.workTypeSel(),
        countries: this.sel.countrySel(),
        tab: this.sel.tab(),
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
    const list = this.context.archetypes();
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
    return matchArchetype(row.title ?? '', this.context.archetypes());
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
      this.context.keywords().length > 0,
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
  protected readonly marketChangedSinceScan = computed(
    () => !this.rescanBannerDismissed() && this.context.marketChangedSinceScan(),
  );

  // ------------------------------------------------------------------ load
  private async load(): Promise<void> {
    try {
      await Promise.all([
        // The service owns the list; the page used to read it and write into
        // the service's signal from outside, which was the same query twice.
        this.sourcesSvc.reload(),
        this.context.load(),
        this.feedStore.load(),
      ]);
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
        this.context.markScanned();
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
      keywords: this.context.keywords(),
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
   * to the pure, unit-tested `classifyLoc` in `@applye/application` so the
   * recognition rules live in one testable place.
   */
  protected classifyLoc(location: string | null): LocClass {
    return classifyLoc(location);
  }

  /**
   * The chevron sits inside the row's own click target, so expanding a level
   * must not also select it. Stopping the event is the page's job - the store
   * holds selection state and knows nothing about the DOM, the same division
   * `WizardNavService` has with scrolling.
   */
  protected expandRegion(key: RegionKey, event: Event): void {
    event.stopPropagation();
    this.sel.toggleRegionExpand(key);
  }

  protected expandCountry(name: string, event: Event): void {
    event.stopPropagation();
    this.sel.toggleCountryExpand(name);
  }

  /** The region row's label in the Locations popover. Stays on the page: it is
   * locale-dependent, and the filters store holds selection state only. */
  protected regionLabel(key: RegionKey): string {
    return this.t()(`discover.region_${key}`);
  }

  // ------------------------------------------------------------ detail misc
  /** Deterministic tip line under the raw score. */
  protected tipText(row: FeedRow): string {
    if (this.detail.verdict() === 'strong') return this.t()('discover.tip_strong');
    const kw = this.matchedKeywords(row)[0] ?? this.context.keywords()[0]?.toUpperCase() ?? '';
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
    return this.context
      .keywords()
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

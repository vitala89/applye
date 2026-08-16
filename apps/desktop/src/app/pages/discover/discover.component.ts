import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import { compareCompensation } from '@applye/core';
import type { CompensationVerdict, ArchetypeFit } from '@applye/core';
import { srcLabel, workTypeOf } from '@applye/application';
import { DiscoverSourcesDrawerComponent } from './discover-sources-drawer/discover-sources-drawer.component';

import { type FeedRow, type FeedSection, filterFeedRows, splitFeedSections } from './discover-feed';

import { DiscoverDetailScreenComponent } from './discover-detail-screen/discover-detail-screen.component';
import { DiscoverFeedRowComponent } from './discover-feed-row/discover-feed-row.component';
import { DiscoverFiltersBarComponent } from './discover-filters-bar/discover-filters-bar.component';
import {
  DiscoverDetailStore,
  DiscoverFeedStore,
  DiscoverFiltersStore,
  DiscoverPageStore,
  DiscoverRowMatchStore,
  DiscoverProfileContextStore,
  DiscoverScanStore,
  DiscoverSourcesStore,
} from '@applye/application';
import { ToastService } from '@applye/application';

/** A titled block of feed rows ("For you" / "More openings"). */
/** One block of the deterministically parsed job description. */

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    DiscoverSourcesDrawerComponent,
    DiscoverDetailScoreComponent,
    DiscoverDetailScreenComponent,
    DiscoverFeedRowComponent,
    DiscoverFiltersBarComponent,
  ],
  providers: [
    DiscoverSourcesStore,
    DiscoverDetailStore,
    DiscoverScanStore,
    DiscoverFeedStore,
    DiscoverFiltersStore,
    DiscoverPageStore,
    DiscoverRowMatchStore,
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

  /** Pure row helpers the template binds by name. Exposed as fields rather than
   * wrapped in methods: a wrapper would be three lines each for no behaviour. */
  protected readonly srcLabel = srcLabel;

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
  /** What the user has narrowed the feed to. Selection state only - it holds no
   * feed reference, which is what keeps the two stores pointing one way. */
  protected readonly sel = inject(DiscoverFiltersStore);
  /** How a row reads against the profile. Holds no feed reference either, for
   * the same reason: the feed store will depend on it when sectioning moves. */
  protected readonly match = inject(DiscoverRowMatchStore);
  /** The open job's detail screen. Component-scoped: one page, one open job. */
  /** What is on screen right now: which view, what the last scan reported, and
   * the drawer, confirm and detail the user can open. */
  protected readonly page = inject(DiscoverPageStore);

  protected readonly detail = inject(DiscoverDetailStore);
  /** What a posting is read against: target roles, pay and geography. */
  protected readonly context = inject(DiscoverProfileContextStore);
  /** Session-only dismissal of the "market changed" banner. */
  /** In flight for the whole refresh (clear + scan), so a double-click on the
   * market-changed banner cannot fire two clears. `scanning()` alone does not
   * cover the clear that runs before the scan starts. */

  /** Salary-fit verdict for the open detail job vs the profile target. */
  protected readonly compVerdict = computed<CompensationVerdict>(() =>
    compareCompensation(this.context.compTarget(), this.detail.salary()),
  );

  /** Two-step inline confirm for "Clear list" (no modal, per product register). */

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
      (location) => workTypeOf(location),
    ),
  );

  /**
   * True when the job's title matches one of the profile's target-role keywords.
   * Drives the "For you" bucket - a soft ranking, never a hard filter, so the
   * rest of the feed still shows under "More openings".
   */
  /**
   * Per-row best-fit archetype, computed once per feed/archetype change. The badge
   * is read from the template, the For-you filter, and the tier sort, so caching by
   * row id avoids re-tokenizing every archetype on each change-detection pass.
   */
  /**
   * The feed split into "For you" (matches target roles) and "More openings".
   * With no target roles set, a single unlabelled section holds everything, so
   * the two-tier UI never shows an empty or confusing header.
   */
  protected readonly feedSections = computed<FeedSection[]>(() =>
    splitFeedSections(
      this.visibleRows(),
      this.context.keywords().length > 0,
      (row) => this.match.matchesProfile(row),
      (row) => this.match.tierRankFor(row),
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
      this.page.loading.set(false);
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
        this.page.rearmRescanBanner();
      },
    );
    if (error) this.toast.error(error);
  }

  // -------------------------------------------------------- market-changed
  /** From the market-changed banner: drop the stale unsaved results and rescan
   * for the current market. Saved and dismissed jobs are untouched (see
   * db_discover_clear). Then scan(), which realigns lastScanMarket. */
  protected async refreshForMarket(): Promise<void> {
    if (this.page.refreshingForMarket() || this.scan.scanning()) return;
    this.page.refreshingForMarket.set(true);
    try {
      try {
        await this.feedStore.discardUnsaved();
      } catch (e) {
        console.error('discover: clear before refresh failed', e);
      }
      await this.runScan();
    } finally {
      this.page.refreshingForMarket.set(false);
    }
  }

  /** i18n label for an archetype tier badge. */
  protected archBadgeLabel(fit: ArchetypeFit): string {
    return this.t()('discover.arch_' + fit);
  }

  /** The archetype badge as a row renders it: tier plus its label. Pairs the
   * two calls the markup used to make, so the feed row and the detail hero each
   * take one input rather than two. */
  protected rowArchetype(row: FeedRow): { fit: ArchetypeFit; label: string } | null {
    const m = this.match.badgeFor(row);
    return m ? { fit: m.fit, label: this.archBadgeLabel(m.fit) } : null;
  }

  // ------------------------------------------------------------ detail misc
  /** Deterministic tip line under the raw score. */
  protected tipText(row: FeedRow): string {
    if (this.detail.verdict() === 'strong') return this.t()('discover.tip_strong');
    const kw =
      this.match.matchedKeywords(row)[0] ?? this.context.keywords()[0]?.toUpperCase() ?? '';
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

  // --------------------------------------------------------------- helpers
  /** Short mono badge label for a source name ("We Work Remotely" -> WWR). */
  protected ago(created: string | null): string {
    if (!created) return '';
    const then = new Date(created.replace(' ', 'T') + 'Z').getTime();
    if (Number.isNaN(then)) return '';
    const hours = Math.floor((Date.now() - then) / 3_600_000);
    if (hours < 1) return this.t()('discover.ago_now');
    if (hours < 24) return this.t()('discover.ago_h').replace('{n}', String(hours));
    return this.t()('discover.ago_d').replace('{n}', String(Math.floor(hours / 24)));
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

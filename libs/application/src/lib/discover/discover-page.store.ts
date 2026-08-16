import { Injectable, computed, inject, signal } from '@angular/core';
import { type ScanSourceResult } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../shell/toast.service';
import { DiscoverDetailStore } from './discover-detail.store';
import { type FeedRow, DiscoverFeedStore } from './discover-feed.store';
import { DiscoverProfileContextStore } from './discover-profile-context.store';
import { DiscoverRowMatchStore } from './discover-row-match.store';
import { DiscoverScanStore } from './discover-scan.store';
import { DiscoverSourcesStore, formatScanTime } from './discover-sources.store';

/** Which of the screen's six mutually exclusive states is showing. */
export type DiscoverView = 'skeleton' | 'first' | 'never' | 'scanning' | 'feed' | 'caughtup';

/**
 * The Discover screen's own state: which of its six views is showing, what the
 * last scan reported, and the three things the user can open or dismiss - the
 * sources drawer, the clear-feed confirm and the job detail.
 *
 * This is the screen rather than the data. `DiscoverFeedStore` owns the rows,
 * `DiscoverSourcesStore` the sources, `DiscoverFiltersStore` the selections;
 * what is left is "what is on screen right now", and that is what lives here.
 *
 * **Deliberately not here: the feed pipeline.** `visibleRows` filters by
 * location through `classifyLoc`, which reads an 811-line vocabulary that stays
 * in the Discover page - `libs/application` is imported by the eagerly-loaded
 * shell, and moving that table down put 13 kB of country names into the initial
 * bundle for a lazily-routed screen. `shownCount` counts those filtered rows and
 * stays with them. The measurement is in the page, beside what it constrains.
 */
@Injectable()
export class DiscoverPageStore {
  private readonly feed = inject(DiscoverFeedStore);
  private readonly sourcesSvc = inject(DiscoverSourcesStore);
  private readonly scan = inject(DiscoverScanStore);
  private readonly detail = inject(DiscoverDetailStore);
  private readonly context = inject(DiscoverProfileContextStore);
  private readonly match = inject(DiscoverRowMatchStore);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService).t;

  /** True until the first load settles, which is what draws the skeleton. */
  readonly loading = signal(true);
  readonly drawerOpen = signal(false);
  /** In flight for a whole clear-and-rescan, so a double click cannot start two. */
  readonly refreshingForMarket = signal(false);
  /** Two-step inline confirm for "Clear list" (no modal, per product register). */
  readonly clearConfirm = signal(false);
  readonly clearing = signal(false);
  private readonly rescanBannerDismissed = signal(false);

  // ---------------------------------------------------------------- derived

  readonly view = computed<DiscoverView>(() => {
    if (this.loading()) return 'skeleton';
    if (this.scan.scanning()) return 'scanning';
    const active = this.feed.rows().filter((r) => !r.dismissed).length;
    const anyEnabled = this.sourcesSvc.all().some((s) => s.isEnabled);
    const everScanned = this.sourcesSvc.all().some((s) => s.lastScanAt);
    if (active === 0 && !anyEnabled) return 'first';
    if (active === 0 && !everScanned) return 'never';
    if (active === 0) return 'caughtup';
    return 'feed';
  });

  readonly showHeader = computed(() => this.view() !== 'first' && this.view() !== 'skeleton');

  readonly showStrip = computed(
    () => (this.view() === 'feed' || this.view() === 'caughtup') && this.sourcesSvc.everScanned(),
  );

  readonly showConsole = computed(
    () => this.view() === 'scanning' || (this.scan.expanded() && this.showStrip()),
  );

  /** True when the selected market no longer matches the feed on screen, so the
   * results shown are for a market the user has moved away from. */
  readonly marketChangedSinceScan = computed(
    () => !this.rescanBannerDismissed() && this.context.marketChangedSinceScan(),
  );

  /** Per-source results of the last scan, parsed from `sources.lastScanJson`. */
  private readonly lastResults = computed<ScanSourceResult[]>(() =>
    this.sourcesSvc
      .all()
      .map((s) => {
        if (!s.lastScanJson) return null;
        try {
          return JSON.parse(s.lastScanJson) as ScanSourceResult;
        } catch {
          // A row written by an older shape is not a scan that failed; it is a
          // scan whose summary cannot be read, and the strip simply omits it.
          return null;
        }
      })
      .filter((r): r is ScanSourceResult => r !== null),
  );

  readonly newCount = computed(() => this.lastResults().reduce((sum, r) => sum + r.newJobs, 0));

  readonly filteredCount = computed(() =>
    this.lastResults().reduce((sum, r) => sum + r.filteredOut, 0),
  );

  readonly lastScanLabel = computed(() => {
    const times = this.sourcesSvc
      .all()
      .map((s) => s.lastScanAt)
      .filter((v): v is string => !!v)
      .sort();
    const latest = times[times.length - 1];
    return latest ? formatScanTime(latest) : '';
  });

  /** Distinct source names present in the feed, for the source select. */
  readonly sourceOptions = computed(() => {
    const names = new Set<string>();
    for (const row of this.feed.rows()) if (row.source) names.add(row.source);
    return [...names].sort();
  });

  // ------------------------------------------------------------ the banner

  dismissRescanBanner(): void {
    this.rescanBannerDismissed.set(true);
  }

  /**
   * Re-arm the banner after a rescan for the new market. Dismissal is about one
   * mismatch, not about the banner as a feature - having scanned for the market
   * the user moved to, the next mismatch should say so again.
   */
  rearmRescanBanner(): void {
    this.rescanBannerDismissed.set(false);
  }

  // -------------------------------------------------------- clearing the feed

  /** Open the confirm. No-op when there is nothing unsaved to clear. */
  askClearFeed(): void {
    if (!this.feed.hasClearableJobs()) return;
    this.clearConfirm.set(true);
  }

  cancelClearFeed(): void {
    if (this.clearing()) return;
    this.clearConfirm.set(false);
  }

  /**
   * Delete every unsaved scanned job, reload the (now empty) feed, and report
   * the count removed so a destructive action is acknowledged rather than
   * silently succeeding.
   */
  async confirmClearFeed(): Promise<void> {
    if (this.clearing()) return;
    this.clearing.set(true);
    try {
      const result = await this.feed.clear();
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

  /** Row click: open the full-screen job detail. A dismissed row does not open. */
  openDetail(row: FeedRow): void {
    if (row.dismissed) return;
    this.detail.open(row.id, {
      keywords: this.context.keywords(),
      fit: this.match.badgeFor(row)?.fit ?? null,
      title: row.title ?? '',
    });
  }

  closeDetail(): void {
    this.detail.close();
  }
}

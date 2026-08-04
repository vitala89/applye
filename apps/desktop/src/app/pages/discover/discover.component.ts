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
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Compass,
  Info,
  LucideAngularModule,
  MapPin,
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
import { DbService } from '@applye/data';
import {
  parseLocalMarkets,
  parseProfileMd,
  compareCompensation,
  extractSalaryFromJd,
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
import {
  classifyLoc,
  cityKey,
  OTHER_COUNTRY,
  REGION_ORDER,
  type LocClass,
  type RegionKey,
} from './discover-location';
import { toggled } from './discover-sources.util';
import { DiscoverSourcesDrawerComponent } from './discover-sources-drawer/discover-sources-drawer.component';
import { DiscoverSourcesService, formatScanTime } from './discover-sources.service';
import { type JdBlock, parseJdBlocks } from './jd-blocks';
import { type FeedRow, type FeedSection, filterFeedRows, splitFeedSections } from './discover-feed';
import { type ConsoleLine, failureLines, resultLines, startedLines } from './discover-console';
import { ToastService } from '../../core/toast/toast.service';

type View = 'skeleton' | 'first' | 'never' | 'scanning' | 'feed' | 'caughtup';
type WorkType = 'remote' | 'hybrid' | 'onsite';
type Tab = 'new' | 'all';

/** One country row in the Locations popover, with the cities actually seen. */
interface CountryNode {
  name: string;
  cities: string[];
}

/** One region row in the Locations popover, with the countries actually seen. */
interface RegionGroup {
  key: RegionKey;
  countries: CountryNode[];
}

/** A titled block of feed rows ("For you" / "More openings"). */
/** Feed rows rendered per page; the list grows in these steps as the user scrolls. */
const FEED_PAGE = 30;
/** One block of the deterministically parsed job description. */
const REMOTE_MARKERS = ['remote', 'anywhere', 'worldwide', 'global', 'distributed'];

/** Static tech dictionary for the deterministic "skills found in posting" chips. */
const SKILL_DICT = [
  'Angular',
  'React',
  'Vue',
  'Svelte',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Python',
  'Rust',
  'Go',
  'Java',
  'Kotlin',
  'Swift',
  'C#',
  '.NET',
  'PHP',
  'Ruby',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'SQLite',
  'MongoDB',
  'Redis',
  'GraphQL',
  'REST',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
  'Terraform',
  'CI/CD',
  'Git',
  'RxJS',
  'NgRx',
  'Nx',
  'Tauri',
  'Electron',
  'Tailwind',
  'SCSS',
  'HTML',
  'CSS',
  'Jest',
  'Cypress',
  'Playwright',
];

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, RouterLink, DiscoverSourcesDrawerComponent],
  providers: [DiscoverSourcesService],
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
    save: Bookmark,
    plus: Plus,
    chevron: ChevronDown,
    external: ArrowUpRight,
    info: Info,
    remove: Trash2,
    company: Building2,
    location: MapPin,
    time: Clock,
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
  protected readonly scanning = signal(false);
  protected readonly feed = signal<FeedRow[]>([]);
  protected readonly consoleLines = signal<ConsoleLine[]>([]);
  protected readonly consoleExpanded = signal(false);
  protected readonly drawerOpen = signal(false);
  /** Job open in the full-screen detail view (null = feed). */
  protected readonly detailId = signal<number | null>(null);
  /** Parsed full-JD blocks for the open detail; null while loading. */
  protected readonly detailBlocks = signal<JdBlock[] | null>(null);
  /** Skills detected in the full JD (deterministic dictionary match). */
  protected readonly detailSkills = signal<string[]>([]);
  /** Raw keyword-fit score 0-100; null when the profile has no keywords. */
  protected readonly detailScore = signal<number | null>(null);
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
  /** Salary text extracted from the open detail job's JD, or null. */
  protected readonly detailSalary = signal<string | null>(null);

  /** True when the user has a compensation target to compare against. */
  protected readonly hasCompTarget = computed(
    () => !!(this.compTarget().min || this.compTarget().max),
  );

  /** Salary-fit verdict for the open detail job vs the profile target. */
  protected readonly compVerdict = computed<CompensationVerdict>(() =>
    compareCompensation(this.compTarget(), this.detailSalary()),
  );

  // filters (empty selection set = "all")
  protected readonly query = signal('');
  protected readonly sourceSel = signal<ReadonlySet<string>>(new Set());
  protected readonly workTypeSel = signal<ReadonlySet<WorkType>>(new Set());
  /** Selected keys: country names, city keys ("Germany Berlin"), 'Other'. */
  protected readonly countrySel = signal<ReadonlySet<string>>(new Set());
  protected readonly expandedRegions = signal<ReadonlySet<RegionKey>>(new Set());
  protected readonly expandedCountries = signal<ReadonlySet<string>>(new Set());
  protected readonly typeMenuOpen = signal(false);
  protected readonly geoMenuOpen = signal(false);
  protected readonly sourceMenuOpen = signal(false);
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
    if (this.scanning()) return 'scanning';
    const active = this.feed().filter((r) => !r.dismissed).length;
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
    for (const row of this.feed()) if (row.source) names.add(row.source);
    return [...names].sort();
  });

  protected readonly visibleRows = computed<FeedRow[]>(() =>
    filterFeedRows(
      this.feed(),
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
    for (const row of this.feed()) cache.set(row.id, matchArchetype(row.title ?? '', list));
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

  /** How many feed rows to render right now; grows by FEED_PAGE as the user scrolls. */
  protected readonly displayCount = signal(FEED_PAGE);

  /** Sentinel element at the end of the feed; when it scrolls into view, load more. */
  private readonly loadMoreSentinel = viewChild<ElementRef<HTMLElement>>('loadMore');

  /** Total rows across all sections (the full, unwindowed feed the filters allow). */
  protected readonly totalFeedRows = computed(() =>
    this.feedSections().reduce((sum, s) => sum + s.total, 0),
  );

  /** More rows exist than are currently rendered. */
  protected readonly hasMoreFeed = computed(() => this.totalFeedRows() > this.displayCount());

  /**
   * Any unsaved scanned job exists at all - independent of the current filters
   * and search query, because Clear list removes the whole inbox, not just the
   * visible slice. Drives disabling the Clear list button when there is
   * nothing for it to do.
   */
  protected readonly hasClearableJobs = computed(() => this.feed().some((r) => !r.saved));

  /**
   * The feed windowed to `displayCount`: rows are handed out across sections in
   * order (For you first), so only the visible slice ever hits the DOM. Section
   * headers still report their full `total`.
   */
  protected readonly renderedSections = computed<FeedSection[]>(() => {
    let budget = this.displayCount();
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
    this.displayCount.update((n) => n + FEED_PAGE);
  }

  /** Distinct source names present in the feed (for the Sources checkboxes). */
  protected readonly availableSources = computed(() => this.sourceOptions());

  /**
   * Region -> countries -> cities actually present in the current feed. Only
   * regions, countries and cities that appear in scanned jobs are offered; an
   * "Other" bucket collects unknown and remote-anywhere locations.
   */
  protected readonly availableRegions = computed<RegionGroup[]>(() => {
    // region -> (country -> set of cities)
    const byRegion = new Map<RegionKey, Map<string, Set<string>>>();
    let hasOther = false;
    for (const row of this.feed()) {
      if (row.dismissed) continue;
      const loc = this.classifyLoc(row.location);
      if (!loc.country) {
        hasOther = true;
        continue;
      }
      let countries = byRegion.get(loc.region);
      if (!countries) {
        countries = new Map();
        byRegion.set(loc.region, countries);
      }
      let cities = countries.get(loc.country);
      if (!cities) {
        cities = new Set();
        countries.set(loc.country, cities);
      }
      if (loc.city) cities.add(loc.city);
    }
    const groups: RegionGroup[] = [];
    for (const key of REGION_ORDER) {
      if (key === 'other') continue;
      const countries = byRegion.get(key);
      if (!countries || !countries.size) continue;
      const nodes: CountryNode[] = [...countries.entries()]
        .map(([name, cities]) => ({ name, cities: [...cities].sort() }))
        .sort((a, b) => a.name.localeCompare(b.name));
      groups.push({ key, countries: nodes });
    }
    if (hasOther) groups.push({ key: 'other', countries: [{ name: OTHER_COUNTRY, cities: [] }] });
    return groups;
  });

  /** Row currently open in the detail screen. */
  protected readonly detailRow = computed<FeedRow | null>(() => {
    const id = this.detailId();
    if (id === null) return null;
    return this.feed().find((r) => r.id === id) ?? null;
  });

  protected readonly detailVerdict = computed<'strong' | 'good' | 'partial' | null>(() => {
    const score = this.detailScore();
    if (score === null) return null;
    if (score >= 80) return 'strong';
    if (score >= 55) return 'good';
    return 'partial';
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
    () => this.view() === 'scanning' || (this.consoleExpanded() && this.showStrip()),
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
      const [sources, feed, profile, settings] = await Promise.all([
        this.db.listSources(),
        this.db.discoverFeed(),
        this.db.getProfile(),
        this.db.getSettings(),
      ]);
      this.sources.set(sources);
      this.feed.set(
        feed.map((item) => ({ ...item, isNew: item.discoverShownAt === null, dismissed: false })),
      );
      this.displayCount.set(FEED_PAGE);
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
  protected async scan(): Promise<void> {
    if (this.scanning()) return;
    const enabled = this.sources().filter((s) => s.isEnabled);
    this.scanning.set(true);
    this.consoleExpanded.set(true);
    this.consoleLines.set(
      startedLines(
        enabled.map((s) => s.name ?? ''),
        this.t(),
      ),
    );

    const started = Date.now();
    try {
      const summary = await this.db.discoverScan();
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      this.consoleLines.set(resultLines(summary, seconds, this.t()));
      const feed = await this.db.discoverFeed();
      this.feed.set(
        feed.map((item) => ({ ...item, isNew: item.discoverShownAt === null, dismissed: false })),
      );
      this.displayCount.set(FEED_PAGE);
      await this.sourcesSvc.reload();
      this.lastScanMarket.set(this.markets());
      this.rescanBannerDismissed.set(false);
    } catch (e) {
      console.error('discover: scan failed', e);
      this.toast.error(String(e));
      this.consoleLines.update((lines) => failureLines(lines, String(e), this.t()));
    } finally {
      this.scanning.set(false);
      this.consoleExpanded.set(false);
    }
  }

  // -------------------------------------------------------- market-changed
  /** From the market-changed banner: drop the stale unsaved results and rescan
   * for the current market. Saved and dismissed jobs are untouched (see
   * db_discover_clear). Then scan(), which realigns lastScanMarket. */
  protected async refreshForMarket(): Promise<void> {
    if (this.refreshingForMarket() || this.scanning()) return;
    this.refreshingForMarket.set(true);
    try {
      try {
        await this.db.discoverClear();
      } catch (e) {
        console.error('discover: clear before refresh failed', e);
      }
      await this.scan();
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
    if (!this.hasClearableJobs()) return;
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
      const removed = await this.db.discoverClear();
      const feed = await this.db.discoverFeed();
      this.feed.set(
        feed.map((item) => ({ ...item, isNew: item.discoverShownAt === null, dismissed: false })),
      );
      this.displayCount.set(FEED_PAGE);
      this.clearConfirm.set(false);
      this.toast.success(this.t()('discover.clear_done').replace('{n}', String(removed)));
    } catch (e) {
      console.error('discover: clear failed', e);
      this.toast.error(String(e));
    } finally {
      this.clearing.set(false);
    }
  }

  // ---------------------------------------------------------------- triage
  /** Row click: open the full-screen job detail. */
  protected openDetail(row: FeedRow): void {
    if (row.dismissed) return;
    this.detailId.set(row.id);
    this.detailBlocks.set(null);
    this.detailSkills.set([]);
    this.detailScore.set(null);
    this.detailSalary.set(null);
    void this.loadDetail(row.id);
  }

  protected closeDetail(): void {
    this.detailId.set(null);
    this.detailBlocks.set(null);
  }

  /** Lazy-load the full JD, parse blocks, detect skills, compute raw score. */
  private async loadDetail(jobId: number): Promise<void> {
    try {
      const job = await this.db.getJob(jobId);
      if (this.detailId() !== jobId) return; // user moved on meanwhile
      const jd = job?.jdText ?? '';
      this.detailSalary.set(extractSalaryFromJd(jd));
      this.detailBlocks.set(parseJdBlocks(jd));
      this.detailSkills.set(this.detectSkills(jd));
      const row = this.detailRow();
      this.detailScore.set(this.computeRawScore(`${row?.title ?? ''}\n${jd}`));
    } catch (e) {
      console.error('discover: load detail failed', e);
      if (this.detailId() === jobId) this.detailBlocks.set([]);
    }
  }

  /** i18n label for the current comp verdict; 'unknown' -> "not stated". */
  protected compBadgeLabel(): string {
    const v = this.compVerdict();
    if (v === 'above') return this.t()('comp.badge_above');
    if (v === 'within') return this.t()('comp.badge_within');
    if (v === 'below') return this.t()('comp.badge_below');
    return this.t()('comp.not_stated');
  }

  /** i18n label for an archetype tier badge. */
  protected archBadgeLabel(fit: ArchetypeFit): string {
    return this.t()('discover.arch_' + fit);
  }

  /** Deterministic dictionary match over the full JD text (0 tokens). */
  private detectSkills(jd: string): string[] {
    const hay = jd.toLowerCase();
    return SKILL_DICT.filter((skill) => {
      const needle = skill.toLowerCase();
      if (needle.length <= 3 || /[^a-z]/.test(needle)) {
        // short or symbol-carrying tokens ("go", "c#", ".net") match whole-word
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(jd);
      }
      return hay.includes(needle);
    }).slice(0, 10);
  }

  /**
   * Raw keyword-fit score, deterministic and explainable (no AI, 0 tokens):
   * coverage of the profile's derived keywords over title+JD, a small bonus per
   * detected skill, plus a tier boost from the open job's best-fit archetype
   * (primary +12, secondary +6, adjacent +0). Null when the profile has no
   * keywords yet.
   */
  private computeRawScore(hayRaw: string): number | null {
    const keywords = this.profileKeywords();
    if (!keywords.length) return null;
    const hay = hayRaw.toLowerCase();
    const matched = keywords.filter((kw) => hay.includes(kw)).length;
    const coverage = matched / Math.min(keywords.length, 10);
    const skillBonus = Math.min(this.detailSkills().length, 6) * 3;
    const detail = this.detailRow();
    const badge = detail ? this.archetypeBadge(detail) : null;
    const tierBoost = badge ? { primary: 12, secondary: 6, adjacent: 0 }[badge.fit] : 0;
    const score = Math.round(30 + coverage * 55 + skillBonus + tierBoost);
    return Math.max(20, Math.min(97, score));
  }

  /** Company monogram for the detail hero tile ("Northwind Labs" -> "NL"). */
  protected initials(company: string | null): string {
    const words = (company ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
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

  /** Country tri-state against its cities present in the feed (own check + cities). */
  protected countryState(node: CountryNode): 'none' | 'some' | 'all' {
    const sel = this.countrySel();
    const self = sel.has(node.name);
    if (!node.cities.length) return self ? 'all' : 'none';
    const on = node.cities.filter((c) => sel.has(this.cityKey(node.name, c))).length;
    if (self && on === node.cities.length) return 'all';
    if (self || on > 0) return 'some';
    return 'none';
  }

  /** Country checkbox toggles the country key and all its cities together. */
  protected toggleCountryTree(node: CountryNode): void {
    const turnOn = this.countryState(node) !== 'all';
    this.countrySel.update((set) => {
      const next = new Set(set);
      const apply = (key: string): void => {
        if (turnOn) next.add(key);
        else next.delete(key);
      };
      apply(node.name);
      for (const c of node.cities) apply(this.cityKey(node.name, c));
      return next;
    });
  }

  /** Region tri-state against the countries actually present in the feed. */
  protected regionState(group: RegionGroup): 'none' | 'some' | 'all' {
    const states = group.countries.map((n) => this.countryState(n));
    if (states.every((s) => s === 'all')) return 'all';
    if (states.every((s) => s === 'none')) return 'none';
    return 'some';
  }

  /** Region checkbox toggles every country (and its cities) in that region. */
  protected toggleRegion(group: RegionGroup): void {
    const turnOn = this.regionState(group) !== 'all';
    this.countrySel.update((set) => {
      const next = new Set(set);
      for (const node of group.countries) {
        const apply = (key: string): void => {
          if (turnOn) next.add(key);
          else next.delete(key);
        };
        apply(node.name);
        for (const c of node.cities) apply(this.cityKey(node.name, c));
      }
      return next;
    });
  }

  protected clearLocations(): void {
    this.countrySel.set(new Set());
  }

  // ------------------------------------------------------------ detail misc
  /** stroke-dasharray for the raw-score ring (r=40 -> C~251.3). */
  protected ringDash(score: number): string {
    const circumference = 2 * Math.PI * 40;
    return `${(score / 100) * circumference} ${circumference}`;
  }

  /** Deterministic tip line under the raw score. */
  protected tipText(row: FeedRow): string {
    if (this.detailVerdict() === 'strong') return this.t()('discover.tip_strong');
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
    try {
      await this.db.upsertApplication({ jobId: row.id, status: 'saved' });
      this.feed.update((rows) =>
        rows.map((r) => (r.id === row.id ? { ...r, saved: true, isNew: false } : r)),
      );
      this.toast.success(this.t()('discover.saved_ok'));
    } catch (e) {
      console.error('discover: save failed', e);
      this.toast.error(String(e));
    }
  }

  protected async dismissRow(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    this.feed.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, dismissed: true } : r)));
    if (this.detailId() === row.id) this.closeDetail();
    try {
      await this.db.discoverDismiss(row.id, true);
    } catch (e) {
      console.error('discover: dismiss failed', e);
      this.toast.error(String(e));
    }
  }

  protected async undoDismiss(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    this.feed.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, dismissed: false } : r)));
    try {
      await this.db.discoverDismiss(row.id, false);
    } catch (e) {
      console.error('discover: undo failed', e);
      this.toast.error(String(e));
    }
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

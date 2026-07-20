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
  parseGeoScopes,
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
  DiscoverFeedItem,
  DiscoverSource,
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
interface FeedSection {
  key: 'foryou' | 'more';
  label: string;
  /** Rows to render now (windowed by the incremental pager). */
  rows: FeedRow[];
  /** Full row count in this section, independent of the render window. */
  total: number;
}

/** Feed rows rendered per page; the list grows in these steps as the user scrolls. */
const FEED_PAGE = 30;
type ConsoleTone = 'header' | 'ok' | 'err' | 'done' | 'active';

interface ConsoleLine {
  text: string;
  tone: ConsoleTone;
}

/** Feed item + client-side triage state (transient until the next reload). */
interface FeedRow extends DiscoverFeedItem {
  /** discoverShownAt was NULL when this feed was loaded. */
  isNew: boolean;
  dismissed: boolean;
}

/** One block of the deterministically parsed job description. */
interface JdBlock {
  kind: 'heading' | 'paragraph' | 'list';
  text?: string;
  items?: string[];
}

const REMOTE_MARKERS = ['remote', 'anywhere', 'worldwide', 'global', 'distributed'];
const ATS_LABEL: Record<string, string> = {
  ats_greenhouse: 'GH',
  ats_lever: 'LEVER',
  ats_ashby: 'ASHBY',
};

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
  imports: [FormsModule, LucideAngularModule, RouterLink],
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

  // ------------------------------------------------------------------ state
  protected readonly loading = signal(true);
  protected readonly scanning = signal(false);
  protected readonly sources = signal<DiscoverSource[]>([]);
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

  // sources drawer forms
  protected readonly boardFormOpen = signal(false);
  protected readonly boardType = signal<'ats_greenhouse' | 'ats_lever' | 'ats_ashby'>(
    'ats_greenhouse',
  );
  protected readonly boardSlug = signal('');
  protected readonly rssUrl = signal('');
  protected readonly rssName = signal('');

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

  protected readonly everScanned = computed(() => this.sources().some((s) => s.lastScanAt));
  protected readonly enabledCount = computed(
    () => this.sources().filter((s) => s.isEnabled).length,
  );

  // ---- Sources drawer: summary + collapsible groups ----
  protected readonly sourcesTotal = computed(() => this.sources().length);
  protected readonly sourcesFailing = computed(
    () => this.sources().filter((s) => this.resultLine(s).error).length,
  );

  /** Collapsed source groups in the drawer ('builtin' | 'boards' | 'yours'). */
  protected readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());
  protected groupCollapsed(key: string): boolean {
    return this.collapsedGroups().has(key);
  }
  protected toggleSourceGroup(key: string): void {
    this.collapsedGroups.update((set) => this.toggled(set, key));
  }
  /** Enabled count within one source group, for its header badge. */
  protected activeCount(list: DiscoverSource[]): number {
    return list.filter((s) => s.isEnabled).length;
  }

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
    return latest ? this.formatTime(latest) : '';
  });

  /** Distinct source names present in the feed, for the source select. */
  protected readonly sourceOptions = computed(() => {
    const names = new Set<string>();
    for (const row of this.feed()) if (row.source) names.add(row.source);
    return [...names].sort();
  });

  protected readonly visibleRows = computed<FeedRow[]>(() => {
    const q = this.query().trim().toLowerCase();
    const sources = this.sourceSel();
    const works = this.workTypeSel();
    const countries = this.countrySel();
    const tab = this.tab();
    return this.feed().filter((row) => {
      if (row.dismissed) return true; // transient "Dismissed · Undo" strip
      if (tab === 'new' && row.saved) return false;
      if (q) {
        const hay = `${row.title ?? ''} ${row.company ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (sources.size > 0 && (row.source === null || !sources.has(row.source))) return false;
      if (works.size > 0 && !works.has(this.workTypeOf(row.location))) return false;
      if (countries.size > 0) {
        const loc = this.classifyLoc(row.location);
        const countryKey = loc.country || OTHER_COUNTRY;
        // Pass when the job's country is picked, or its specific city is picked.
        const byCountry = countries.has(countryKey);
        const byCity = !!loc.city && countries.has(this.cityKey(loc.country, loc.city));
        if (!byCountry && !byCity) return false;
      }
      return true;
    });
  });

  /**
   * True when the job's title matches one of the profile's target-role keywords.
   * Drives the "For you" bucket - a soft ranking, never a hard filter, so the
   * rest of the feed still shows under "More openings".
   */
  protected matchesProfile(row: FeedRow): boolean {
    return this.archetypeBadge(row) !== null;
  }

  /** Best-fit archetype for a feed row (title only; JD not loaded in the feed). */
  protected archetypeBadge(row: FeedRow): ArchetypeMatch | null {
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
  protected readonly feedSections = computed<FeedSection[]>(() => {
    const rows = this.visibleRows();
    if (!this.profileKeywords().length) {
      return [{ key: 'more', label: '', rows, total: rows.length }];
    }
    const forYou = rows
      .filter((r) => this.matchesProfile(r))
      .sort((a, b) => {
        const d = this.rowTierRank(b) - this.rowTierRank(a);
        if (d !== 0) return d;
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      });
    const more = rows.filter((r) => !this.matchesProfile(r));
    const out: FeedSection[] = [];
    if (forYou.length) {
      out.push({
        key: 'foryou',
        label: this.t()('discover.for_you'),
        rows: forYou,
        total: forYou.length,
      });
    }
    if (more.length) {
      out.push({
        key: 'more',
        label: this.t()('discover.more_openings'),
        rows: more,
        total: more.length,
      });
    }
    // Nothing matched the profile -> drop the "More" header so it reads as a
    // plain list rather than a lonely second-tier section.
    if (out.length === 1 && out[0].key === 'more') {
      out[0] = { ...out[0], label: '' };
    }
    return out;
  });

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

  // drawer sections
  protected readonly builtinSources = computed(() => this.sources().filter((s) => s.isBuiltin));
  protected readonly companyBoards = computed(() =>
    this.sources().filter((s) => !s.isBuiltin && (s.type ?? '').startsWith('ats_')),
  );
  protected readonly userSources = computed(() =>
    this.sources().filter((s) => !s.isBuiltin && !(s.type ?? '').startsWith('ats_')),
  );

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
    } catch (e) {
      console.error('discover: load failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  private async reloadSources(): Promise<void> {
    try {
      this.sources.set(await this.db.listSources());
    } catch (e) {
      console.error('discover: sources reload failed', e);
    }
  }

  // ------------------------------------------------------------------ scan
  protected async scan(): Promise<void> {
    if (this.scanning()) return;
    const enabled = this.sources().filter((s) => s.isEnabled);
    this.scanning.set(true);
    this.consoleExpanded.set(true);
    this.consoleLines.set([
      {
        text: this.t()('discover.con_started').replace('{n}', String(enabled.length)),
        tone: 'header',
      },
      ...enabled.map<ConsoleLine>((s) => ({
        text: this.consoleLabel(s.name ?? ''),
        tone: 'active',
      })),
    ]);

    const started = Date.now();
    try {
      const summary = await this.db.discoverScan();
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const lines: ConsoleLine[] = [
        {
          text: this.t()('discover.con_started').replace('{n}', String(summary.sources.length)),
          tone: 'header',
        },
        ...summary.sources.map<ConsoleLine>((r) => ({
          text:
            this.consoleLabel(r.sourceName) +
            ' ' +
            (r.error
              ? this.t()('discover.con_line_err').replace('{err}', r.error)
              : this.t()('discover.con_line_ok')
                  .replace('{fetched}', String(r.fetched))
                  .replace('{filtered}', String(r.filteredOut))
                  .replace('{new}', String(r.newJobs))),
          tone: r.error ? 'err' : 'ok',
        })),
        {
          text: this.t()('discover.con_done')
            .replace('{s}', seconds)
            .replace('{n}', String(summary.totalNew)),
          tone: 'done',
        },
      ];
      this.consoleLines.set(lines);
      const feed = await this.db.discoverFeed();
      this.feed.set(
        feed.map((item) => ({ ...item, isNew: item.discoverShownAt === null, dismissed: false })),
      );
      this.displayCount.set(FEED_PAGE);
      await this.reloadSources();
    } catch (e) {
      console.error('discover: scan failed', e);
      this.consoleLines.update((lines) => [
        ...lines.map((l) => ({ ...l, tone: l.tone === 'active' ? ('err' as const) : l.tone })),
        { text: this.t()('discover.con_line_err').replace('{err}', String(e)), tone: 'err' },
      ]);
    } finally {
      this.scanning.set(false);
      this.consoleExpanded.set(false);
    }
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
      this.detailBlocks.set(this.parseJdBlocks(jd));
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
   * coverage of the profile's derived keywords over title+JD, plus a small
   * bonus per detected skill. Null when the profile has no keywords yet.
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
    this.workTypeSel.update((set) => this.toggled(set, w));
  }

  protected clearWork(): void {
    this.workTypeSel.set(new Set());
  }

  // ---- source checkbox helpers ----
  protected sourceChecked(name: string): boolean {
    return this.sourceSel().has(name);
  }

  protected toggleSourceFilter(name: string): void {
    this.sourceSel.update((set) => this.toggled(set, name));
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
    this.expandedRegions.update((set) => this.toggled(set, key));
  }

  protected countryExpanded(name: string): boolean {
    return this.expandedCountries().has(name);
  }

  protected toggleCountryExpand(name: string, event: Event): void {
    event.stopPropagation();
    this.expandedCountries.update((set) => this.toggled(set, name));
  }

  protected cityChecked(country: string, city: string): boolean {
    return this.countrySel().has(this.cityKey(country, city));
  }

  protected toggleCity(country: string, city: string): void {
    this.countrySel.update((set) => this.toggled(set, this.cityKey(country, city)));
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

  /** Immutable Set toggle shared by every checkbox helper. */
  private toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
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

  /**
   * Deterministic structure for a plain-text JD (0 tokens, no AI).
   * strip_html (Rust) emits one line per block tag with no bullet markers,
   * so structure is recovered heuristically: explicit "- " bullets and runs
   * of 2+ short lines become lists, colon-/lexicon-style short lines become
   * headings, everything else joins into paragraphs.
   */
  private parseJdBlocks(text: string): JdBlock[] {
    const lines = text.split('\n').map((l) => l.trim());
    const blocks: JdBlock[] = [];
    let paragraph: string[] = [];

    const flushParagraph = (): void => {
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
        paragraph = [];
      }
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        flushParagraph();
        i++;
        continue;
      }
      const bullet = line.match(/^[-•*]\s+(.*)$/u);
      if (bullet) {
        flushParagraph();
        const items: string[] = [];
        while (i < lines.length) {
          const m = lines[i].match(/^[-•*]\s+(.*)$/u);
          if (!m) break;
          items.push(m[1]);
          i++;
        }
        blocks.push({ kind: 'list', items });
        continue;
      }
      if (this.looksLikeHeading(line)) {
        flushParagraph();
        blocks.push({ kind: 'heading', text: line.replace(/:$/, '') });
        i++;
        continue;
      }
      // Run of 2+ consecutive short lines (typical <li> output) -> list.
      if (this.isListyLine(line)) {
        let run = 0;
        while (i + run < lines.length && this.isListyLine(lines[i + run])) run++;
        if (run >= 2) {
          flushParagraph();
          blocks.push({ kind: 'list', items: lines.slice(i, i + run) });
          i += run;
          continue;
        }
      }
      paragraph.push(line);
      i++;
    }
    flushParagraph();
    return blocks;
  }

  /** Heading: ends with ':' or a short line matching common JD section words. */
  private looksLikeHeading(line: string): boolean {
    if (line.length > 64) return false;
    if (line.endsWith(':') && !/[.,;!?]$/.test(line.slice(0, -1))) return true;
    if (/[.,;!?]$/.test(line)) return false;
    if (line.split(/\s+/).length > 8) return false;
    return /\b(about|role|responsibilit|requirement|qualification|benefit|offer|stack|skills?|location|language|salary|compensation|team|process|who you|what you|looking for|nice to have|perks|culture|mission)\b/i.test(
      line,
    );
  }

  /** Short line that could be one item of a marker-less <li> run. */
  private isListyLine(line: string): boolean {
    return line.length > 0 && line.length <= 90 && !this.looksLikeHeading(line);
  }

  protected async saveRow(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.db.upsertApplication({ jobId: row.id, status: 'saved' });
      this.feed.update((rows) =>
        rows.map((r) => (r.id === row.id ? { ...r, saved: true, isNew: false } : r)),
      );
    } catch (e) {
      console.error('discover: save failed', e);
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
    }
  }

  protected async undoDismiss(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    this.feed.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, dismissed: false } : r)));
    try {
      await this.db.discoverDismiss(row.id, false);
    } catch (e) {
      console.error('discover: undo failed', e);
    }
  }

  protected async openOriginal(row: FeedRow, event: Event): Promise<void> {
    event.stopPropagation();
    if (row.sourceUrl) await openUrl(row.sourceUrl);
  }

  // --------------------------------------------------------------- sources
  protected async toggleSource(source: DiscoverSource): Promise<void> {
    const enabled = !source.isEnabled;
    this.sources.update((list) =>
      list.map((s) => (s.id === source.id ? { ...s, isEnabled: enabled } : s)),
    );
    try {
      await this.db.setSourceEnabled(source.id, enabled);
    } catch (e) {
      console.error('discover: toggle source failed', e);
      await this.reloadSources();
    }
  }

  protected async addBoard(): Promise<void> {
    const slug = this.boardSlug().trim().toLowerCase();
    if (!slug) return;
    const label = ATS_LABEL[this.boardType()] ?? 'ATS';
    try {
      await this.db.addSource({
        name: `${label}:${slug.toUpperCase()}`,
        sourceType: this.boardType(),
        slug,
      });
      this.boardSlug.set('');
      this.boardFormOpen.set(false);
      await this.reloadSources();
    } catch (e) {
      console.error('discover: add board failed', e);
    }
  }

  protected async addRss(): Promise<void> {
    const url = this.rssUrl().trim();
    const name = this.rssName().trim() || this.hostOf(url);
    if (!url || !name) return;
    try {
      await this.db.addSource({ name, sourceType: 'rss', url });
      this.rssUrl.set('');
      this.rssName.set('');
      await this.reloadSources();
    } catch (e) {
      console.error('discover: add source failed', e);
    }
  }

  protected async removeSource(source: DiscoverSource, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.db.removeSource(source.id);
      await this.reloadSources();
    } catch (e) {
      console.error('discover: remove source failed', e);
    }
  }

  // --------------------------------------------------------------- helpers
  /** Short mono badge label for a source name ("We Work Remotely" -> WWR). */
  protected srcLabel(name: string | null): string {
    if (!name) return '';
    if (/^we work remotely$/i.test(name)) return 'WWR';
    return name.toUpperCase();
  }

  protected typeBadge(source: DiscoverSource): string {
    const type = source.type ?? '';
    if (type.startsWith('ats_')) return 'ATS';
    return type.toUpperCase();
  }

  /** Last-scan line for a source row in the drawer. */
  protected resultLine(source: DiscoverSource): { text: string; error: boolean } {
    if (!source.isEnabled) return { text: this.t()('discover.idle_off'), error: false };
    if (!source.lastScanAt || !source.lastScanJson) {
      return { text: this.t()('discover.never_scanned_short'), error: false };
    }
    try {
      const result = JSON.parse(source.lastScanJson) as ScanSourceResult;
      if (result.error) {
        return { text: `${this.t()('discover.error_short')} · ${result.error}`, error: true };
      }
      return {
        text: this.t()('discover.result_line')
          .replace('{n}', String(result.newJobs))
          .replace('{time}', this.formatTime(source.lastScanAt)),
        error: false,
      };
    } catch {
      return { text: this.t()('discover.never_scanned_short'), error: false };
    }
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

  /** Joins every selected scope region ("Europe, Asia"); Worldwide when none are. */
  protected scopeLabel(): string {
    const keys = parseGeoScopes(this.geoScope());
    const label = keys.length
      ? keys.map((k) => this.t()('discover.region_' + k)).join(', ')
      : this.t()('settings.geo_worldwide');
    return this.t()('discover.scope_label').replace('{scope}', label);
  }

  protected isRemote(location: string | null): boolean {
    const loc = (location ?? '').toLowerCase();
    return REMOTE_MARKERS.some((m) => loc.includes(m));
  }

  private consoleLabel(name: string): string {
    const label = name.toLowerCase().replace(/\s+/g, '');
    return `  ${label} `.padEnd(22, '.');
  }

  private formatTime(sqliteUtc: string): string {
    const date = new Date(sqliteUtc.replace(' ', 'T') + 'Z');
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private hostOf(url: string): string {
    const withoutScheme = url.split('://')[1] ?? url;
    return withoutScheme.split('/')[0] ?? '';
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

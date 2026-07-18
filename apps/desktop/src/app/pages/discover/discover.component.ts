import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Info,
  LucideAngularModule,
  Plus,
  RefreshCw,
  Scan,
  Trash2,
  X,
} from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { DbService } from '@applye/data';
import type { DiscoverFeedItem, DiscoverSource, ScanSourceResult } from '@applye/core';

type View = 'skeleton' | 'first' | 'never' | 'scanning' | 'feed' | 'caughtup';
type GeoFilter = 'all' | 'remote' | 'onsite';
type Tab = 'new' | 'all';
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

const REMOTE_MARKERS = ['remote', 'anywhere', 'worldwide', 'global', 'distributed'];
const KEYWORD_STOPWORDS = ['and', 'or', 'the', 'with', 'for', 'of', 'in'];
const ATS_LABEL: Record<string, string> = {
  ats_greenhouse: 'GH',
  ats_lever: 'LEVER',
  ats_ashby: 'ASHBY',
};

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
  };

  // ------------------------------------------------------------------ state
  protected readonly loading = signal(true);
  protected readonly scanning = signal(false);
  protected readonly sources = signal<DiscoverSource[]>([]);
  protected readonly feed = signal<FeedRow[]>([]);
  protected readonly consoleLines = signal<ConsoleLine[]>([]);
  protected readonly consoleExpanded = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly expandedId = signal<number | null>(null);
  private readonly profileKeywords = signal<string[]>([]);
  protected readonly geoScope = signal('worldwide');

  // filters
  protected readonly query = signal('');
  protected readonly sourceFilter = signal('all');
  protected readonly geoFilter = signal<GeoFilter>('all');
  protected readonly tab = signal<Tab>('new');

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
    const src = this.sourceFilter();
    const geo = this.geoFilter();
    const tab = this.tab();
    return this.feed().filter((row) => {
      if (row.dismissed) return true; // transient "Dismissed · Undo" strip
      if (tab === 'new' && row.saved) return false;
      if (q) {
        const hay = `${row.title ?? ''} ${row.company ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (src !== 'all' && row.source !== src) return false;
      if (geo !== 'all') {
        const remote = this.isRemote(row.location);
        if (geo === 'remote' && !remote) return false;
        if (geo === 'onsite' && remote) return false;
      }
      return true;
    });
  });

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
      this.profileKeywords.set(this.deriveKeywords(profile?.targetArchetypes));
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

  // ---------------------------------------------------------------- triage
  protected toggleExpand(row: FeedRow): void {
    if (row.dismissed) return;
    this.expandedId.update((id) => (id === row.id ? null : row.id));
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
    this.expandedId.update((id) => (id === row.id ? null : id));
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

  protected scopeLabel(): string {
    return this.t()('discover.scope_label').replace('{scope}', this.geoScope().toUpperCase());
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

  /** Mirror of the Rust derive_title_keywords: archetype phrases -> words. */
  private deriveKeywords(archetypes: string | undefined): string[] {
    if (!archetypes) return [];
    let phrases: string[];
    try {
      const parsed = JSON.parse(archetypes) as unknown;
      phrases = Array.isArray(parsed) ? parsed.map(String) : [archetypes];
    } catch {
      phrases = archetypes.split(/[,\n]/);
    }
    const words: string[] = [];
    for (const phrase of phrases) {
      for (const word of phrase.split(/[^\p{L}\p{N}+#]+/u)) {
        const w = word.trim().toLowerCase();
        if (w.length >= 3 && !KEYWORD_STOPWORDS.includes(w) && !words.includes(w)) {
          words.push(w);
        }
      }
    }
    return words;
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

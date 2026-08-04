import { Injectable, computed, inject, signal } from '@angular/core';
import { DiscoverSource } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../core/toast/toast.service';
import { hostOf } from './discover-sources.util';

/** The board providers Applye can add. Narrower than a bare string on
 * purpose: `addSource` accepts only these, and the drawer's picker offers
 * exactly this list. */
export type AtsBoardType = 'ats_greenhouse' | 'ats_lever' | 'ats_ashby' | 'ats_personio';

/** One board provider's short label, used to name the source row it creates. */
const ATS_LABEL: Record<AtsBoardType, string> = {
  ats_greenhouse: 'GH',
  ats_lever: 'LEVER',
  ats_ashby: 'ASHBY',
  ats_personio: 'PERSONIO',
};

/** The shape `sources.lastScanJson` carries, as much of it as is read here. */
interface ScanSourceResult {
  newJobs: number;
  error?: string;
}

/**
 * The Discover sources a scan runs against, and every change the user can make
 * to that list.
 *
 * Owned by a service rather than by the page because two components now read
 * it: the page runs the scan over the enabled sources and shows how many there
 * are, and the Sources drawer adds, removes and switches them. Passing the list
 * down and events back up would have left the drawer's optimistic toggle -
 * flipping the row before the write lands - stranded on the wrong side of the
 * boundary.
 *
 * Provided by the Discover page, so its lifetime is the page's.
 */
@Injectable()
export class DiscoverSourcesService {
  private readonly db = inject(DbService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslateService);
  private readonly t = this.i18n.t;

  /** Every source, built-in and user-added. */
  readonly all = signal<DiscoverSource[]>([]);

  readonly builtin = computed(() => this.all().filter((s) => s.isBuiltin));
  readonly companyBoards = computed(() =>
    this.all().filter((s) => !s.isBuiltin && (s.type ?? '').startsWith('ats_')),
  );
  readonly user = computed(() =>
    this.all().filter((s) => !s.isBuiltin && !(s.type ?? '').startsWith('ats_')),
  );

  readonly total = computed(() => this.all().length);
  readonly enabledCount = computed(() => this.all().filter((s) => s.isEnabled).length);
  readonly failing = computed(() => this.all().filter((s) => this.resultLine(s).error).length);
  readonly everScanned = computed(() => this.all().some((s) => s.lastScanAt));

  async reload(): Promise<void> {
    try {
      this.all.set(await this.db.listSources());
    } catch (e) {
      console.error('discover: sources reload failed', e);
    }
  }

  /**
   * Switches a source on or off, flipping the row before the write lands so the
   * checkbox does not lag the click. A failed write reloads, which is what puts
   * the row back rather than leaving the user looking at a lie.
   */
  async setEnabled(source: DiscoverSource): Promise<void> {
    const enabled = !source.isEnabled;
    this.all.update((list) =>
      list.map((s) => (s.id === source.id ? { ...s, isEnabled: enabled } : s)),
    );
    try {
      await this.db.setSourceEnabled(source.id, enabled);
    } catch (e) {
      console.error('discover: toggle source failed', e);
      this.toast.error(String(e));
      await this.reload();
    }
  }

  /** Adds a company board. Returns whether the row was created, so the form
   * knows whether to clear itself. */
  async addBoard(type: AtsBoardType, slug: string): Promise<boolean> {
    const cleaned = slug.trim().toLowerCase();
    if (!cleaned) return false;
    const label = ATS_LABEL[type];
    try {
      await this.db.addSource({
        name: `${label}:${cleaned.toUpperCase()}`,
        sourceType: type,
        slug: cleaned,
      });
      await this.reload();
      this.toast.success(this.t()('discover.source_added'));
      return true;
    } catch (e) {
      console.error('discover: add board failed', e);
      this.toast.error(String(e));
      return false;
    }
  }

  /** Adds an RSS feed, naming it after its host when the user did not name it. */
  async addRss(rawUrl: string, rawName: string): Promise<boolean> {
    const url = rawUrl.trim();
    const name = rawName.trim() || hostOf(url);
    if (!url || !name) return false;
    try {
      await this.db.addSource({ name, sourceType: 'rss', url });
      await this.reload();
      this.toast.success(this.t()('discover.source_added'));
      return true;
    } catch (e) {
      console.error('discover: add source failed', e);
      this.toast.error(String(e));
      return false;
    }
  }

  async remove(source: DiscoverSource): Promise<void> {
    try {
      await this.db.removeSource(source.id);
      await this.reload();
      this.toast.success(this.t()('discover.source_removed'));
    } catch (e) {
      console.error('discover: remove source failed', e);
      this.toast.error(String(e));
    }
  }

  /** Last-scan line for a source row in the drawer. */
  resultLine(source: DiscoverSource): { text: string; error: boolean } {
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
          .replace('{time}', formatScanTime(source.lastScanAt)),
        error: false,
      };
    } catch {
      return { text: this.t()('discover.never_scanned_short'), error: false };
    }
  }
}

/**
 * A SQLite UTC timestamp as a local clock time. Exported because the page's
 * "last scan" line and the drawer's per-source line format the same value and
 * must not drift apart.
 */
export function formatScanTime(sqliteUtc: string): string {
  const date = new Date(sqliteUtc.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

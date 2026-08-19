import { Injectable, computed, inject, signal } from '@angular/core';
import type { Settings, TrackerRow } from '@applye/core';
import { DbService, JobsGateway, TrackerGateway } from '@applye/data';
import {
  TrackerRange,
  TrackerSegment,
  filterTrackerRows,
  reportTrackerRows,
  summarizeTrackerRows,
  trackerRangeStart,
} from './tracker-rows';

/**
 * The tracker's rows, the toolbar that narrows them, and the two writes that
 * change a row's place rather than its contents.
 *
 * The row *editor* is a separate store: it holds a draft of one row and writes
 * the tracker fields, while this one holds the list every screen derives from.
 *
 * **It never notifies the user** (ADR-0005, amendment three). `setArchived` and
 * `remove` report their outcome and let a gateway failure throw; the row menu,
 * the delete confirmation and the toast all stay on the page.
 *
 * Component-scoped.
 */
@Injectable()
export class TrackerRowsStore {
  private readonly db = inject(DbService);
  private readonly jobs = inject(JobsGateway);
  /** Rows and archiving come from `TrackerGateway`; `db` stays for
   * `deleteJob` and `getSettings`, whose domains have not moved. */
  private readonly tracker = inject(TrackerGateway);

  readonly all = signal<TrackerRow[]>([]);
  readonly settings = signal<Settings | null>(null);
  readonly loading = signal(true);

  /** Whether the last `load` failed. Separate from `settings()` being `null`,
   * which is a successful read of a database that has no settings row - the
   * page defaults the report market from the second and must not from the
   * first. */
  readonly loadError = signal(false);

  readonly segment = signal<TrackerSegment>('active');
  readonly range = signal<TrackerRange>('3months');
  readonly statusFilter = signal<string>('');

  readonly isGerman = computed(() => this.settings()?.uiLanguage === 'de');

  private readonly minAppliedAt = computed(() => trackerRangeStart(this.range()));

  /** The grid's rows: segment, then status filter, then period. */
  readonly view = computed(() =>
    filterTrackerRows(this.all(), this.segment(), this.statusFilter(), this.minAppliedAt()),
  );

  /** The report's rows: period only, archived included, oldest first. */
  readonly reportRows = computed(() => reportTrackerRows(this.all(), this.minAppliedAt()));

  /** Both counts ignore the period and the status filter - they label the two
   * segment tabs, so they must not change when the toolbar narrows the grid. */
  readonly activeCount = computed(() => this.all().filter((r) => !r.archived).length);
  readonly archivedCount = computed(() => this.all().filter((r) => r.archived).length);

  readonly summary = computed(() => summarizeTrackerRows(this.reportRows()));

  /**
   * Reads the rows and the settings in one round trip. Never rejects: a failure
   * empties the rows, which is what the page did, so the grid renders its empty
   * state rather than stale data, and raises `loadError` so a caller can tell
   * that apart from a database with nothing in it.
   */
  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [rows, settings] = await Promise.all([
        this.tracker.trackerRows(),
        this.db.getSettings(),
      ]);
      this.all.set(rows);
      this.settings.set(settings);
    } catch {
      this.all.set([]);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Archives or restores one row, and moves it between the two segments in
   * place rather than re-reading the whole list. A gateway error propagates and
   * the row is left where it was. */
  async setArchived(row: TrackerRow, archived: boolean): Promise<void> {
    await this.tracker.setApplicationArchived(row.id, archived);
    this.all.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, archived } : r)));
  }

  /**
   * Deletes the job behind a row, which removes the application with it.
   * Returns `false` when the row has no job to delete - the caller must treat
   * that as "no write happened", not as failure. A gateway error propagates and
   * the row stays in the list.
   */
  async remove(row: TrackerRow): Promise<boolean> {
    if (row.jobId == null) return false;
    await this.jobs.deleteJob(row.jobId);
    this.all.update((rows) => rows.filter((r) => r.id !== row.id));
    return true;
  }
}

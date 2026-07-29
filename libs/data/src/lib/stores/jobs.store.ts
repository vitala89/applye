import { Injectable, inject, signal } from '@angular/core';
import { JobOverview } from '@applye/core';
import { DbService } from '../services/db.service';

/**
 * Shared reactive projection over the jobs list. SQLite (via DbService) stays
 * the source of truth - this only mirrors it in memory so My Jobs and the job
 * detail view stay in sync without a full reload after every mutation.
 *
 * Plain Angular signals rather than an NgRx SignalStore. The store had grown to
 * exactly one instance holding six externally-used members, which `signal()`
 * and `computed()` cover natively - and NgRx's peer range on `@angular/core`
 * would otherwise gate every future Angular major on a release of a library
 * doing seventy lines of work.
 */
@Injectable({ providedIn: 'root' })
export class JobsStore {
  private readonly db = inject(DbService);

  private readonly overviewState = signal<JobOverview[]>([]);
  private readonly loadingState = signal(false);
  private readonly loadErrorState = signal(false);
  private readonly overviewLoaded = signal(false);

  /** The jobs list as last read from SQLite. */
  readonly overview = this.overviewState.asReadonly();
  /** True while `loadOverview` is in flight. */
  readonly loading = this.loadingState.asReadonly();
  /** True when the last `loadOverview` threw. Cleared on the next attempt. */
  readonly loadError = this.loadErrorState.asReadonly();

  /**
   * Reads the overview once and caches it. Pass `force` after a mutation that
   * this store cannot mirror locally.
   */
  async loadOverview(force = false): Promise<void> {
    if (this.overviewLoaded() && !force) return;
    this.loadingState.set(true);
    this.loadErrorState.set(false);
    try {
      this.overviewState.set(await this.db.listJobsOverview());
      this.overviewLoaded.set(true);
    } catch {
      this.loadErrorState.set(true);
    } finally {
      this.loadingState.set(false);
    }
  }

  /** Deletes the job and its cascade, then drops its row from the mirror. */
  async deleteJob(id: number): Promise<void> {
    await this.db.deleteJob(id);
    this.overviewState.update((rows) => rows.filter((row) => row.id !== id));
  }

  /**
   * Patches one row in the mirror without touching the database. The caller is
   * responsible for having already persisted the same change - this exists so a
   * screen that just wrote to SQLite does not have to re-read the whole list.
   */
  patchOverviewRow(id: number, patch: Partial<JobOverview>): void {
    this.overviewState.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
}

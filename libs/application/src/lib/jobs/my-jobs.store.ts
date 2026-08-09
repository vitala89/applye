import { Injectable, computed, inject, signal } from '@angular/core';
import type { JobOverview } from '@applye/core';
import { JobsStore } from '@applye/data';
import { isRowVisible, rowStatus } from './job-overview-rows';

export type SortKey =
  'company' | 'title' | 'score' | 'status' | 'legitimacyTier' | 'createdAt' | 'source';

/**
 * The My Jobs table: what is being searched, filtered and sorted, and which row
 * is waiting on a delete confirmation.
 *
 * The rows themselves are `JobsStore`'s, in `libs/data` - it is the shared
 * cache two screens read, and duplicating it here would be a second copy that
 * could disagree with the first. This store holds only what is true of *this*
 * screen.
 *
 * Sorting and filtering run client-side over the loaded overview: the table is
 * read-only and costs nothing, which is what makes re-deriving on every
 * keystroke the right shape rather than a query per change.
 */
@Injectable()
export class MyJobsStore {
  private readonly jobs = inject(JobsStore);

  readonly loading = this.jobs.loading;
  readonly loadError = this.jobs.loadError;

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly legitFilter = signal('');
  readonly minScore = signal<number | null>(null);
  readonly sortKey = signal<SortKey>('createdAt');
  readonly sortDir = signal<'asc' | 'desc'>('desc');

  /** Off by default: My Jobs means the jobs the user decided on until they ask
   * otherwise. See ADR-0004. */
  readonly showAnalysed = signal(false);

  /** Non-null while the delete confirmation is open. */
  readonly deleteTarget = signal<JobOverview | null>(null);
  readonly deleting = signal(false);

  /**
   * No jobs at all, which is a different screen from "the filters hid them" -
   * the empty state should not tell a user with 200 jobs that they have none.
   */
  readonly isEmpty = computed(() => this.jobs.overview().length === 0);

  readonly view = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sf = this.statusFilter();
    const lf = this.legitFilter();
    const ms = this.minScore();
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const showAnalysed = this.showAnalysed();

    const filtered = this.jobs.overview().filter((r) => {
      if (!isRowVisible(r, showAnalysed)) return false;
      if (q && !`${r.company ?? ''} ${r.title ?? ''}`.toLowerCase().includes(q)) return false;
      if (sf && rowStatus(r) !== sf) return false;
      if (lf && (r.legitimacyTier ?? 'green') !== lf) return false;
      if (ms != null && (r.score ?? -1) < ms) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  });

  async load(): Promise<void> {
    await this.jobs.loadOverview(true);
  }

  /** Clicking the same column flips direction; a new column starts ascending. */
  setSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  requestDelete(row: JobOverview): void {
    this.deleteTarget.set(row);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  readonly error = signal('');

  /**
   * Returns null when there was nothing to do - no target, or a delete already
   * running - so the page can stay silent on a refusal and speak only on a
   * failure, which is what `error` carries.
   */
  async confirmDelete(): Promise<boolean | null> {
    const row = this.deleteTarget();
    if (!row || this.deleting()) return null;
    this.deleting.set(true);
    this.error.set('');
    try {
      await this.jobs.deleteJob(row.id);
      this.deleteTarget.set(null);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.deleting.set(false);
    }
  }
}

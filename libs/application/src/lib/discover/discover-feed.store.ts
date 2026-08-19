import { Injectable, computed, inject, signal } from '@angular/core';
import type { DiscoverFeedItem } from '@applye/core';
import { DiscoverGateway, JobsGateway } from '@applye/data';

/** A scanned job plus the triage state the page holds until the next reload. */
export interface FeedRow extends DiscoverFeedItem {
  /** `discoverShownAt` was NULL when this feed was read. */
  isNew: boolean;
  dismissed: boolean;
}

/** Rows rendered at once; the window grows by this much as the user scrolls. */
export const FEED_PAGE = 30;

/**
 * The scanned jobs Discover lists, and every write that changes one.
 *
 * **Component-scoped.** The rows are the page's working copy, including the
 * dismissal state that is transient by design - a dismissed row renders as an
 * undo strip and disappears on the next read, so it must not survive the page.
 *
 * **Filtering and sectioning are not here.** They read the filter controls,
 * which the page owns, and they produce what to render rather than what is
 * true. This store answers what the feed contains; the page decides what of it
 * to show.
 *
 * Every write mirrors into the rows rather than re-reading the whole feed, and
 * reports failure back instead of raising a toast: telling the user is the
 * app's job.
 */
@Injectable()
export class DiscoverFeedStore {
  private readonly db = inject(JobsGateway);
  /** Feed reads and the dismiss/clear writes; `db` stays only for
   * `upsertApplication`, which belongs to the jobs domain and has not moved. */
  private readonly discover = inject(DiscoverGateway);

  private readonly rowsState = signal<FeedRow[]>([]);
  private readonly displayCountState = signal(FEED_PAGE);

  readonly rows = this.rowsState.asReadonly();
  /** How many rows the page may render right now. */
  readonly displayCount = this.displayCountState.asReadonly();
  /** True when there is anything a "clear" would actually delete. */
  readonly hasClearableJobs = computed(() => this.rowsState().some((r) => !r.saved));

  /** Reads the feed and resets the render window to the first page. */
  async load(): Promise<void> {
    this.receive(await this.discover.discoverFeed());
  }

  /** Renders one more page. */
  showMore(): void {
    this.displayCountState.update((n) => n + FEED_PAGE);
  }

  /**
   * Saves the job into My Jobs.
   *
   * The row is mirrored **after** the write, unlike dismissal: saving is what
   * the user asked for and a failure means it did not happen, so showing it as
   * saved first would be a lie the toast then contradicts.
   */
  async save(jobId: number): Promise<string | null> {
    try {
      await this.db.upsertApplication({ jobId, status: 'saved' });
      this.patch(jobId, { saved: true, isNew: false });
      return null;
    } catch (e) {
      console.error('discover: save failed', e);
      return String(e);
    }
  }

  /**
   * Dismisses a row, or brings it back.
   *
   * The row is mirrored **before** the write, unlike saving: dismissal is a
   * triage gesture over a long list, it has an undo in reach, and waiting for
   * the database would make the list feel stuck. A failure is reported and the
   * next read restores the truth.
   */
  async setDismissed(jobId: number, dismissed: boolean): Promise<string | null> {
    this.patch(jobId, { dismissed });
    try {
      await this.discover.discoverDismiss(jobId, dismissed);
      return null;
    } catch (e) {
      console.error('discover: dismiss failed', e);
      return String(e);
    }
  }

  /**
   * Deletes every unsaved scanned job and reads the feed back.
   *
   * Returns how many rows were removed, or the error text. The count is what
   * the page acknowledges a destructive action with.
   */
  async clear(): Promise<{ removed: number } | { error: string }> {
    try {
      const removed = await this.discardUnsaved();
      await this.load();
      return { removed };
    } catch (e) {
      console.error('discover: clear failed', e);
      return { error: String(e) };
    }
  }

  /**
   * Deletes every unsaved scanned job **without** reading the feed back.
   *
   * For the caller that is about to scan anyway: re-reading a feed that is
   * about to be replaced is one round trip for rows nobody will see. Throws
   * rather than reporting, because the one caller deliberately continues past a
   * failure - a stale row surviving into the next scan is better than not
   * scanning.
   */
  async discardUnsaved(): Promise<number> {
    return this.discover.discoverClear();
  }

  /** A fresh read: nothing is new that the database did not say is new. */
  private receive(items: DiscoverFeedItem[]): void {
    this.rowsState.set(
      items.map((item) => ({ ...item, isNew: item.discoverShownAt === null, dismissed: false })),
    );
    this.displayCountState.set(FEED_PAGE);
  }

  private patch(jobId: number, changes: Partial<FeedRow>): void {
    this.rowsState.update((rows) =>
      rows.map((row) => (row.id === jobId ? { ...row, ...changes } : row)),
    );
  }
}

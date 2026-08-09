import { Injectable, computed, inject, signal } from '@angular/core';
import type { PipelineCard } from '@applye/core';
import { DbService } from '@applye/data';

/**
 * The Interview Prep list: every application with at least one stage, sorted
 * soonest-upcoming first, plus which row's menu is open and which row is being
 * confirmed for removal.
 *
 * **The menu and the confirmation moved with the data** (ADR-0005, amendment
 * twenty-nine). Amendment twenty-two kept `tracker`'s delete confirmation on
 * the page for a specific reason - the row component is reused rather than
 * recreated as the selection changes, so a child owning the flag would carry
 * one row's half-confirmed delete to the next. This is a page: there is one of
 * it, it is destroyed on navigation, and that reason does not reach here.
 *
 * **`stats` returns `nextAt` as the stored ISO string, not formatted text.**
 * Formatting is presentation and locale-dependent, and this layer refuses
 * translations for the same reason it refuses toasts.
 */
@Injectable()
export class InterviewPrepStore {
  private readonly db = inject(DbService);

  private readonly cards = signal<PipelineCard[]>([]);
  readonly loading = signal(true);
  readonly menuId = signal<number | null>(null);
  readonly confirmId = signal<number | null>(null);
  readonly removing = signal(false);
  /** What went wrong, for the page to show. Empty when nothing did, and empty
   * after a refusal - which is how the page tells "it failed" from "it declined
   * to start", the same contract `StageQuickAddStore` uses. */
  readonly error = signal('');

  /** Rows with a stage, soonest first; anything unscheduled sinks to the end,
   * because a date the user has not set should not outrank one they have. */
  readonly rows = computed(() =>
    this.cards()
      .filter((c) => c.currentStageOrder != null)
      .sort((a, b) => {
        const aAt = a.currentStageScheduledAt;
        const bAt = b.currentStageScheduledAt;
        if (!aAt && !bAt) return 0;
        if (!aAt) return 1;
        if (!bAt) return -1;
        return aAt.localeCompare(bAt);
      }),
  );

  readonly stats = computed(() => {
    const rows = this.rows();
    const upcoming = rows.filter((r) => r.currentStageStatus === 'scheduled');
    const next = upcoming.find((r) => r.currentStageScheduledAt);
    return {
      tracking: rows.length,
      upcoming: upcoming.length,
      nextAt: next?.currentStageScheduledAt ?? null,
      nextCompany: next?.company ?? '',
    };
  });

  readonly confirmRow = computed(() => this.rows().find((r) => r.id === this.confirmId()) ?? null);

  /** Never rejects: a failed read leaves the list empty and returns `false`, so
   * the page can say so. */
  async load(): Promise<boolean> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.cards.set(await this.db.listPipelineCards());
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  toggleMenu(id: number): void {
    this.menuId.update((m) => (m === id ? null : id));
  }

  closeMenus(): void {
    this.menuId.set(null);
  }

  /** Opening the confirmation closes the menu it was opened from. */
  askRemove(id: number): void {
    this.menuId.set(null);
    this.confirmId.set(id);
  }

  cancelRemove(): void {
    this.confirmId.set(null);
  }

  /**
   * Removing an application from Interview Prep means deleting every stage it
   * has; the application and the job itself stay in My Jobs and Pipeline.
   *
   * The row is cleared locally rather than by reloading the list, which is what
   * the page did: a reload would re-sort every other row under the user while
   * they are looking at it.
   *
   * Returns `false` when it refused - no row confirmed, or a removal already
   * running - as well as when the delete failed; the two are distinguished the
   * same way the other stores do it, by whether anything was in flight.
   */
  async confirmRemove(): Promise<boolean> {
    const id = this.confirmId();
    if (id == null || this.removing()) return false;
    this.removing.set(true);
    this.error.set('');
    try {
      const stages = await this.db.listInterviewStages(id);
      await Promise.all(stages.map((s) => this.db.deleteInterviewStage(s.id)));
      this.cards.update((cs) =>
        cs.map((c) =>
          c.id === id
            ? {
                ...c,
                currentStageOrder: undefined,
                currentStageLabel: undefined,
                currentStageStatus: undefined,
                currentStageScheduledAt: undefined,
              }
            : c,
        ),
      );
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.removing.set(false);
      this.confirmId.set(null);
    }
  }
}

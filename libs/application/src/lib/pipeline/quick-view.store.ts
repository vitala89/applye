import { Injectable, inject, signal } from '@angular/core';
import type {
  Application,
  ApplicationStatus,
  Comment,
  InterviewStage,
  Priority,
} from '@applye/core';
import { InterviewGateway, JobsGateway } from '@applye/data';
import { pickCurrentStage, sortStages } from './interview-stage-view';

/**
 * The quick-view modal's contents: an application's comments, its stage list,
 * and the three writes the modal offers.
 *
 * **The card itself is not here.** It is a required input on the component, and
 * an input belongs to the component that declares it (ADR-0005, amendment
 * thirty-one, following twenty-eight). Copying it into a store signal would be
 * worse than not holding it: the board mutates those card objects **by
 * reference** when a status or priority changes, so a second copy would be one
 * the store could not keep in sync. So every method here takes the id it needs.
 *
 * **It emits nothing and shows nothing.** The writes return their result and
 * the component both tells the user and emits to the board, which owns the
 * cards. That is the same boundary the other stores keep against toasts,
 * translations and navigation.
 */
@Injectable()
export class QuickViewStore {
  private readonly db = inject(JobsGateway);
  /** Stages come from `InterviewGateway`; `db` stays for the comment and
   * status writes, which belong to the jobs domain and have not moved. */
  private readonly interview = inject(InterviewGateway);

  readonly statusBusy = signal(false);
  readonly priorityBusy = signal(false);

  readonly comments = signal<Comment[]>([]);
  readonly commentsLoading = signal(true);
  readonly commentsError = signal('');
  readonly commentText = signal('');
  readonly commentBusy = signal(false);

  /** The single "current" stage, for the headline and the card footer. */
  readonly stageSummary = signal<InterviewStage | null>(null);
  /** The full ordered list, for the segmented stepper. */
  readonly stages = signal<InterviewStage[]>([]);
  readonly stagesLoading = signal(true);
  /** What a failed stage read reported. The stepper renders an empty `stages`
   * as "no stages yet", which is a true statement about an application that has
   * none and a false one about an application whose read failed. */
  readonly stagesError = signal('');

  /** What a failed write reported, for the page to show. Empty after a refusal,
   * which is how the page tells "it failed" from "it declined to start". */
  readonly error = signal('');

  async loadComments(applicationId: number): Promise<boolean> {
    this.commentsLoading.set(true);
    this.commentsError.set('');
    try {
      this.comments.set(await this.db.listApplicationComments(applicationId));
      return true;
    } catch (e) {
      this.commentsError.set(String(e));
      this.error.set(String(e));
      return false;
    } finally {
      this.commentsLoading.set(false);
    }
  }

  /**
   * An application that is not at `interview` has no stage state to show, and
   * asking for it would be a read that can only return nothing - so the lists
   * are cleared without a call.
   *
   * Reports like `loadComments` above, and for the same reason. This used to be
   * a `try`/`finally` with no `catch`, called as `void refreshStages(...)` from
   * an effect: the rejection reached the global listener as a bare toast, but
   * `stages` was left empty, so the stepper said the interview had no stages
   * while the message said something else entirely. The two halves of the same
   * failure disagreed on screen.
   */
  async refreshStages(applicationId: number, status: ApplicationStatus): Promise<boolean> {
    this.stagesError.set('');
    if (status !== 'interview') {
      this.stageSummary.set(null);
      this.stages.set([]);
      this.stagesLoading.set(false);
      return true;
    }
    this.stagesLoading.set(true);
    try {
      const stages = await this.interview.listInterviewStages(applicationId);
      this.stages.set(sortStages(stages));
      this.stageSummary.set(pickCurrentStage(stages));
      return true;
    } catch (e) {
      this.stagesError.set(String(e));
      this.error.set(String(e));
      return false;
    } finally {
      this.stagesLoading.set(false);
    }
  }

  /** Records a stage the quick-add form just created, so the headline updates
   * without a re-read. */
  noteStageAdded(stage: InterviewStage): void {
    this.stageSummary.set(stage);
  }

  /**
   * Writes the new status and returns the whole row - the board needs
   * `appliedAt`, `followUpAt` and therefore `overdue`, not just the status
   * literal, because SQL recomputes them on the applied and interview
   * transitions.
   *
   * Returns `null` when it refused - the status is already set, or a write is
   * running - as well as when the write failed; `error` tells the two apart.
   */
  async setStatus(applicationId: number, from: ApplicationStatus, to: ApplicationStatus) {
    if (to === from || this.statusBusy()) return null;
    this.statusBusy.set(true);
    this.error.set('');
    try {
      return await this.db.setApplicationStatus(applicationId, to);
    } catch (e) {
      this.error.set(String(e));
      return null;
    } finally {
      this.statusBusy.set(false);
    }
  }

  async setPriority(applicationId: number, from: Priority, to: Priority): Promise<boolean> {
    if (to === (from ?? null) || this.priorityBusy()) return false;
    this.priorityBusy.set(true);
    this.error.set('');
    try {
      await this.db.setApplicationPriority(applicationId, to);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.priorityBusy.set(false);
    }
  }

  /**
   * Appends a comment and clears the box only on success, so a failed write
   * does not lose what the user typed.
   *
   * Returns `false` for an empty box or a write already running, and for a
   * failure; `commentsError` distinguishes them.
   */
  async addComment(applicationId: number): Promise<boolean> {
    const text = this.commentText().trim();
    if (!text || this.commentBusy()) return false;
    this.commentBusy.set(true);
    this.commentsError.set('');
    this.error.set('');
    try {
      const comment: Comment = await this.db.addApplicationComment(applicationId, text);
      this.comments.update((list) => [...list, comment]);
      this.commentText.set('');
      return true;
    } catch (e) {
      this.commentsError.set(String(e));
      this.error.set(String(e));
      return false;
    } finally {
      this.commentBusy.set(false);
    }
  }
}

/** Re-exported so a caller typing the status write's result does not have to
 * reach for `@applye/core` separately. */
export type QuickViewStatusResult = Application | null;

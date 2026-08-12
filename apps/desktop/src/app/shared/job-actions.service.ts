import { Injectable, inject, signal } from '@angular/core';
import { Application } from '@applye/core';
import { DbService, JobsStore } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../core/toast/toast.service';
import { JobIdentityResolverService } from '@applye/application';

/**
 * The job-level actions that write a row and then tell the rest of the app:
 * saving a job as a tracked lead, and deleting it. Both own their own busy
 * flag, their own message line, and their own failure handling, because the
 * page's only remaining job is to decide what to do with the answer.
 *
 * Marking a job applied is deliberately NOT here: it commits documents, closes
 * the wizard and navigates, which makes it orchestration rather than an action.
 *
 * Component-scoped via the page's `providers`.
 */
@Injectable()
export class JobActionsService {
  private readonly db = inject(DbService);
  private readonly jobsStore = inject(JobsStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslateService);
  private readonly identity = inject(JobIdentityResolverService);
  private readonly t = this.i18n.t;

  /** Writable so the page can alias them onto the template. */
  readonly busy = signal(false);
  /**
   * Set only while Mark as Applied runs, so the button can say what is
   * happening. `busy` alone cannot: saving a lead raises it too, and the two
   * take very different amounts of time - committing the documents generates
   * whatever the application is missing, which can run for minutes against the
   * configured provider. A dead button for that long reads as a hang.
   */
  readonly applying = signal(false);
  readonly message = signal('');
  readonly deleteConfirmOpen = signal(false);
  readonly deleting = signal(false);

  openDeleteConfirm(): void {
    this.deleteConfirmOpen.set(true);
  }

  cancelDeleteConfirm(): void {
    this.deleteConfirmOpen.set(false);
  }

  /**
   * Track this job as a `saved` lead - My Jobs and the Job Tracker - without
   * claiming it was applied to. Distinct from Mark as Applied, which records an
   * actual application and shows on the Pipeline board.
   *
   * Returns the application row, or null when the write failed or another
   * action was already running.
   */
  async save(jobId: number, existing: Application | null): Promise<Application | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    this.message.set('');
    try {
      const patch: Partial<Application> & { jobId: number; status: 'saved' } = {
        jobId,
        status: 'saved',
      };
      if (existing?.id) patch.id = existing.id;
      const app = await this.db.upsertApplication(patch);
      // Mirror the status the DB actually recorded, not the literal we asked
      // for - the DB is the single source of truth for the overview row.
      this.jobsStore.patchOverviewRow(jobId, { status: app.status });
      this.message.set(this.t()('jobs.saved_ok'));
      this.toast.success(this.t()('jobs.saved_ok'));
      return app;
    } catch (e) {
      this.fail(e);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Record that the user applied. Distinct from `save`, which tracks a lead:
   * this one shows on the Pipeline board.
   *
   * `commitDocuments` runs **before** the status flips, and its failure aborts
   * the whole thing. A job marked applied must already own its CV and cover
   * letter, or the user is applied to a job with nothing attached to it. The
   * page owns that step because it reads the tailoring on screen.
   *
   * `ensureApplication` is the page's draft hook, and this service deliberately
   * writes no application row of its own. A row written here would not reach
   * the signal the page holds, so the first step of `commitDocuments` to ask
   * for a draft would find none and write a **second** row for the same job -
   * the status then lands on one of them and the other is orphaned.
   *
   * Returns the application as the database recorded it, or null when the write
   * failed or another action was already running. On success `busy` is
   * deliberately left set, the same rule `remove` follows: the caller navigates
   * away, and clearing it first puts a live button back on screen for the frame
   * before the route changes.
   */
  async markApplied(
    ensureApplication: () => Promise<Application>,
    commitDocuments: () => Promise<void>,
  ): Promise<Application | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    this.applying.set(true);
    this.message.set('');
    try {
      const app = await ensureApplication();
      await commitDocuments();
      const updated = await this.db.setApplicationStatus(app.id as number, 'applied');
      // Mirror the status the DB actually recorded, not the literal we asked
      // for - the DB is the single source of truth for the overview row.
      this.jobsStore.patchOverviewRow(app.jobId, { status: updated.status });
      this.toast.success(this.t()('jobs.applied_ok'));
      return updated;
    } catch (e) {
      this.fail(e);
      this.busy.set(false);
      this.applying.set(false);
      return null;
    }
  }

  /**
   * Delete the job. Returns true when it went, and on that path deliberately
   * leaves `deleting` set and the confirm open: the caller navigates away, and
   * clearing them first puts the dialog back on screen for the frame before the
   * route changes. Only failure returns the page to a usable state.
   */
  async remove(jobId: number): Promise<boolean> {
    if (this.deleting()) return false;
    this.deleting.set(true);
    try {
      await this.jobsStore.deleteJob(jobId);
      // The identification badge offers a way back to a job. Deleting one is
      // the case where that page no longer exists.
      this.identity.clear(jobId);
      this.toast.success(this.t()('jobs.delete_ok'));
      return true;
    } catch (e) {
      this.fail(e);
      this.deleting.set(false);
      this.deleteConfirmOpen.set(false);
      return false;
    }
  }

  private fail(e: unknown): void {
    this.message.set(String(e));
    this.toast.error(String(e));
  }
}

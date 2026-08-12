import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { DbService, JobsStore } from '@applye/data';
import { WizardProgressService } from '@applye/application';

/** What the caller still owes once the job has loaded, if anything. */
export type WizardRestore = 'return' | 'restore-docs' | null;

/** The wizard step the documents live on - the one step that has async work
 * owed when it is restored from a route or from saved progress. */
const DOCUMENTS_STEP = 3;

/**
 * Where the apply wizard is: open or closed, which step, and the saved
 * progress that lets a user leave the page and come back mid-flow.
 *
 * Deliberately free of the work each step triggers - tailoring, scoring,
 * document drafts. The page component still owns those and calls in here for
 * the navigation half, so this stays testable without an AI call or a database.
 *
 * Component-scoped via the page's `providers`, so one instance lives exactly as
 * long as one page component.
 */
@Injectable()
export class WizardNavService {
  private readonly progressSvc = inject(WizardProgressService);
  private readonly jobsStore = inject(JobsStore);
  private readonly db = inject(DbService);
  private readonly document = inject(DOCUMENT);

  /** Writable so the page component can alias it straight onto the template. */
  readonly open = signal(false);
  readonly initialStep = signal(0);
  /** Raised when opening the wizard here would abandon another job's session. */
  readonly crossJobConfirmOpen = signal(false);

  /**
   * Company/role of the other job whose tailoring is unfinished, for the
   * cross-job confirm copy.
   *
   * Read from the overview list first, and from the job itself when the list
   * has no row for it. My Jobs now holds only the jobs the user claimed, so a
   * session started on an analysed-but-unsaved job is not in that list - and
   * the confirm would have asked the user to abandon work it could not name.
   * Filled when the confirm is raised rather than computed, because the second
   * lookup reaches the database.
   */
  readonly crossJobLabel = signal('');

  private async describeOtherJob(jobId: number): Promise<string> {
    const row = this.jobsStore.overview().find((r) => r.id === jobId);
    if (row) return [row.company, row.title].filter(Boolean).join(' - ');
    const job = await this.db.getJob(jobId).catch(() => null);
    return [job?.company, job?.title].filter(Boolean).join(' - ');
  }

  /**
   * Open the wizard at step 0 for `jobId`. Starting an application here
   * silently overwrote an unfinished session for another job, so a session
   * belonging to a different job raises the confirm instead and returns
   * `false` - the caller does nothing more until the user answers.
   */
  requestOpen(jobId: number | undefined): boolean {
    const prog = this.progressSvc.progress();
    if (prog && jobId && prog.jobId !== jobId) {
      this.crossJobLabel.set('');
      void this.describeOtherJob(prog.jobId).then((label) => this.crossJobLabel.set(label));
      this.crossJobConfirmOpen.set(true);
      return false;
    }
    this.forceOpen(jobId);
    return true;
  }

  /** Abandon the other job's unfinished session and open the wizard here. */
  confirmCrossJob(jobId: number | undefined): void {
    this.crossJobConfirmOpen.set(false);
    this.progressSvc.clear();
    this.forceOpen(jobId);
  }

  cancelCrossJob(): void {
    this.crossJobConfirmOpen.set(false);
  }

  private forceOpen(jobId: number | undefined): void {
    this.initialStep.set(0);
    this.open.set(true);
    this.goTo(jobId, 0);
  }

  /** Move to `step` and remember it, so leaving the page (sidebar nav, the
   * document editor) brings the user back to this exact step. Every step
   * transition lands them at the top of the page. */
  goTo(jobId: number | undefined, step: number): void {
    this.initialStep.set(step);
    if (jobId != null) this.progressSvc.set(jobId, step);
    this.scrollToTop();
  }

  /** Leaving the wizard for this job's summary ends the in-flight session, so
   * the floating resume affordance should stop offering it. */
  close(jobId: number | undefined): void {
    this.open.set(false);
    this.progressSvc.clear(jobId);
    this.scrollToTop();
  }

  /** Drop the saved session without touching the open/step state - used when
   * the flow finishes or its documents are discarded. */
  forget(jobId: number | undefined): void {
    this.progressSvc.clear(jobId);
  }

  /**
   * Decide synchronously (no await) whether the route or the saved progress
   * implies the wizard should already be open, so the detail view is never
   * rendered first. The editor-return path wins over a plain progress restore.
   * Returns the async follow-up owed once the job has loaded, if any.
   */
  restore(jobId: number, returningFromEditor: boolean): WizardRestore {
    if (returningFromEditor) {
      this.open.set(true);
      this.initialStep.set(DOCUMENTS_STEP);
      return 'return';
    }
    if (this.open()) return null;
    const prog = this.progressSvc.progress();
    if (!prog || prog.jobId !== jobId) return null;
    this.initialStep.set(prog.step);
    this.open.set(true);
    return prog.step === DOCUMENTS_STEP ? 'restore-docs' : null;
  }

  /** Closed, back at step 0. Used when the page moves to another job. */
  reset(): void {
    this.open.set(false);
    this.initialStep.set(0);
  }

  /** Opening the wizard, changing step, or returning to the summary should
   * always land the user at the top - the scoring view runs long, so the
   * destination would otherwise open mid-scroll. */
  scrollToTop(): void {
    // Defer to the next frame so the step's new (shorter/taller) content has
    // rendered before we scroll - otherwise the container clamps against the
    // old scrollHeight and can land mid-page.
    const view = this.document.defaultView;
    const doScroll = (): void => {
      const el =
        this.document.querySelector('.content') ??
        this.document.scrollingElement ??
        this.document.documentElement;
      el?.scrollTo?.({ top: 0, behavior: 'smooth' });
    };
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(doScroll);
    } else {
      doScroll();
    }
  }
}

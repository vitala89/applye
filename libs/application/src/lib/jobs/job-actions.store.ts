import { Injectable, computed, inject, signal } from '@angular/core';
import { JobDetailLifecycleStore } from './job-detail-lifecycle.store';
import { JobDetailStore } from './job-detail.store';
import { JobActionsService } from './job-actions.service';
import { JobDocumentsStore } from './job-documents.store';
import { JobScoringStore } from './job-scoring.store';
import { JobTailoringStore } from './job-tailoring.store';
import { TailoringDiscardService } from './tailoring-discard.service';
import { WizardNavService } from './wizard-nav.service';

/** How long the "application updated" card holds before the page reloads. */
const UPDATED_CARD_MS = 2200;

/**
 * What the user can *do* to the job open on the detail screen: save it, mark it
 * applied, delete it, open and close the wizard, abandon a tailoring, and update
 * an application that already has a status.
 *
 * The two methods that end in a navigation return a boolean instead of
 * navigating. Routing is the page's job (ADR-0005, and the reason the route
 * subscription stayed behind when the lifecycle store was cut), and it is also
 * what lets this store's spec run without a `RouterTestingModule`.
 */
@Injectable()
export class JobActionsStore {
  private readonly detail = inject(JobDetailStore);
  private readonly svc = inject(JobActionsService);
  private readonly docs = inject(JobDocumentsStore);
  private readonly tailoring = inject(JobTailoringStore);
  private readonly scoring = inject(JobScoringStore);
  private readonly lifecycle = inject(JobDetailLifecycleStore);
  private readonly nav = inject(WizardNavService);
  private readonly discardSvc = inject(TailoringDiscardService);

  /** An action is in flight. Aliased onto the service so the template binds one
   * name whichever layer sets it. */
  readonly busy = this.svc.busy;
  readonly deleteConfirmOpen = this.svc.deleteConfirmOpen;

  /** Non-null while the post-update success card is shown before the reload. */
  readonly applyResult = signal<'updated' | null>(null);

  /**
   * True with no application yet, one still in 'saved', or the user overrode the
   * lock via "Edit". Anything else (applied/interview/offer/rejected/cancelled)
   * shows the status dropdown + Edit instead of an actionable Mark-as-Applied.
   */
  readonly canMarkApplied = computed(() => {
    const status = this.detail.application()?.status;
    return !status || status === 'saved' || this.lifecycle.editingLocked();
  });

  /** Locked exactly when Mark-as-Applied isn't available. */
  readonly jobLocked = computed(() => !this.canMarkApplied());

  /**
   * Save this job: track it as a 'saved' lead (My Jobs / Job Tracker) without
   * claiming it was applied to. Distinct from Mark as Applied, which records an
   * actual application ('applied', shown on the Pipeline board).
   */
  async saveJob(): Promise<void> {
    const id = this.detail.job()?.id;
    if (!id) return;
    const app = await this.svc.save(id, this.detail.application());
    if (app) this.detail.application.set(app);
  }

  /**
   * Mark as Applied - reuses the SAME status-transition command the pipeline
   * kanban's drag-and-drop uses (`db_set_application_status`): it writes
   * `status_history` and computes `follow_up_at` deterministically from
   * `settings.followup_days_after_apply` in SQL, 0 AI tokens. No date math is
   * duplicated here.
   *
   * Returns whether the caller should send the user back to My Jobs; re-entering
   * the job then shows its Applied + Tailored state.
   */
  async markApplied(): Promise<boolean> {
    const id = this.detail.job()?.id;
    if (!id) return false;
    // The commit generates any missing CV / cover letter, refreshes a stale one
    // and writes both into the library, even after a portal application.
    const updated = await this.svc.markApplied(
      () => this.docs.ensureApplicationDraft(),
      () => this.docs.commit(this.tailoring.finalCvMd(), true),
    );
    if (!updated) return false;
    this.detail.application.set(updated);
    this.lifecycle.editingLocked.set(false);
    this.nav.forget(id);
    return true;
  }

  /** "Cancel" - drops the override and discards the in-progress description edit
   * (reverts jdText to the persisted value). Nothing was ever saved. */
  cancelEditingLocked(): void {
    this.lifecycle.editingLocked.set(false);
    this.detail.jdText.set(this.detail.job()?.jdText ?? '');
  }

  /** Opening the wizard / returning to the summary should always land the user
   * at the top of the page - the scoring view runs long, so the wizard (or the
   * restored summary) would otherwise open mid-scroll. */
  openWizard(): void {
    this.nav.requestOpen(this.detail.job()?.id);
  }

  closeWizard(): void {
    this.nav.close(this.detail.job()?.id);
  }

  /** Opens the confirm for abandoning this job's tailoring. */
  askDiscardTailoring(): void {
    this.discardSvc.ask();
  }

  /**
   * Abandon the tailoring for this job: throw away the tailored passes, the
   * draft CV and cover letter, and the saved wizard progress, then return to the
   * job summary as if the wizard had never been opened.
   *
   * Only DRAFT documents are deleted. Once a document has been committed (the
   * user exported it or marked the job applied) it belongs to the Documents
   * library, and cancelling a later re-tailor must not take it with it.
   */
  async discardTailoring(): Promise<void> {
    const discarded = await this.discardSvc.discard({
      jobId: this.detail.job()?.id ?? null,
      documents: [this.docs.cv(), this.docs.coverLetter()],
      applyApplication: (application) => this.detail.application.set(application),
    });
    // Nothing was destroyed, so nothing on the page should move. The reason is
    // already on the status line, and the confirmation is still open.
    if (!discarded) return;
    this.lifecycle.resetJobScopedState();
    this.nav.forget(this.detail.job()?.id);
    this.nav.requestScrollTop();
  }

  openDeleteConfirm(): void {
    this.svc.openDeleteConfirm();
  }

  /** Returns whether the job is gone, and therefore whether the caller should
   * leave a detail screen that no longer has a job behind it. */
  confirmDeleteJob(): Promise<boolean> {
    const id = this.detail.job()?.id;
    if (!id) return Promise.resolve(false);
    return this.svc.remove(id);
  }

  /**
   * "Update application" - the final-step action when the job already has a
   * status (applied/interview/…). Pushes the latest tailoring into the linked CV
   * and cover letter, commits the re-tailored score, shows the success card, and
   * then drops back to this job's detail with the updated score and Tailored
   * badge freshly loaded from cache.
   *
   * The hold is a timer rather than a navigation, so unlike the two methods
   * above this one needs nothing from the page.
   */
  async updateApplication(): Promise<void> {
    const id = this.detail.job()?.id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    // Regenerate a stale document, generate a missing one, and commit both, so
    // re-tailoring an already-applied job refreshes its saved documents.
    await this.docs.commit(this.tailoring.finalCvMd(), true);
    await this.scoring.savePostTailorScore();
    this.nav.forget(id);
    this.applyResult.set('updated');

    setTimeout(() => {
      void (async () => {
        this.nav.open.set(false);
        this.applyResult.set(null);
        this.busy.set(false);
        await this.lifecycle.loadJob(id);
        this.nav.requestScrollTop();
      })();
    }, UPDATED_CARD_MS);
  }
}

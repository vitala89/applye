import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { DocumentExportService } from '../documents/document-export.service';
import { ToastService } from '../shell/toast.service';
import { DocumentReviewStatusService } from './document-review-status.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { FinalChecksService } from './final-checks.service';
import { documentReviewLanguageFor, inferDocumentRegion } from './job-document-defaults';
import { JobActionsService } from './job-actions.service';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentsStore } from './job-documents.store';
import { JobFinalChecksStore } from './job-final-checks.store';
import { JobScoringService } from './job-scoring.service';
import { JobTailoringStore } from './job-tailoring.store';
import { PortalAnswersService } from './portal-answers.service';
import { WizardNavService } from './wizard-nav.service';

/**
 * What the route already told the page, in facts rather than URLs.
 *
 * The page reads `ActivatedRoute` and hands the answers over. That keeps the
 * router on the page, where `ADR-0005` puts it, and keeps this store testable
 * without a `RouterTestingModule` - three booleans and a string instead of a
 * query-param map.
 */
export interface JobRouteEntry {
  /** The wizard should reopen: the document editor sent the user back here. */
  returningFromEditor: boolean;
  /** That editor saved something on the way out. */
  documentSaved: boolean;
  /** The documents hash as it stood when the editor was opened. */
  reviewHash: string | null;
}

/**
 * Opening a job on the detail screen: what gets loaded, in what order, and what
 * is thrown away when the route points at a different job.
 *
 * The page keeps the `paramMap` subscription and `ngOnDestroy` - subscribing to
 * a route is wiring, not screen state - and calls `enterJob` with what it read.
 */
@Injectable()
export class JobDetailLifecycleStore {
  private readonly detail = inject(JobDetailStore);
  private readonly docs = inject(JobDocumentsStore);
  private readonly checks = inject(JobFinalChecksStore);
  private readonly tailoring = inject(JobTailoringStore);
  private readonly scoring = inject(JobScoringService);
  private readonly finalChecksSvc = inject(FinalChecksService);
  private readonly wizardNav = inject(WizardNavService);
  private readonly reviewStatus = inject(DocumentReviewStatusService);
  private readonly targets = inject(DocumentReviewTargetsService);
  private readonly exportSvc = inject(DocumentExportService);
  private readonly portal = inject(PortalAnswersService);
  private readonly jobActions = inject(JobActionsService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService).t;

  /**
   * The description is being edited against an applied job, so the screen is
   * unlocked on purpose. Reset on every job change: the unlock was granted for
   * the job that was open, not for the next one.
   */
  readonly editingLocked = signal(false);

  /** The job id the screen currently reflects, so a route param change to a
   * different job triggers a real reload instead of leaving stale content. */
  private loadedJobId: number | null = null;

  /**
   * Load a job when the route points at it. A switch to a different job resets
   * the per-job wizard state first so nothing bleeds across; a re-entry to the
   * same id - a query-param-only navigation, such as returning from the
   * document editor - skips the reload but still runs the return handlers.
   * Job Detail mode loads the job and its **cached** score only: no AI on open.
   */
  async enterJob(id: number, entry: JobRouteEntry): Promise<void> {
    const switching = this.loadedJobId !== id;
    if (switching && this.loadedJobId != null) this.resetJobScopedState();

    // Decide which view to show SYNCHRONOUSLY, before any await, so the
    // job-detail view never paints for a frame before the wizard replaces it -
    // the route-transition "blink". Both wizard triggers are synchronous reads;
    // only their follow-up work is async, and it is owed once the job loaded.
    const pendingPrep = this.wizardNav.restore(id, entry.returningFromEditor);

    if (switching) {
      this.loadedJobId = id;
      await this.loadJob(id);
    }

    if (pendingPrep === 'return') {
      await this.completeReturnFromEditor(entry);
    } else if (pendingPrep === 'restore-docs') {
      await this.docs.prepareStep();
    }
  }

  /**
   * Clear the transient wizard, tailoring and review state.
   *
   * Two callers, for the same reason from opposite directions: the screen is
   * moving to a different job, or the user discarded the tailoring on this one
   * and asked for the job summary back. Background runs are keyed by job in
   * their own services, so those are left alone.
   */
  resetJobScopedState(): void {
    this.wizardNav.reset();
    this.tailoring.reset();
    // `reset()` drops the shown score - cache, fromCache, stale - and stops
    // there. `postTailorSaved` is not part of it: it records that a rescore was
    // committed to My Jobs, which is true until the screen leaves the job it
    // was committed for, so it is cleared here rather than inside the service.
    this.scoring.reset();
    this.scoring.postTailorSaved.set(false);
    this.finalChecksSvc.reset();
    this.reviewStatus.reset();
    this.exportSvc.resetStatus();
    this.editingLocked.set(false);
    this.wizardNav.crossJobConfirmOpen.set(false);
    this.jobActions.deleteConfirmOpen.set(false);
  }

  /**
   * The detail store fetches the job, its application row and the document
   * library; everything here sequences the screen's own services around what it
   * loaded. The cached score used to be restored between the job read and the
   * application read - the two are independent, and doing it here keeps the
   * store free of anything it cannot import.
   */
  async loadJob(id: number): Promise<void> {
    if (!(await this.detail.loadJob(id))) return;
    const job = this.detail.job();
    if (!job) return;
    try {
      // Restores this job's score on open, falling back to a stale one when the
      // profile has changed since. See `JobScoringService.loadCached`.
      await this.scoring.loadCached(id, this.detail.profile()?.scoringHash);
      const app = this.detail.application();
      this.targets.language.set(documentReviewLanguageFor(app, job, this.detail.settings()));
      this.targets.region.set(inferDocumentRegion(job));
      await this.docs.loadLinked();

      this.portal.reset(app?.docLanguage ?? this.detail.settings()?.defaultDocLanguage ?? 'en');
      await this.portal.loadFromCache(job, this.detail.profile(), this.detail.settings());
      await this.tailoring.restoreFromCache();
    } catch (e) {
      this.toast.error(`${this.t()('jobs.load_partial_failed')} ${String(e)}`);
    }
  }

  /**
   * Async follow-up after the editor-return view has already been opened
   * synchronously by `wizardNav.restore`: token-free document prep, then the
   * saved-document freshness reconciliation. The Updated-score rescore is
   * deliberately **not** auto-run - it would spend tokens without a click.
   */
  private async completeReturnFromEditor(entry: JobRouteEntry): Promise<void> {
    await this.docs.prepareStep();

    if (!entry.documentSaved || !entry.reviewHash) return;

    const currentHash = await this.checks.documentsHash();
    if (currentHash === entry.reviewHash) {
      const restored = this.finalChecksSvc.restoreAfterReturn(entry.reviewHash);
      if (restored) this.checks.checks.set(restored);
      this.checks.outdated.set(false);
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_saved_unchanged'));
    } else {
      this.checks.invalidate();
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_saved_changed'));
    }
  }
}

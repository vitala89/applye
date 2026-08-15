import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PageTitleService } from '../../shared/page-title/page-title.service';
import { TailorScoreService, JobIntakeService } from '@applye/application';
import { WizardActivity, WizardActivityService } from '@applye/application';
import { CvGapDialogService, CvDraftService, CoverLetterDraftService } from '@applye/application';
import { LinkedDocumentsService } from '@applye/application';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { JobDetailStore } from '@applye/application';
import { jobHeaderTitle, parseArchetypes, parseLegitimacyNotes } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ScoringView } from './scoring-view.component';
import { ApplyWizard } from './apply-wizard.component';

import { JobCrossJobConfirmComponent } from './job-cross-job-confirm/job-cross-job-confirm.component';
import { JobDeleteConfirmComponent } from './job-delete-confirm/job-delete-confirm.component';
import { JobDetailActionsComponent } from './job-detail-actions/job-detail-actions.component';
import { JobDiscardConfirmComponent } from './job-discard-confirm/job-discard-confirm.component';
import { JobPhotoPromptComponent } from './job-photo-prompt/job-photo-prompt.component';
import { JobTailorCoverLetterModalComponent } from './job-tailor-cover-letter-modal/job-tailor-cover-letter-modal.component';
import { CvPhotoPromptService } from '@applye/application';
import { ToastService } from '@applye/application';
import { PortalAnswersService } from '@applye/application';
import { FinalChecksService } from '@applye/application';
import { DocumentExportService } from '@applye/application';
import { TailoringService } from '@applye/application';
import { JobScoringService, ScoreContext } from '@applye/application';
import { WizardNavService } from '@applye/application';
import { scrollOnTick } from '../../core/scroll-to-top';
import { CoverLetterTailorService } from '@applye/application';
import { DocumentReviewStatusService } from '@applye/application';
import { DocumentReviewTargetsService } from '@applye/application';
import { TailoringDiscardService } from '@applye/application';
import { JobGapFillService } from '@applye/application';
import { JobActionsService } from '@applye/application';
import {
  JobDetailLifecycleStore,
  JobDocumentDraftsStore,
  JobDocumentsStore,
  JobFinalChecksStore,
  JobRouteEntry,
  JobTailoringStore,
} from '@applye/application';
import { JobMetaCardComponent } from './job-meta-card/job-meta-card.component';
import { JobExportApplyStepComponent } from './job-export-apply-step/job-export-apply-step.component';
import { JobTailorStepComponent } from './job-tailor-step/job-tailor-step.component';
import { JobDocumentsStepComponent } from './job-documents-step/job-documents-step.component';
import { JobUpdateScoreStepComponent } from './job-update-score-step/job-update-score-step.component';
import { JOB_DETAIL_ICONS } from './job-detail-icons';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    ScoringView,
    ApplyWizard,
    JobMetaCardComponent,
    JobDocumentsStepComponent,
    JobTailorStepComponent,
    JobUpdateScoreStepComponent,
    JobExportApplyStepComponent,
    JobCrossJobConfirmComponent,
    JobDeleteConfirmComponent,
    JobDetailActionsComponent,
    JobDiscardConfirmComponent,
    JobPhotoPromptComponent,
    JobTailorCoverLetterModalComponent,
  ],
  templateUrl: './jobs.component.html',
  styleUrl: './jobs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Component-scoped: portal-answer drafts belong to the job open on this page
  // and must not outlive it, which is the lifetime they had as component fields.
  providers: [
    JobDetailStore,
    PortalAnswersService,
    FinalChecksService,
    DocumentExportService,
    TailoringService,
    CvGapDialogService,
    JobScoringService,
    WizardNavService,
    CvDraftService,
    CoverLetterDraftService,
    CoverLetterTailorService,
    DocumentReviewStatusService,
    DocumentReviewTargetsService,
    TailoringDiscardService,
    JobGapFillService,
    LinkedDocumentsService,
    JobActionsService,
    CvPhotoPromptService,
    JobIntakeService,
    // The document blocks of this screen. Same lifetime as the services above,
    // for the same reason: they describe the job open on this page.
    JobFinalChecksStore,
    JobDocumentDraftsStore,
    JobDocumentsStore,
    JobTailoringStore,
    JobDetailLifecycleStore,
  ],
})
export class JobsComponent implements OnInit, OnDestroy {
  /** Everything this screen loads. The page renders and orchestrates; the
   * reads and the one write live in `libs/application` (ADR-0005). */
  private readonly store = inject(JobDetailStore);
  /** Which documents this application is linked to, and how they are reached. */
  protected readonly docs = inject(JobDocumentsStore);
  /** Generating one of them. */
  protected readonly drafts = inject(JobDocumentDraftsStore);
  /** The review step's token-free checks over both. */
  protected readonly checks = inject(JobFinalChecksStore);
  /** The three-pass tailoring pipeline for the job now open. */
  protected readonly tailorStore = inject(JobTailoringStore);
  /** What opening a job loads, and what leaving one throws away. */
  protected readonly lifecycle = inject(JobDetailLifecycleStore);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(PageTitleService);
  private readonly wizardNav = inject(WizardNavService);
  private readonly reviewStatus = inject(DocumentReviewStatusService);
  /** The market and language the wizard's documents are written for; the
   * review step's two selects write through it. */
  private readonly targets = inject(DocumentReviewTargetsService);
  private readonly discardSvc = inject(TailoringDiscardService);
  protected readonly jobActions = inject(JobActionsService);
  private readonly intake = inject(JobIntakeService);
  private readonly tailorScore = inject(TailorScoreService);
  private readonly activity = inject(WizardActivityService);
  /** Draft-portal-answers state and AI calls. */
  protected readonly portal = inject(PortalAnswersService);
  /** The wizard's token-free final-checks step. */
  private readonly finalChecksSvc = inject(FinalChecksService);
  /** Writing the linked documents to disk. */
  private readonly exportSvc = inject(DocumentExportService);
  /** The three-pass tailoring pipeline. */
  private readonly tailorSvc = inject(TailoringService);
  /** The single CV-gap dialog shared by both document flows. */
  private readonly gapSvc = inject(CvGapDialogService);
  /** Baseline scoring, the post-tailor rescore, and the ATS check. */
  private readonly scoreSvc = inject(JobScoringService);

  // Previous running activity for this job, so the effect below can detect the
  // moment a background step finished and pull its fresh result into a page
  // that was reopened while the step was still running.
  private prevActivity: WizardActivity | null = null;
  private readonly activityCompletionEffect = effect(() => {
    const jobId = this.job()?.id ?? -1;
    const current = this.activity.runningActivityFor(jobId);
    const prev = this.prevActivity;
    this.prevActivity = current;
    if (!prev || current) return;
    // A background tailor/score step for this job just finished while we are
    // mounted - pull its fresh result into the page.
    untracked(() => {
      if (prev === 'tailoring' && this.tailorResults().length < 3) {
        void this.tailorStore.restoreFromCache();
      }
    });
  });

  // When a background document generation finishes for the job on screen, pull
  // the freshly-linked CV/cover letter in so the page shows "Review" instead of
  // "Create", even if the run completed while the page was closed.
  private prevDocPreparing = false;
  private readonly docCompletionEffect = effect(() => {
    const preparing = this.drafts.anyPreparing();
    const prev = this.prevDocPreparing;
    this.prevDocPreparing = preparing;
    if (prev && !preparing) {
      untracked(() => void this.docs.loadLinked());
    }
  });
  private readonly document = inject(DOCUMENT);
  /** The store counts scroll requests; performing them is the page's job. */
  private readonly wizardScrollEffect = scrollOnTick(this.wizardNav.scrollTick, this.document);
  protected readonly t = this.i18n.t;

  protected readonly icons = JOB_DETAIL_ICONS;

  /** Aliases onto `JobDetailStore`. The template binds these names, several
   * methods write through them, and `unsavedJobGuard` reads `job` and
   * `application` off this instance - so they stay the store's own signals
   * rather than views of them. */
  readonly jdText = this.store.jdText;
  readonly job = this.store.job;
  readonly profile = this.store.profile;
  readonly settings = this.store.settings;
  // Scoring. Aliases onto `JobScoringService`; the template binds these names
  // and several component methods reset them directly, so they stay the same
  // writable signals rather than views of them.
  readonly cache = this.scoreSvc.cache;
  readonly fromCache = this.scoreSvc.fromCache;
  readonly scoreStale = this.scoreSvc.stale;
  /** Aliases onto `WizardNavService`'s writable signals; the template binds
   * these names and writes through them. */
  readonly wizardOpen = this.wizardNav.open;
  readonly wizardInitialStep = this.wizardNav.initialStep;
  readonly archetypeMatch = this.intake.archetypeMatch;

  // Job Detail: the application row (if this job is on the board) + action state.
  readonly application = this.store.application;
  readonly actionBusy = this.jobActions.busy;
  readonly deleteConfirmOpen = this.jobActions.deleteConfirmOpen;

  /** Editing override for the scoring view only. The job-detail UI no longer
   * exposes a re-edit affordance once a job leaves Saved (the application is
   * out the door, so the pasted description is frozen); this stays because the
   * scoring view still drives it via `overrideEditing` / `cancelEdit`. */
  readonly editingLocked = this.lifecycle.editingLocked;

  /** Confirm dialog when opening the wizard here would abandon an unfinished
   * tailoring session for a different job. */
  readonly crossJobConfirmOpen = this.wizardNav.crossJobConfirmOpen;

  /** True with no application yet, one still in 'saved', or the user
   * overrode the lock via "Edit". Anything else (applied/interview/
   * offer/rejected/cancelled) shows the status dropdown + Edit instead of an
   * actionable Mark-as-Applied button. */
  readonly canMarkApplied = computed(() => {
    const status = this.application()?.status;
    return !status || status === 'saved' || this.editingLocked();
  });

  /** Locked exactly when Mark-as-Applied isn't available. */
  readonly jobLocked = computed(() => !this.canMarkApplied());

  // Tailoring wizard. Aliases onto `TailoringService`; the template binds these
  // names and several component methods reset them directly, so they stay the
  // same signals rather than views of them.
  readonly tailorResults = this.tailorSvc.results;
  /** Set by the Cancel button to stop the tailoring pass loop early. */
  readonly tailorCancelled = this.tailorSvc.cancelled;
  readonly tailorError = this.tailorSvc.error;
  // Derived from WizardActivityService so the running state survives leaving
  // the page and a reopened page reflects an in-flight tailor run.
  readonly tailoring = computed(() => this.activity.isRunning(this.job()?.id ?? -1, 'tailoring'));

  // Post-tailor rescore (before/after). The before/after pair is transient
  // (in-memory), but the *after* score is persisted to My Jobs once the user
  // reaches the export step - see savePostTailorScore.
  // Post-tailor rescore state lives in TailorScoreService (a root singleton)
  // so an in-flight run survives leaving this page; these are read-only views
  // of it, scoped to the job currently shown.
  readonly postTailorScore = computed(() => this.tailorScore.resultFor(this.job()?.id ?? -1));
  readonly updatingScore = computed(() => this.tailorScore.isRunningFor(this.job()?.id ?? -1));
  private readonly postTailorSaved = this.scoreSvc.postTailorSaved;
  /** Non-null while the post-apply/update success card is shown before the
   * redirect fires. */
  readonly applyResult = signal<'updated' | null>(null);

  /** True once all 3 tailoring passes are done (in this session or restored
   * from cache) - drives the immutable Tailored badge and the Retailor CTA. */
  readonly isTailored = this.tailorSvc.isTailored;

  // Cover Letter tailoring (Phase 1c). The library list stays here because the
  // choose-existing dropdown reads the same rows; the modal's own state lives
  // in `CoverLetterTailorService` and is aliased in below.
  readonly coverLetters = this.store.coverLetters;
  readonly matchingCvs = this.store.matchingCvs;
  readonly selectedBaseCvId = this.store.selectedBaseCvId;

  /** German-market photo prompt: its own decision, its own service. */
  protected readonly photoPrompt = inject(CvPhotoPromptService);
  readonly profilePhoto = computed(() => this.profile()?.photoDataUri ?? null);

  async acceptPhotoPrompt(): Promise<void> {
    const doc = await this.photoPrompt.accept(this.profilePhoto(), this.docs.cv());
    if (doc) {
      this.docs.cv.set(doc);
      this.checks.markOutdated();
    }
    const status = this.photoPrompt.status();
    if (status) this.reviewStatus.status.set(status);
  }

  protected finalTailoredCvMd(): string {
    return this.tailorResults().find((r) => r.pass === 3)?.resultMd ?? '';
  }

  /**
   * Retailoring from the review step. It stays on the page rather than in a
   * store because it drives three blocks at once - the tailoring, the
   * post-tailor score, and the documents - and moving it would drag the
   * tailoring block along before its own turn. `JobDocumentsStore`'s header
   * records the same boundary from the other side.
   */
  async retailorFromFinalChecks(): Promise<void> {
    if (this.tailoring()) return;
    this.reviewStatus.clear();
    this.wizardInitialStep.set(1);
    await this.startTailoring();
    if (this.tailorError()) return;
    if (!this.postTailorScore() && !this.updatingScore()) {
      await this.updateScoreAfterTailor();
    }
    if (this.docs.cv()) {
      await this.drafts.createCv(this.finalTailoredCvMd());
    }
    this.checks.invalidate();
    this.wizardInitialStep.set(2);
  }

  readonly parsing = this.intake.parsing;
  readonly scoring = this.scoreSvc.running;

  readonly parseStatus = this.intake.status;
  readonly parseError = this.intake.error;
  readonly scoreStatus = this.scoreSvc.status;
  readonly scoreError = this.scoreSvc.error;

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Derived from the job rather than pushed at each site that changes it.
    // Pushed, it was set once on load and every other path had to remember:
    // a re-parse did not, and naming a job by hand did not, so the header kept
    // saying "Company not identified" over a job the user had just named.
    effect(() => {
      const j = this.job();
      this.pageTitle.set(j ? jobHeaderTitle(j.company, j.title, this.t()) : '');
    });
  }

  async ngOnInit(): Promise<void> {
    await this.store.loadContext();

    // React to /jobs/:id param changes. Angular reuses this component when only
    // the id changes (e.g. the floating resume button jumping between jobs), so
    // a snapshot read in ngOnInit would leave the previous job on screen.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const idParam = pm.get('id');
      if (idParam) void this.lifecycle.enterJob(+idParam, this.routeEntry());
    });
  }

  /**
   * What the route is telling the screen, as facts rather than a query-param
   * map. Reading `ActivatedRoute` is the page's job; deciding what to load from
   * it is the store's.
   */
  private routeEntry(): JobRouteEntry {
    const params = this.route.snapshot.queryParamMap;
    return {
      returningFromEditor:
        params.get('returnTo') === 'applyWizard' || params.get('wizardStep') === 'documents',
      documentSaved: params.get('documentSaved') === '1',
      reviewHash: params.get('reviewHash'),
    };
  }

  ngOnDestroy(): void {
    this.pageTitle.clear();
    // Leaving while the gap dialog is open would otherwise hang the CV-draft
    // promise forever (its resolver only fires from the dialog buttons), so
    // resolve it as skipped - generation then continues in the background and
    // its `reviewing` activity ends cleanly instead of sticking on the badge.
    this.gapSvc.dispose();
  }

  addPortalQuestion(): void {
    this.portal.addQuestion();
  }

  updatePortalQuestion(index: number, value: string): void {
    this.portal.updateQuestion(index, value);
  }

  removePortalQuestion(index: number): void {
    this.portal.removeQuestion(index);
  }

  editPortalAnswer(index: number, value: string): void {
    this.portal.editAnswer(index, value);
  }

  copyPortalAnswer(index: number): Promise<void> {
    return this.portal.copyAnswer(index);
  }

  /** One AI call for the whole question set, cached by (job, profile, questions+language+model). */
  draftPortalAnswers(): Promise<void> {
    return this.portal.draft(this.job(), this.profile(), this.settings());
  }

  /** Re-drafts a single answer. Always a fresh AI call, still cached. */
  redraftPortalAnswer(index: number): Promise<void> {
    return this.portal.redraft(index, this.job(), this.profile(), this.settings());
  }

  /** Save this job: track it as a 'saved' lead (My Jobs / Job Tracker) without
   * claiming it was applied to. Distinct from Mark as Applied, which records an
   * actual application ('applied', shown on the Pipeline board). */
  async saveJob(): Promise<void> {
    const j = this.job();
    if (!j?.id) return;
    const app = await this.jobActions.save(j.id, this.application());
    if (app) this.application.set(app);
  }

  /**
   * Mark as Applied - reuses the SAME status-transition command the pipeline
   * kanban's drag-and-drop uses (`db_set_application_status`): it writes
   * `status_history` and computes `follow_up_at` deterministically from
   * `settings.followup_days_after_apply` in SQL, 0 AI tokens. No date math
   * is duplicated here.
   */
  async markApplied(): Promise<void> {
    const j = this.job();
    if (!j?.id) return;
    // The commit generates any missing CV / cover letter, refreshes a stale one
    // and writes both into the library, even after a portal application.
    const updated = await this.jobActions.markApplied(
      () => this.docs.ensureApplicationDraft(),
      () => this.docs.commit(this.finalTailoredCvMd(), true),
    );
    if (!updated) return;
    this.application.set(updated);
    this.editingLocked.set(false);
    this.wizardNav.forget(j.id);
    // Applied - send the user back to My Jobs; re-entering the job shows its
    // Applied + Tailored state.
    await this.router.navigate(['/jobs']);
  }

  /** "Cancel" - drops the override and discards the in-progress description
   * edit (reverts jdText to the persisted value). Nothing was ever saved. */
  cancelEditingLocked(): void {
    this.editingLocked.set(false);
    this.jdText.set(this.job()?.jdText ?? '');
  }

  /** Opening the wizard / returning to the summary should always land the
   * user at the top of the page - the scoring view runs long, so the wizard
   * (or the restored summary) would otherwise open mid-scroll. */
  openWizard(): void {
    this.wizardNav.requestOpen(this.job()?.id);
  }

  /** Opens the confirm for abandoning this job's tailoring. */
  askDiscardTailoring(): void {
    this.discardSvc.ask();
  }

  /**
   * Abandon the tailoring for this job: throw away the tailored passes, the
   * draft CV and cover letter, and the saved wizard progress, then return to
   * the job summary as if the wizard had never been opened.
   *
   * Only DRAFT documents are deleted. Once a document has been committed (the
   * user exported it or marked the job applied) it belongs to the Documents
   * library, and cancelling a later re-tailor must not take it with it.
   */
  async discardTailoring(): Promise<void> {
    const discarded = await this.discardSvc.discard({
      jobId: this.job()?.id ?? null,
      documents: [this.docs.cv(), this.docs.coverLetter()],
      applyApplication: (application) => this.application.set(application),
    });
    // Nothing was destroyed, so nothing on the page should move. The reason is
    // already on the status line, and the confirmation is still open.
    if (!discarded) return;
    this.lifecycle.resetJobScopedState();
    this.wizardNav.forget(this.job()?.id);
    this.wizardNav.requestScrollTop();
  }

  closeWizard(): void {
    this.wizardNav.close(this.job()?.id);
  }

  openDeleteConfirm(): void {
    this.jobActions.openDeleteConfirm();
  }

  async confirmDeleteJob(): Promise<void> {
    const j = this.job();
    if (!j?.id) return;
    if (await this.jobActions.remove(j.id)) await this.router.navigate(['/jobs']);
  }

  async parseAndFilter(): Promise<void> {
    // Preserve a company/title already known for this job (e.g. from Discover
    // or a prior parse) so re-parsing a header-less JD does not lose it and
    // wrongly report "No company name found".
    const previous = this.job();
    const p = this.profile();
    this.job.set(null);
    this.cache.set(null);
    this.scoreStale.set(false);
    // Re-parsing means the JD (and therefore the score) changed - any earlier
    // tailoring for this job is now stale. Drop it so the Tailored badge and
    // Retailor state clear and the user re-tailors against the updated JD.
    this.editingLocked.set(false);
    this.resetWizard();
    const result = await this.intake.parse({
      jdText: this.jdText(),
      previous,
      scoringHash: p?.scoringHash ?? undefined,
      targetArchetypes: p?.targetArchetypes ?? undefined,
    });
    if (!result) return;
    this.job.set(result.job);
    if (result.cached) {
      this.cache.set(result.cached);
      this.fromCache.set(true);
      this.scoreStale.set(false);
      this.scoreStatus.set('Loaded from cache - 0 tokens used.');
    }
  }

  scoreJob(forceRefresh = false): Promise<void> {
    return this.scoreSvc.score(this.scoreContext(''), forceRefresh);
  }

  /** Post-tailor rescore - user-initiated and token-spending. See
   * `JobScoringService.rescoreAfterTailor`. */
  updateScoreAfterTailor(): Promise<void> {
    const pass3 = this.tailorResults().find((r) => r.pass === 3);
    return this.scoreSvc.rescoreAfterTailor(this.scoreContext(pass3?.resultMd ?? ''));
  }

  /** Everything a scoring run reads, snapshotted at call time. */
  private scoreContext(tailoredResumeMd: string): ScoreContext {
    return {
      job: this.job(),
      profile: this.profile(),
      settings: this.settings(),
      jdText: this.jdText(),
      legitimacyNotes: this.legitimacyNotes(),
      tailoredResumeMd,
      reviewRegion: this.targets.region(),
    };
  }

  /** Commits the post-tailor score to My Jobs. See
   * `JobScoringService.savePostTailor`. */
  private savePostTailorScore(): Promise<void> {
    return this.scoreSvc.savePostTailor(this.job()?.id);
  }

  /**
   * "Update application" - final-step action when the job already has a
   * status (applied/interview/…). Commits the re-tailored score, shows the
   * success card, then returns the user to this job's detail where the
   * updated score and Tailored badge are now in place.
   */
  async updateApplication(): Promise<void> {
    const j = this.job();
    if (!j?.id || this.actionBusy()) return;
    this.actionBusy.set(true);
    // Update application: push the latest tailoring into the linked CV / cover
    // letter (regenerate a stale one, generate a missing one) and commit them,
    // so re-tailoring an already-applied job refreshes its saved documents.
    await this.docs.commit(this.finalTailoredCvMd(), true);
    await this.savePostTailorScore();
    this.wizardNav.forget(j.id);
    this.applyResult.set('updated');
    // Success card holds briefly, then drop back to this job's detail with the
    // updated score + Tailored badge freshly loaded from cache.
    const view = this.document.defaultView;
    const jobId = j.id;
    view?.setTimeout(() => {
      void (async () => {
        this.wizardOpen.set(false);
        this.applyResult.set(null);
        this.actionBusy.set(false);
        await this.lifecycle.loadJob(jobId);
        this.wizardNav.requestScrollTop();
      })();
    }, 2200);
  }

  legitimacyNotes(): string[] {
    return parseLegitimacyNotes(this.job()?.legitimacyNotes);
  }

  hasArchetypes(): boolean {
    return parseArchetypes(this.profile()?.targetArchetypes).length > 0;
  }

  // ── Tailoring wizard ────────────────────────────────────────────────────────

  /** Runs the full 3-pass tailoring pipeline back-to-back on one click - the
   * phase cards animate through running/done as each pass lands, no manual
   * Continue between passes. Stops on the first failing pass. */
  async startTailoring(): Promise<void> {
    // State a tailoring run invalidates but does not own: the export status
    // line, the post-tailor rescore, and the final checks.
    this.exportSvc.status.set('');
    this.exportSvc.lastExport.set(null);
    this.tailorScore.clear(this.job()?.id);
    this.postTailorSaved.set(false);
    this.finalChecksSvc.reset();

    await this.tailorStore.run();
  }

  /**
   * Cancel an in-flight tailoring run. The AI pass already in flight cannot be
   * aborted mid-request, so it finishes, but the loop stops before the next
   * pass and every partial result is discarded - the wizard returns to the
   * pre-tailor state so the user can adjust the source and try again.
   */
  cancelTailoring(): void {
    this.tailorStore.cancel();
  }

  /** Wizard step index: 0 review · 1 tailor · 2 updated score · 3 documents · 4 export.
   * Entering the Updated score step auto-runs the rescore once (only if the
   * user actually tailored - pass 3 exists - and it hasn't run yet). */
  onWizardStep(step: number): void {
    this.wizardNav.goTo(this.job()?.id, step);

    const UPDATED_SCORE_STEP = 2;
    const DOCUMENTS_STEP = 3;
    const EXPORT_STEP = 4;
    if (
      step === UPDATED_SCORE_STEP &&
      this.tailorResults().length === 3 &&
      !this.postTailorScore() &&
      !this.updatingScore()
    ) {
      void this.updateScoreAfterTailor();
    }
    if (step === DOCUMENTS_STEP) {
      void this.docs.prepareStep();
    }
    // Continuing past the Updated score step commits the new score to My Jobs.
    if (step === EXPORT_STEP) {
      void this.savePostTailorScore();
    }
  }

  resetWizard(): void {
    this.tailorSvc.reset();
    this.exportSvc.status.set('');
    this.exportSvc.error.set(false);
    this.tailorScore.clear(this.job()?.id);
    this.postTailorSaved.set(false);
  }

  /**
   * "Start over" on the Export step: discard the tailoring/score/export state
   * and return to step 1 (Tailor) so the user can tailor again from scratch.
   * Previously this only cleared off-screen signals and left the user on the
   * export step, so nothing visible happened.
   */
  startOver(): void {
    this.resetWizard();
    this.wizardNav.goTo(this.job()?.id, 1);
  }
}

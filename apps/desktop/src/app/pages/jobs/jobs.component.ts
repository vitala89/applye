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
import { DocumentGenService, ReviewDocumentKind } from '@applye/application';
import { CvGapDialogService, CvDraftService, CoverLetterDraftService } from '@applye/application';
import { GapFillHooks, LinkedDocumentsService } from '@applye/application';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  JobDetailStore,
  documentReviewLanguageFor,
  inferDocumentRegion,
} from '@applye/application';
import {
  Application,
  Job,
  jobHeaderTitle,
  parseArchetypes,
  parseLegitimacyNotes,
  type CvGapAnswer,
} from '@applye/core';
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
import { FinalCheckInputs, FinalChecksService } from '@applye/application';
import { DocumentExportService } from '@applye/application';
import { TailorContext, TailoringService } from '@applye/application';
import { JobScoringService, ScoreContext } from '@applye/application';
import { WizardNavService, WizardRestore } from '@applye/application';
import { scrollOnTick } from '../../core/scroll-to-top';
import { CoverLetterTailorService } from '@applye/application';
import { DocumentReviewStatusService } from '@applye/application';
import { DocumentReviewTargetsService } from '@applye/application';
import { TailoringDiscardService } from '@applye/application';
import { JobGapFillService, jobDocLabel } from '@applye/application';
import {
  coverLetterStaleInput,
  cvStaleInput,
  decideCoverLetterAction,
  decideCvAction,
} from '@applye/application';
import { JobActionsService } from '@applye/application';
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
  ],
})
export class JobsComponent implements OnInit, OnDestroy {
  /** Everything this screen loads. The page renders and orchestrates; the
   * reads and the one write live in `libs/application` (ADR-0005). */
  private readonly store = inject(JobDetailStore);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(PageTitleService);
  private readonly wizardNav = inject(WizardNavService);
  private readonly cvDraftSvc = inject(CvDraftService);
  private readonly coverLetterSvc = inject(CoverLetterDraftService);
  private readonly coverLetterTailor = inject(CoverLetterTailorService);
  private readonly reviewStatus = inject(DocumentReviewStatusService);
  /** The market and language the wizard's documents are written for; the
   * review step's two selects write through it. */
  private readonly targets = inject(DocumentReviewTargetsService);
  private readonly discardSvc = inject(TailoringDiscardService);
  private readonly gapFill = inject(JobGapFillService);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  protected readonly jobActions = inject(JobActionsService);
  private readonly intake = inject(JobIntakeService);
  private readonly tailorScore = inject(TailorScoreService);
  private readonly activity = inject(WizardActivityService);
  private readonly docGen = inject(DocumentGenService);
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
        void this.restoreTailoringFromCache();
      }
    });
  });

  // When a background document generation finishes for the job on screen, pull
  // the freshly-linked CV/cover letter in so the page shows "Review" instead of
  // "Create", even if the run completed while the page was closed.
  private prevDocPreparing = false;
  private readonly docCompletionEffect = effect(() => {
    const jobId = this.job()?.id ?? -1;
    const preparing = this.docGen.anyPreparing(jobId);
    const prev = this.prevDocPreparing;
    this.prevDocPreparing = preparing;
    if (prev && !preparing) {
      untracked(() => void this.loadLinkedDocuments());
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
  readonly editingLocked = signal(false);

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
    const doc = await this.photoPrompt.accept(this.profilePhoto(), this.linkedCv());
    if (doc) {
      this.linkedCv.set(doc);
      this.finalChecksOutdated.set(!!this.finalChecks());
    }
    const status = this.photoPrompt.status();
    if (status) this.reviewStatus.status.set(status);
  }

  /** Aliases onto `LinkedDocumentsService`'s writable signals. */
  readonly linkedCv = this.linkedDocs.cv;
  readonly linkedCoverLetter = this.linkedDocs.coverLetter;
  // Which document drafts are generating - read from DocumentGenService (a root
  // singleton) so an in-flight run survives leaving this page and CV + cover
  // letter can generate independently.
  readonly preparingCv = computed(() => this.docGen.isPreparing(this.job()?.id ?? -1, 'cv'));
  readonly preparingCoverLetter = computed(() =>
    this.docGen.isPreparing(this.job()?.id ?? -1, 'cover_letter'),
  );
  readonly anyDocPreparing = computed(() => this.docGen.anyPreparing(this.job()?.id ?? -1));
  /** Aliases onto `FinalChecksService`. The template writes `finalChecksOutdated`
   * directly, so these stay the same writable signals rather than views of them. */
  readonly finalChecks = this.finalChecksSvc.checks;
  readonly finalChecksOutdated = this.finalChecksSvc.outdated;
  async openCv(id: number, returnToWizard = false): Promise<void> {
    if (!returnToWizard) {
      await this.openDocumentEditorWithReturnToJob('cv', id);
      return;
    }
    await this.openDocumentEditorWithReturn('cv', id);
  }

  async openCoverLetter(id: number, returnToWizard = false): Promise<void> {
    if (!returnToWizard) {
      await this.openDocumentEditorWithReturnToJob('cover_letter', id);
      return;
    }
    await this.openDocumentEditorWithReturn('cover_letter', id);
  }

  /** Opens a linked doc from the My Jobs detail's badges - its back arrow
   * returns here (this job), not the Documents list. */
  private async openDocumentEditorWithReturnToJob(
    kind: ReviewDocumentKind,
    id: number,
  ): Promise<void> {
    const job = this.job();
    if (!job?.id) return;
    const path = kind === 'cv' ? ['/documents/cv', id] : ['/documents/cover-letter', id];
    await this.router.navigate(path, {
      queryParams: { returnTo: 'myJobs', jobId: job.id, jobLabel: job.company || job.title || '' },
    });
  }

  private async openDocumentEditorWithReturn(kind: ReviewDocumentKind, id: number): Promise<void> {
    const job = this.job();
    if (!job?.id) return;
    const reviewHash = await this.currentDocumentsHash();
    this.finalChecksSvc.storeForReturn(reviewHash);
    const path = kind === 'cv' ? ['/documents/cv', id] : ['/documents/cover-letter', id];
    await this.router.navigate(path, {
      queryParams: {
        returnTo: 'applyWizard',
        jobId: job.id,
        documentType: kind,
        documentId: id,
        reviewHash,
        // Open the editor showing the rendered result first (Review = look at
        // it), not the raw section editor.
        preview: '1',
      },
    });
  }

  /** The store answers with null rather than a translated throw, because the
   * message is presentation and the store has no `TranslateService`. */
  async ensureApplicationDraft(): Promise<Application> {
    const app = await this.store.ensureApplication(this.targets.language());
    if (!app) throw new Error(this.t()('jobs.not_found_label'));
    return app;
  }

  private async loadLinkedDocuments(): Promise<void> {
    await this.linkedDocs.load(this.application());
    await this.refreshFinalChecksFreshness();
  }

  /** True when the linked CV was generated from a different tailoring than the
   * one now in hand, so committing the application should refresh it first. */
  private cvDocStale(tailoredMd: string): Promise<boolean> {
    const input = cvStaleInput(
      this.job(),
      tailoredMd,
      this.targets.language(),
      this.targets.region(),
    );
    return input ? this.linkedDocs.isStale('cv', input) : Promise.resolve(false);
  }

  /** True when the linked cover letter was built from a different profile / JD
   * than the current one. */
  private coverLetterDocStale(): Promise<boolean> {
    const input = coverLetterStaleInput(
      this.job(),
      this.profile(),
      this.targets.language(),
      this.targets.region(),
    );
    return input ? this.linkedDocs.isStale('cover_letter', input) : Promise.resolve(false);
  }

  /**
   * Ensures the application's CV + cover letter exist and (when
   * `regenerateStale`) match the latest tailoring, then commits both into the
   * library. Generation reuses the Review-documents path (createCvDraft /
   * createCoverLetterDraft), so it is fail-soft - those set an error status
   * instead of throwing, and the CV path is skipped when there is no tailored
   * source to build from. This is the "Create / Update application" action:
   * nothing is written to the Documents library until it runs.
   */
  private async commitApplicationDocuments(regenerateStale: boolean): Promise<void> {
    const tailoredMd = this.finalTailoredCvMd();

    const cv = await decideCvAction({
      linked: !!this.linkedCv(),
      tailoredMd,
      regenerateStale,
      isStale: () => this.cvDocStale(tailoredMd),
    });
    if (cv !== 'keep') await this.createCvDraft();
    await this.linkedDocs.commit('cv');

    const coverLetter = await decideCoverLetterAction({
      linked: !!this.linkedCoverLetter(),
      regenerateStale,
      isStale: () => this.coverLetterDocStale(),
    });
    if (coverLetter !== 'keep') await this.createCoverLetterDraft();
    await this.linkedDocs.commit('cover_letter');
  }

  async prepareDocumentsStep(): Promise<void> {
    await this.reviewStatus.run(async () => {
      await this.store.refreshLibrary();
      await this.ensureApplicationDraft();
      await this.loadLinkedDocuments();
      // Do not auto-create the CV on entering this step. The document is
      // written only when the user explicitly clicks Create/Regenerate,
      // so nothing is generated (or spends tokens) behind their back.
    });
  }

  protected finalTailoredCvMd(): string {
    return this.tailorResults().find((r) => r.pass === 3)?.resultMd ?? '';
  }

  /** The gap-fill callbacks both document flows hand to their draft service. */
  private gapFillHooks(job: Job): GapFillHooks {
    return this.gapFill.hooks({
      job,
      settings: this.settings(),
      language: this.targets.language(),
      profile: this.profile(),
      applyProfile: (profile) => this.profile.set(profile),
    });
  }

  onGapSubmit(result: { answers: CvGapAnswer[]; saveToProfile: boolean }): void {
    this.gapSvc.submit(result);
  }

  onGapCancel(): void {
    this.gapSvc.cancel();
  }

  async createCvDraft(): Promise<void> {
    if (this.preparingCv()) return;
    const job = this.job();
    const settings = this.settings();
    const tailoredMd = this.finalTailoredCvMd();
    if (!job?.id || !tailoredMd || !settings) {
      this.reviewStatus.refuse(this.t()('jobs.wizard.document_cv_requires_tailoring'));
      return;
    }

    await this.reviewStatus.run(async () => {
      const result = await this.cvDraftSvc.create({
        job,
        settings,
        tailoredMd,
        language: this.targets.language(),
        region: this.targets.region(),
        label: jobDocLabel(job, 'Tailored CV'),
        ensureApplication: () => this.ensureApplicationDraft(),
        ...this.gapFillHooks(job),
      });
      if (!result) return;
      this.application.set(result.application);
      this.linkedCv.set(result.document);
      this.finalChecksOutdated.set(!!this.finalChecks());
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_cv_linked'));
    });
  }

  async createCoverLetterDraft(): Promise<void> {
    if (this.preparingCoverLetter()) return;
    const job = this.job();
    const profile = this.profile();
    const settings = this.settings();
    if (!job?.id || !profile?.fullMd || !settings) {
      this.reviewStatus.refuse(this.t()('documents.cv_generate_no_profile'));
      return;
    }

    await this.reviewStatus.run(async () => {
      const result = await this.coverLetterSvc.create({
        job,
        profile,
        settings,
        language: this.targets.language(),
        region: this.targets.region(),
        label: jobDocLabel(job, 'Cover Letter'),
        // `preparingCv()` is part of this condition, not an extra guard: a CV
        // still generating has not linked itself yet, so testing only
        // `linkedCv()` let a cover letter started alongside it run a second
        // analysis and raise a second dialog for the same questions.
        skipGapFill: !!this.linkedCv() || this.preparingCv(),
        ensureApplication: () => this.ensureApplicationDraft(),
        ...this.gapFillHooks(job),
      });
      if (!result) return;
      this.application.set(result.application);
      this.linkedCoverLetter.set(result.document);
      this.finalChecksOutdated.set(!!this.finalChecks());
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_cover_letter_linked'));
    });
  }

  async chooseExistingDocument(kind: ReviewDocumentKind, id: number | null): Promise<void> {
    if (!id) return;
    await this.reviewStatus.run(async () => {
      const app = await this.ensureApplicationDraft();
      const result = await this.linkedDocs.link(kind, id, app, this.targets.language());
      if (!result) return;
      this.application.set(result.application);
      this.reviewStatus.closeChooser(kind);
      this.finalChecksOutdated.set(!!this.finalChecks());
    });
  }

  runFinalChecks(): Promise<void> {
    return this.finalChecksSvc.run(this.finalCheckInputs());
  }

  async retailorFromFinalChecks(): Promise<void> {
    if (this.tailoring()) return;
    this.reviewStatus.clear();
    this.wizardInitialStep.set(1);
    await this.startTailoring();
    if (this.tailorError()) return;
    if (!this.postTailorScore() && !this.updatingScore()) {
      await this.updateScoreAfterTailor();
    }
    if (this.linkedCv()) {
      await this.createCvDraft();
    }
    this.finalChecks.set(null);
    this.finalChecksOutdated.set(true);
    this.wizardInitialStep.set(2);
  }

  /** The linked documents and review settings the final checks run against. */
  private finalCheckInputs(): FinalCheckInputs {
    return {
      cv: this.linkedCv(),
      coverLetter: this.linkedCoverLetter(),
      jdText: this.jdText(),
      language: this.targets.language(),
      region: this.targets.region(),
    };
  }

  private currentDocumentsHash(): Promise<string> {
    return this.finalChecksSvc.documentsHash(this.finalCheckInputs());
  }

  private refreshFinalChecksFreshness(): Promise<void> {
    return this.finalChecksSvc.refreshFreshness(this.finalCheckInputs());
  }

  async openTailorCoverLetterModal(): Promise<void> {
    const letters = await this.coverLetterTailor.prepare(this.settings());
    // Null means the list could not be read - non-fatal, keep what we had.
    if (letters) this.coverLetters.set(letters);
  }

  async startTailoringCoverLetter(): Promise<void> {
    const result = await this.coverLetterTailor.run({
      job: this.job(),
      profile: this.profile(),
      settings: this.settings(),
      letters: this.coverLetters(),
      application: this.application(),
      label: (job) => jobDocLabel(job, 'Tailored Cover Letter'),
    });
    if (!result) return;
    if (result.application) this.application.set(result.application);
    void this.router.navigate(['/documents/cover-letter', result.document.id]);
  }

  readonly parsing = this.intake.parsing;
  readonly scoring = this.scoreSvc.running;

  readonly parseStatus = this.intake.status;
  readonly parseError = this.intake.error;
  readonly scoreStatus = this.scoreSvc.status;
  readonly scoreError = this.scoreSvc.error;

  private readonly destroyRef = inject(DestroyRef);
  /** The job id the page currently reflects, so a route param change to a
   * different job triggers a real reload instead of leaving stale content. */
  private loadedJobId: number | null = null;

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
      if (idParam) void this.enterJob(+idParam);
    });
  }

  /**
   * Load a job when the route points at it. A switch to a different job resets
   * the per-job wizard state first so nothing bleeds across; a re-entry to the
   * same id (a query-param-only navigation, e.g. returning from the document
   * editor) skips the reload but still runs the return/restore handlers.
   * Job Detail mode loads the job and its CACHED score only - no AI on open.
   */
  private async enterJob(id: number): Promise<void> {
    const switching = this.loadedJobId !== id;
    if (switching && this.loadedJobId != null) this.resetJobScopedState();

    // Decide which view to show SYNCHRONOUSLY, before any await, so the
    // job-detail view never paints for a frame before the wizard/tailor view
    // replaces it (the route-transition "blink"). Both wizard triggers are
    // synchronous reads (the editor-return query params and the persisted
    // wizard progress); only their follow-up work is async and is owed once
    // the job has loaded.
    const pendingPrep = this.decideWizardView(id);

    if (switching) {
      this.loadedJobId = id;
      await this.loadJob(id);
    }

    if (pendingPrep === 'return') {
      await this.completeWizardReturnFromDocumentEditor();
    } else if (pendingPrep === 'restore-docs') {
      await this.prepareDocumentsStep();
    }
  }

  /**
   * Open the apply wizard at the correct step when the route implies it, doing
   * so synchronously (no await) so the detail view is never rendered first.
   * The editor-return path wins over a plain progress restore. Returns the
   * async follow-up owed once the job has loaded, if any.
   */
  private decideWizardView(id: number): WizardRestore {
    const params = this.route.snapshot.queryParamMap;
    const returningFromEditor =
      params.get('returnTo') === 'applyWizard' || params.get('wizardStep') === 'documents';
    return this.wizardNav.restore(id, returningFromEditor);
  }

  /** Clear transient wizard/tailor/review state when moving to another job.
   * Background runs are keyed by job in their services, so leave those. */
  private resetJobScopedState(): void {
    this.wizardNav.reset();
    this.tailorSvc.reset();
    this.tailorCancelled.set(false);
    this.postTailorSaved.set(false);
    this.finalChecksSvc.reset();
    this.reviewStatus.reset();
    this.exportSvc.resetStatus();
    this.editingLocked.set(false);
    this.crossJobConfirmOpen.set(false);
    this.deleteConfirmOpen.set(false);
    this.cache.set(null);
    this.fromCache.set(false);
    this.scoreStale.set(false);
  }

  ngOnDestroy(): void {
    this.pageTitle.clear();
    // Leaving while the gap dialog is open would otherwise hang the CV-draft
    // promise forever (its resolver only fires from the dialog buttons), so
    // resolve it as skipped - generation then continues in the background and
    // its `reviewing` activity ends cleanly instead of sticking on the badge.
    this.gapSvc.dispose();
  }

  /** Restore this job's score on open, falling back to a stale one when the
   * profile has changed since. See `JobScoringService.loadCached`. */
  private loadCachedScore(id: number): Promise<void> {
    return this.scoreSvc.loadCached(id, this.profile()?.scoringHash);
  }

  /**
   * The store fetches the job, its application row and the document library;
   * everything below sequences the page's own services around what it loaded.
   * The cached score used to be restored between the job read and the
   * application read - the two are independent, and doing it here keeps the
   * store free of anything it cannot import.
   */
  private async loadJob(id: number): Promise<void> {
    if (!(await this.store.loadJob(id))) return;
    const job = this.job();
    if (!job) return;
    try {
      await this.loadCachedScore(id);
      const app = this.application();
      this.targets.language.set(documentReviewLanguageFor(app, job, this.settings()));
      this.targets.region.set(inferDocumentRegion(job));
      await this.loadLinkedDocuments();

      this.portal.reset(app?.docLanguage ?? this.settings()?.defaultDocLanguage ?? 'en');
      await this.portal.loadFromCache(job, this.profile(), this.settings());
      await this.restoreTailoringFromCache();
    } catch (e) {
      this.toast.error(`Some of this job could not be loaded - you can re-score. ${String(e)}`);
    }
  }

  /**
   * Async follow-up after the editor-return view has already been opened
   * synchronously by `decideWizardView`: token-free document prep, then the
   * saved-document score-freshness reconciliation. The Updated-score rescore is
   * deliberately NOT auto-run (it would spend tokens without a click).
   */
  private async completeWizardReturnFromDocumentEditor(): Promise<void> {
    await this.prepareDocumentsStep();

    const params = this.route.snapshot.queryParamMap;
    if (params.get('documentSaved') !== '1') return;

    const previousHash = params.get('reviewHash');
    if (!previousHash) return;

    const currentHash = await this.currentDocumentsHash();
    if (currentHash === previousHash) {
      const restoredChecks = this.finalChecksSvc.restoreAfterReturn(previousHash);
      if (restoredChecks) this.finalChecks.set(restoredChecks);
      this.finalChecksOutdated.set(false);
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_saved_unchanged'));
    } else {
      this.finalChecks.set(null);
      this.finalChecksOutdated.set(true);
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_saved_changed'));
    }
  }

  /** Re-hydrate `tailorResults` from `tailoring_cache` so returning to a
   * previously-tailored job shows its Tailored state (badge + Retailor)
   * without re-running any AI. Replays the exact per-pass input hashes
   * `runTailorPass` uses; stops at the first pass with no cached row. */
  private restoreTailoringFromCache(): Promise<void> {
    return this.tailorSvc.restoreFromCache(this.tailorContext());
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
      () => this.ensureApplicationDraft(),
      () => this.commitApplicationDocuments(true),
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
      documents: [this.linkedCv(), this.linkedCoverLetter()],
      applyApplication: (application) => this.application.set(application),
    });
    // Nothing was destroyed, so nothing on the page should move. The reason is
    // already on the status line, and the confirmation is still open.
    if (!discarded) return;
    this.resetJobScopedState();
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
    await this.commitApplicationDocuments(true);
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
        await this.loadJob(jobId);
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

    await this.tailorSvc.run(this.tailorContext());
  }

  /**
   * Cancel an in-flight tailoring run. The AI pass already in flight cannot be
   * aborted mid-request, so it finishes, but the loop stops before the next
   * pass and every partial result is discarded - the wizard returns to the
   * pre-tailor state so the user can adjust the source and try again.
   */
  cancelTailoring(): void {
    this.tailorSvc.cancel(this.job()?.id);
  }

  /** Everything the tailoring passes read, gathered at call time. */
  private tailorContext(): TailorContext {
    return {
      job: this.job(),
      profile: this.profile(),
      settings: this.settings(),
      jdText: this.jdText(),
      scoring: this.cache(),
      baseCvId: this.selectedBaseCvId(),
      matchingCvs: this.matchingCvs(),
    };
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
      void this.prepareDocumentsStep();
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

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
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
import { jobHeaderTitle } from '@applye/core';
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
import { JobScoringService } from '@applye/application';
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
  JobActionsStore,
  JobRouteEntry,
  JobScoringStore,
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
  // Component-scoped: every one of these describes the job open on this page and
  // must not outlive it, which is the lifetime they had as component fields.
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
    JobActionsStore,
    JobDocumentsStore,
    JobScoringStore,
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
  /** The three-pass tailoring pipeline for the job now open, and the wizard's
   * step machine. */
  protected readonly tailorStore = inject(JobTailoringStore);
  /** Scoring the job now open, baseline and post-tailor. */
  protected readonly scoreStore = inject(JobScoringStore);
  /** What the user can do to the job now open. The two actions that end in a
   * navigation return a boolean and leave the routing here. */
  protected readonly actions = inject(JobActionsStore);
  /** What opening a job loads, and what leaving one throws away. */
  protected readonly lifecycle = inject(JobDetailLifecycleStore);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(PageTitleService);
  private readonly wizardNav = inject(WizardNavService);
  private readonly reviewStatus = inject(DocumentReviewStatusService);
  private readonly intake = inject(JobIntakeService);
  private readonly tailorScore = inject(TailorScoreService);
  private readonly activity = inject(WizardActivityService);
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

  /** Confirm dialog when opening the wizard here would abandon an unfinished
   * tailoring session for a different job. */
  readonly crossJobConfirmOpen = this.wizardNav.crossJobConfirmOpen;

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
    await this.tailorStore.start();
    if (this.tailorError()) return;
    if (!this.postTailorScore() && !this.updatingScore()) {
      await this.scoreStore.updateScoreAfterTailor();
    }
    if (this.docs.cv()) {
      await this.drafts.createCv(this.tailorStore.finalCvMd());
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

  /** Create Application, then leave for My Jobs - the store does the work and
   * says whether the job is done with this screen; routing stays here
   * (ADR-0005). Apply itself is a separate, unrouted action - see
   * `JobActionsStore.applyNow`, bound directly from the template. */
  async createApplication(): Promise<void> {
    if (await this.actions.createApplication()) await this.router.navigate(['/jobs']);
  }

  /** Same shape: the store deletes, the page leaves a screen with no job. */
  async confirmDeleteJob(): Promise<void> {
    if (await this.actions.confirmDeleteJob()) await this.router.navigate(['/jobs']);
  }

  ngOnDestroy(): void {
    this.pageTitle.clear();
    // Leaving while the gap dialog is open would otherwise hang the CV-draft
    // promise forever (its resolver only fires from the dialog buttons), so
    // resolve it as skipped - generation then continues in the background and
    // its `reviewing` activity ends cleanly instead of sticking on the badge.
    this.gapSvc.dispose();
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
    // The one call that spans both stores, which is why it stays here: the
    // scoring block re-parses, the tailoring block is thrown away. Neither
    // store injects the other (`JobTailoringStore`'s header records this).
    this.tailorStore.resetWizard();
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
}

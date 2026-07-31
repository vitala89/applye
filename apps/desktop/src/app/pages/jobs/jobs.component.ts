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
import { WizardProgressService } from '../../shared/wizard-progress.service';
import { TailorScoreService } from '../../shared/tailor-score.service';
import { WizardActivity, WizardActivityService } from '../../shared/wizard-activity.service';
import { DocumentGenService, ReviewDocumentKind } from '../../shared/document-gen.service';
import { FormsModule } from '@angular/forms';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  ExternalLink,
  FileDown,
  FileText,
  Flag,
  GitCompare,
  Hammer,
  Languages,
  ListChecks,
  LucideAngularModule,
  Minus,
  Pencil,
  PencilLine,
  Plus,
  RotateCw,
  ScanLine,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  CircleX,
  Star,
  Tag,
  Trash2,
  WandSparkles,
  Bookmark,
  X,
} from 'lucide-angular';
import { AiService, DbService, JobsStore } from '@applye/data';
import {
  Application,
  Job,
  Profile,
  Settings,
  SupportedLanguage,
  LANGUAGE_NATIVE_NAMES,
  CoverLetterAddress,
  CoverLetterContent,
  COVER_LETTER_TONE_DEFAULT,
  COVER_LETTER_LENGTH_DEFAULT,
  CvContent,
  DocumentLibraryItem,
  parseArchetypes,
  archetypeNames,
  sanitizeSignature,
  parseProfileMd,
  compareCompensation,
  extractSalaryFromJd,
  CompensationVerdict,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { SkeletonCard } from '@applye/ui';
import { JobDetailIcons, applicationStatusBadgeClass, classifyChangeType } from './scoring.utils';
import { ScoringView } from './scoring-view.component';
import { ApplyWizard } from './apply-wizard.component';
import { UpdatedScoreView } from './updated-score-view.component';
import {
  buildCvContent,
  buildAdditionalInfoBlock,
  cleanJsonText,
  parseCvSkillResponse,
  parseDateAnswer,
  withCvPhoto,
  type CvGapAnswer,
  type CvGapQuestion,
} from '../documents/cv-content.util';
import { CvGapDialog } from './cv-gap-dialog.component';
import { ToastService } from '../../core/toast/toast.service';
import { PortalAnswersService } from '../../shared/portal-answers.service';
import {
  DocumentRegionTag,
  FinalCheckInputs,
  FinalChecksService,
} from '../../shared/final-checks.service';
import { DocumentExportService, ExportFormat } from '../../shared/document-export.service';
import { TailorContext, TailoringService } from '../../shared/tailoring.service';
import { CvGapDialogService } from '../../shared/cv-gap-dialog.service';
import { JobScoringService, ScoreContext } from '../../shared/job-scoring.service';
import { documentCardStatus, documentStatusKey } from '../../shared/doc-card-status';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    ScoringView,
    ApplyWizard,
    UpdatedScoreView,
    SkeletonCard,
    CvGapDialog,
  ],
  templateUrl: './jobs.component.html',
  styleUrl: './jobs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Component-scoped: portal-answer drafts belong to the job open on this page
  // and must not outlive it, which is the lifetime they had as component fields.
  providers: [
    PortalAnswersService,
    FinalChecksService,
    DocumentExportService,
    TailoringService,
    CvGapDialogService,
    JobScoringService,
  ],
})
export class JobsComponent implements OnInit, OnDestroy {
  private readonly db = inject(DbService);
  private readonly jobsStore = inject(JobsStore);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(PageTitleService);
  private readonly wizardProgress = inject(WizardProgressService);
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
  protected readonly t = this.i18n.t;

  protected readonly icons: JobDetailIcons & {
    empty: typeof Search;
    copy: typeof Copy;
    add: typeof Plus;
    remove: typeof X;
    another: typeof RotateCw;
    trash: typeof Trash2;
    dangerGlyph: typeof CircleX;
  } = {
    empty: Search,
    atsPass: Check,
    atsFail: X,
    tag: Tag,
    flag: Flag,
    scan: ScanLine,
    checklist: ListChecks,
    next: ArrowRight,
    star: Star,
    db: Database,
    bookmark: Bookmark,
    wand: WandSparkles,
    back: ArrowLeft,
    checkCircle: CheckCircle2,
    languages: Languages,
    chevronDown: ChevronDown,
    chevronUp: ChevronUp,
    shieldCheck: ShieldCheck,
    sparkles: Sparkles,
    gitCompare: GitCompare,
    alertTriangle: AlertTriangle,
    minus: Minus,
    plus: Plus,
    pencil: Pencil,
    hammer: Hammer,
    scanSearch: ScanSearch,
    pencilLine: PencilLine,
    fileText: FileText,
    fileDown: FileDown,
    externalLink: ExternalLink,
    copy: Copy,
    check: Check,
    add: Plus,
    remove: X,
    another: RotateCw,
    trash: Trash2,
    dangerGlyph: CircleX,
  };

  /** Supported document languages. Named for the portal-answers language select
   * it was introduced for; the template now also uses it for the CV/cover-letter
   * language dropdowns. */
  protected readonly portalLanguages: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

  readonly jdText = signal('');
  readonly job = signal<Job | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly settings = signal<Settings | null>(null);
  // Scoring. Aliases onto `JobScoringService`; the template binds these names
  // and several component methods reset them directly, so they stay the same
  // writable signals rather than views of them.
  readonly cache = this.scoreSvc.cache;
  readonly fromCache = this.scoreSvc.fromCache;
  readonly scoreStale = this.scoreSvc.stale;
  readonly wizardOpen = signal(false);
  readonly wizardInitialStep = signal(0);
  readonly archetypeMatch = signal<boolean | null>(null);

  // Job Detail: the application row (if this job is on the board) + action state.
  readonly application = signal<Application | null>(null);
  readonly actionBusy = signal(false);
  readonly actionMsg = signal('');
  readonly deleteConfirmOpen = signal(false);
  /** Confirm gate for abandoning this job's tailoring, and its in-flight flag. */
  readonly discardConfirmOpen = signal(false);
  readonly discarding = signal(false);
  readonly deleting = signal(false);

  /** Editing override for the scoring view only. The job-detail UI no longer
   * exposes a re-edit affordance once a job leaves Saved (the application is
   * out the door, so the pasted description is frozen); this stays because the
   * scoring view still drives it via `overrideEditing` / `cancelEdit`. */
  readonly editingLocked = signal(false);

  /** Confirm dialog when opening the wizard here would abandon an unfinished
   * tailoring session for a different job. */
  readonly crossJobConfirmOpen = signal(false);

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

  protected readonly statusBadgeClass = applicationStatusBadgeClass;

  // Tailoring wizard. Aliases onto `TailoringService`; the template binds these
  // names and several component methods reset them directly, so they stay the
  // same signals rather than views of them.
  readonly tailorResults = this.tailorSvc.results;
  /** Set by the Cancel button to stop the tailoring pass loop early. */
  readonly tailorCancelled = this.tailorSvc.cancelled;
  readonly tailorStatus = this.tailorSvc.status;
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
  readonly updateScoreStatus = computed(() => this.tailorScore.statusFor(this.job()?.id ?? -1));
  readonly updateScoreError = computed(() => this.tailorScore.isErrorFor(this.job()?.id ?? -1));
  private readonly postTailorSaved = this.scoreSvc.postTailorSaved;
  readonly atsReport = this.scoreSvc.atsReport;
  /** Non-null while the post-apply/update success card is shown before the
   * redirect fires. */
  readonly applyResult = signal<'updated' | null>(null);

  /** True once all 3 tailoring passes are done (in this session or restored
   * from cache) - drives the immutable Tailored badge and the Retailor CTA. */
  readonly isTailored = this.tailorSvc.isTailored;

  /** Flattened change / gap notes across all completed tailoring passes. */
  readonly allChanges = this.tailorSvc.allChanges;
  readonly allGaps = this.tailorSvc.allGaps;
  readonly changesOpen = signal(true);
  protected readonly changeType = classifyChangeType;

  // Cover Letter tailoring (Phase 1c)
  readonly coverLetters = signal<DocumentLibraryItem[]>([]);
  readonly matchingCvs = signal<DocumentLibraryItem[]>([]);
  readonly selectedBaseCvId = signal<number | null>(null);
  readonly selectedCoverLetterId = signal<number | null>(null);
  readonly tailorCoverLetterLanguage = signal<SupportedLanguage>('en');
  readonly tailorCoverLetterOpen = signal(false);
  readonly tailoringCoverLetter = signal(false);
  readonly tailorCoverLetterError = signal('');

  readonly documentRegionTags: DocumentRegionTag[] = ['de', 'us', 'uk', 'generic'];
  readonly documentReviewRegion = signal<DocumentRegionTag>('generic');

  /** Country name for a CV region tag ("Germany", not "DE") - the picker names
   * the market the CV is written for, and a bare code does not read as one. */
  regionLabel(region: DocumentRegionTag): string {
    return this.t()(`documents.cv_region_${region}`);
  }
  /** Endonym for a document language ("Deutsch", not "DE"), matching Settings. */
  nativeLang(language: SupportedLanguage): string {
    return LANGUAGE_NATIVE_NAMES[language];
  }

  // ---- German-market photo prompt ----
  // A photo is conventional on a German CV and unusual (sometimes actively
  // discouraged) elsewhere, so switching the CV's market to Germany is the one
  // moment where asking is useful rather than nagging. Asked once per visit to
  // a job, and never for the other markets.
  readonly photoPromptOpen = signal(false);
  readonly photoPromptBusy = signal(false);
  private photoPrompted = false;
  readonly profilePhoto = computed(() => this.profile()?.photoDataUri ?? null);

  /** Region picker handler: keep the final checks honest, then decide whether
   * the German photo convention is worth raising. */
  onRegionChange(region: DocumentRegionTag): void {
    this.documentReviewRegion.set(region);
    this.finalChecksOutdated.set(!!this.finalChecks());
    if (region === 'de' && !this.photoPrompted) {
      this.photoPrompted = true;
      this.photoPromptOpen.set(true);
    }
  }

  dismissPhotoPrompt(): void {
    this.photoPromptOpen.set(false);
  }

  /**
   * "Yes, add my photo". With a photo already on the profile this writes it
   * into the linked CV; without one it sends the user to the profile's Photo
   * section, so the photo is cropped once and reused rather than re-uploaded
   * per application.
   */
  async acceptPhotoPrompt(): Promise<void> {
    const photo = this.profilePhoto();
    if (!photo) {
      this.photoPromptOpen.set(false);
      void this.router.navigate(['/profile']);
      return;
    }
    const cv = this.linkedCv();
    if (!cv?.id) {
      // No CV generated yet - the photo is on the profile and the region is
      // set, so the CV picks it up when it is created. Nothing to patch.
      this.photoPromptOpen.set(false);
      return;
    }
    this.photoPromptBusy.set(true);
    try {
      const content = withCvPhoto(
        JSON.parse(cv.contentJson ?? '{"sections":[]}') as CvContent,
        photo,
      );
      const doc = await this.db.documentLibraryUpsert({
        ...cv,
        id: cv.id,
        contentJson: JSON.stringify(content),
      });
      this.linkedCv.set(doc);
      this.finalChecksOutdated.set(!!this.finalChecks());
      this.documentReviewStatus.set(this.t()('jobs.wizard.photo_added'));
      this.photoPromptOpen.set(false);
    } catch (e) {
      this.documentReviewStatus.set(String(e));
    } finally {
      this.photoPromptBusy.set(false);
    }
  }
  readonly documentReviewLanguage = signal<SupportedLanguage>('en');
  readonly linkedCv = signal<DocumentLibraryItem | null>(null);
  readonly linkedCoverLetter = signal<DocumentLibraryItem | null>(null);
  // Which document drafts are generating - read from DocumentGenService (a root
  // singleton) so an in-flight run survives leaving this page and CV + cover
  // letter can generate independently.
  readonly preparingCv = computed(() => this.docGen.isPreparing(this.job()?.id ?? -1, 'cv'));
  readonly preparingCoverLetter = computed(() =>
    this.docGen.isPreparing(this.job()?.id ?? -1, 'cover_letter'),
  );
  readonly anyDocPreparing = computed(() => this.docGen.anyPreparing(this.job()?.id ?? -1));
  // Aliases onto `CvGapDialogService`; the template binds these names.
  readonly gapAnalyzing = this.gapSvc.analyzing;
  readonly gapDialogOpen = this.gapSvc.open;
  readonly gapQuestions = this.gapSvc.questions;
  readonly documentReviewStatus = signal('');
  readonly documentReviewError = signal(false);
  readonly chooseCvOpen = signal(false);
  readonly chooseCoverLetterOpen = signal(false);
  /** Aliases onto `FinalChecksService`. The template writes `finalChecksOutdated`
   * directly, so these stay the same writable signals rather than views of them. */
  readonly finalChecks = this.finalChecksSvc.checks;
  readonly finalChecksOutdated = this.finalChecksSvc.outdated;
  private readonly finalCheckState = computed(() => ({
    hasCheckedInput: !!this.finalChecks()?.inputHash,
    outdated: this.finalChecksOutdated(),
  }));

  readonly cvReviewStatus = computed(() =>
    documentCardStatus({
      ...this.finalCheckState(),
      preparing: this.preparingCv(),
      awaitingInput: this.gapSvc.open(),
      linked: !!this.linkedCv(),
    }),
  );
  readonly coverLetterReviewStatus = computed(() =>
    documentCardStatus({
      ...this.finalCheckState(),
      preparing: this.preparingCoverLetter(),
      awaitingInput: false,
      linked: !!this.linkedCoverLetter(),
    }),
  );

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

  private inferDocumentRegion(job: Job | null): DocumentRegionTag {
    return job?.language === 'de' ? 'de' : 'generic';
  }

  private normalizeSupportedLanguage(value: string | null | undefined): SupportedLanguage {
    return this.portalLanguages.includes(value as SupportedLanguage)
      ? (value as SupportedLanguage)
      : 'en';
  }

  readonly documentStatusKey = documentStatusKey;

  readonly finalCheckStatusKey = this.finalChecksSvc.statusKey.bind(this.finalChecksSvc);

  async ensureApplicationDraft(): Promise<Application> {
    const existing = this.application();
    if (existing) return existing;

    const job = this.job();
    if (!job?.id) throw new Error(this.t()('jobs.not_found_label'));

    const created = await this.db.upsertApplication({
      jobId: job.id,
      status: 'saved',
      docLanguage: this.documentReviewLanguage(),
      sourceUrl: job.source,
    });
    this.application.set(created);
    this.jobsStore.patchOverviewRow(job.id, { status: 'saved' });
    return created;
  }

  private async loadLinkedDocuments(): Promise<void> {
    const app = this.application();
    const [cv, letter] = await Promise.all([
      app?.cvDocumentId ? this.db.documentLibraryGet(app.cvDocumentId) : Promise.resolve(null),
      app?.coverLetterDocumentId
        ? this.db.documentLibraryGet(app.coverLetterDocumentId)
        : Promise.resolve(null),
    ]);
    this.linkedCv.set(cv);
    this.linkedCoverLetter.set(letter);
    await this.refreshFinalChecksFreshness();
  }

  /** Commits the linked doc of `kind` (if it is still a draft): clears the
   * apply-wizard draft flag so it graduates into the Documents library, and
   * mirrors the change into the local signal. Best-effort - a failed commit
   * never breaks export / apply; the doc stays a draft for the next attempt. */
  private async commitLinkedDocument(kind: ReviewDocumentKind): Promise<void> {
    const item = kind === 'cv' ? this.linkedCv() : this.linkedCoverLetter();
    if (!item || !item.isApplicationDraft) return;
    try {
      const committed = await this.db.documentLibraryCommit(item.id);
      if (!committed) return;
      if (kind === 'cv') this.linkedCv.set(committed);
      else this.linkedCoverLetter.set(committed);
    } catch {
      // swallow: keep the draft, retry on the next export / mark-applied
    }
  }

  /** True when the linked CV was generated from a different tailoring than the
   * one now in hand, so committing the application should refresh it first.
   * Uses the exact input-hash formula createCvDraft persists. */
  private async cvDocStale(tailoredMd: string): Promise<boolean> {
    const doc = this.linkedCv();
    const job = this.job();
    if (!doc || !job?.id) return false;
    const hash = await this.db.hashText(
      [job.id, tailoredMd, this.documentReviewLanguage(), this.documentReviewRegion()].join('\x00'),
    );
    return hash !== doc.inputHash;
  }

  /** True when the linked cover letter was built from a different profile / JD
   * than the current one. Mirrors createCoverLetterDraft's input hash. */
  private async coverLetterDocStale(): Promise<boolean> {
    const doc = this.linkedCoverLetter();
    const job = this.job();
    const profile = this.profile();
    if (!doc || !job?.id || !profile?.fullMd) return false;
    const hash = await this.db.hashText(
      [
        job.id,
        profile.fullMd,
        job.jdText ?? '',
        this.documentReviewLanguage(),
        this.documentReviewRegion(),
      ].join('\x00'),
    );
    return hash !== doc.inputHash;
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

    if (!this.linkedCv()) {
      if (tailoredMd) await this.createCvDraft();
    } else if (regenerateStale && tailoredMd && (await this.cvDocStale(tailoredMd))) {
      await this.createCvDraft();
    }
    await this.commitLinkedDocument('cv');

    if (!this.linkedCoverLetter()) {
      await this.createCoverLetterDraft();
    } else if (regenerateStale && (await this.coverLetterDocStale())) {
      await this.createCoverLetterDraft();
    }
    await this.commitLinkedDocument('cover_letter');
  }

  async prepareDocumentsStep(): Promise<void> {
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const [cvs, letters] = await Promise.all([
        this.db.documentLibraryList('cv'),
        this.db.documentLibraryList('cover_letter'),
      ]);
      this.matchingCvs.set(cvs);
      this.coverLetters.set(letters);
      await this.ensureApplicationDraft();
      await this.loadLinkedDocuments();
      // Do not auto-create the CV on entering this step. The document is
      // written only when the user explicitly clicks Create/Regenerate,
      // so nothing is generated (or spends tokens) behind their back.
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
      this.toast.error(String(e));
    }
  }

  protected finalTailoredCvMd(): string {
    return this.tailorResults().find((r) => r.pass === 3)?.resultMd ?? '';
  }

  /** Library-document label for a generated artifact, naming the company and
   * role it was tailored for so the Documents list is unambiguous, e.g.
   * "Acme - Senior Frontend Engineer - Tailored CV". */
  private jobDocLabel(job: Job, suffix: string): string {
    const base = [job.company, job.title].filter(Boolean).join(' - ') || 'Job';
    return `${base} - ${suffix}`;
  }

  /** Runs the gap-analysis skill for the current job/CV. Fail-open: returns []
   * on any error so a bad analysis never blocks generation. */
  private analyzeCvGaps(cvText: string): Promise<CvGapQuestion[]> {
    return this.gapSvc.analyze(cvText, this.job(), this.settings(), this.documentReviewLanguage());
  }

  /** Opens the gap dialog and resolves when the user submits or cancels. */
  private awaitGapDialog(
    questions: CvGapQuestion[],
  ): Promise<{ answers: CvGapAnswer[]; saveToProfile: boolean } | null> {
    return this.gapSvc.ask(questions);
  }

  onGapSubmit(result: { answers: CvGapAnswer[]; saveToProfile: boolean }): void {
    this.gapSvc.submit(result);
  }

  onGapCancel(): void {
    this.gapSvc.cancel();
  }

  /** Appends the answered gap items to the profile fullMd. Whole-row-replace
   * safe: carries every other profile field forward (the #97 lesson). */
  private async appendToProfile(block: string): Promise<void> {
    const p = this.profile();
    if (!p || !block) return;
    const updated = await this.db.upsertProfile({
      fullMd: `${p.fullMd}\n\n${block}`,
      scoringJson: p.scoringJson,
      scoringHash: p.scoringHash,
      pitchMd: p.pitchMd,
      pitchHash: p.pitchHash,
      targetArchetypes: p.targetArchetypes,
    });
    this.profile.set(updated);
  }

  async createCvDraft(): Promise<void> {
    if (this.preparingCv()) return;
    const job = this.job();
    const settings = this.settings();
    const tailoredMd = this.finalTailoredCvMd();
    if (!job?.id || !tailoredMd || !settings) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_cv_requires_tailoring'));
      return;
    }

    this.docGen.begin(job.id, 'cv');
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const app = await this.ensureApplicationDraft();
      const language = this.documentReviewLanguage();

      // Agentic gap-fill: ask about info the job wants that the CV lacks, then
      // fold the answers into the text we structure. Fail-open and skippable.
      this.gapAnalyzing.set(true);
      let additionalInfo = '';
      try {
        const questions = await this.analyzeCvGaps(tailoredMd);
        this.gapAnalyzing.set(false);
        if (questions.length) {
          const result = await this.awaitGapDialog(questions);
          if (result) {
            additionalInfo = buildAdditionalInfoBlock(result.answers);
            if (result.saveToProfile && additionalInfo) {
              try {
                await this.appendToProfile(additionalInfo);
              } catch {
                // Saving to the profile is a best-effort extra: the answers are
                // already folded into cvSourceText below, so a failed profile
                // write must not abort the CV generation that follows.
              }
            }
          }
        }
      } finally {
        this.gapAnalyzing.set(false);
      }
      const cvSourceText = additionalInfo ? `${tailoredMd}\n\n${additionalInfo}` : tailoredMd;

      const inputHash = await this.db.hashText(
        [job.id, tailoredMd, language, this.documentReviewRegion()].join('\x00'),
      );
      // Structure the tailored markdown into real CV sections through the
      // same `cv-import` AI path used by Documents import and onboarding,
      // instead of dumping the whole blob into the summary section.
      const rendered = await this.ai.renderSkill('cv-import', {
        cv_text: cvSourceText,
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });
      const parsed = parseCvSkillResponse(res.text);

      // Block-before-generate: when the structured CV has experience or
      // education entries the AI could not date, ask the user rather than
      // shipping a CV that renders "Present" with no start date. Reuses the gap
      // dialog. Skippable (Skip per entry / Cancel), and never fabricates a
      // date. Question ids are `expdate:<i>` / `edudate:<i>` so answers route
      // back to the right list.
      const undatedExp = parsed.experience
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => !e.startDate?.trim());
      const undatedEdu = parsed.education
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => !e.startDate?.trim());
      if (undatedExp.length || undatedEdu.length) {
        const questions: CvGapQuestion[] = [
          ...undatedExp.map(({ e, i }) => ({
            id: `expdate:${i}`,
            category: 'experience' as const,
            question: this.t()('jobs.gap.date_question')
              .replace('{company}', e.company || '')
              .replace('{role}', e.role || ''),
            hint: this.t()('jobs.gap.date_hint'),
          })),
          ...undatedEdu.map(({ e, i }) => ({
            id: `edudate:${i}`,
            category: 'other' as const,
            question: this.t()('jobs.gap.edu_date_question')
              .replace('{degree}', e.degree || '')
              .replace('{institution}', e.institution || ''),
            hint: this.t()('jobs.gap.edu_date_hint'),
          })),
        ];
        const result = await this.awaitGapDialog(questions);
        if (result) {
          for (const ans of result.answers) {
            const [kind, idxStr] = ans.id.split(':');
            const idx = Number(idxStr);
            if (!ans.answer.trim()) continue;
            const entry = kind === 'edudate' ? parsed.education[idx] : parsed.experience[idx];
            if (!entry) continue;
            const { startDate, endDate } = parseDateAnswer(ans.answer);
            if (startDate) entry.startDate = startDate;
            if (endDate) entry.endDate = endDate;
          }
          if (result.saveToProfile) {
            const block = buildAdditionalInfoBlock(result.answers);
            if (block) {
              try {
                await this.appendToProfile(block);
              } catch {
                // Best-effort: the dates are already folded into `parsed`
                // above, so a failed profile write must not abort generation.
              }
            }
          }
        }
      }

      const content = buildCvContent(parsed, null);
      const doc = await this.db.documentLibraryUpsert({
        // One CV per application (ADR-0003): reuse the already-linked
        // document whenever there is one, so a first tailor and every
        // later retailor/regenerate update the same row instead of
        // creating duplicate "<Company> - Tailored CV" entries. Only a
        // job with no linked CV yet mints a new row.
        id: app.cvDocumentId ?? undefined,
        docType: 'cv',
        source: 'generated',
        label: this.jobDocLabel(job, 'Tailored CV'),
        language,
        regionTag: this.documentReviewRegion(),
        contentJson: JSON.stringify(content),
        inputHash,
        // Draft until Export & Apply: hidden from the Documents library list
        // until the user commits it (export / mark applied). Review, inline
        // edit and export all still reach it by id.
        isApplicationDraft: true,
      });
      const updated = await this.db.upsertApplication({
        ...app,
        cvDocumentId: doc.id,
        docLanguage: this.documentReviewLanguage(),
      });
      this.application.set(updated);
      this.linkedCv.set(doc);
      this.finalChecksOutdated.set(!!this.finalChecks());
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_cv_linked'));
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
      this.toast.error(String(e));
    } finally {
      if (job.id) this.docGen.end(job.id, 'cv');
    }
  }

  async createCoverLetterDraft(): Promise<void> {
    if (this.preparingCoverLetter()) return;
    const job = this.job();
    const profile = this.profile();
    const settings = this.settings();
    if (!job?.id || !profile?.fullMd || !settings) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(this.t()('documents.cv_generate_no_profile'));
      return;
    }

    this.docGen.begin(job.id, 'cover_letter');
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const app = await this.ensureApplicationDraft();
      const language = this.documentReviewLanguage();

      // Agentic gap-fill (mirrors createCvDraft): ask about info the JD wants
      // that the profile lacks, then fold the answers into the profile text the
      // letter is built from. Fail-open and skippable; never blocks generation.
      //
      // Skipped when a CV is linked for this job, because that flow ran the same
      // analysis and may already have saved the answers to the profile - no
      // point asking twice. `preparingCv()` is part of that condition, not an
      // extra guard: a CV that is still generating has not linked itself yet, so
      // testing only `linkedCv()` let a cover letter started alongside it run a
      // second analysis and raise a second dialog for the same questions.
      let additionalInfo = '';
      if (!this.linkedCv() && !this.preparingCv()) {
        this.gapAnalyzing.set(true);
        try {
          const questions = await this.analyzeCvGaps(profile.fullMd);
          this.gapAnalyzing.set(false);
          if (questions.length) {
            const result = await this.awaitGapDialog(questions);
            if (result) {
              additionalInfo = buildAdditionalInfoBlock(result.answers);
              if (result.saveToProfile && additionalInfo) {
                try {
                  await this.appendToProfile(additionalInfo);
                } catch {
                  // Best-effort: answers are already folded into profileText
                  // below, so a failed profile write must not abort generation.
                }
              }
            }
          }
        } finally {
          this.gapAnalyzing.set(false);
        }
      }
      const profileText = additionalInfo
        ? `${profile.fullMd}\n\n${additionalInfo}`
        : profile.fullMd;

      const rendered = await this.ai.renderSkill('cover-letter-generate', {
        profile_md: profileText,
        job_description: job.jdText ?? '',
        language,
        section: 'all',
        tone: COVER_LETTER_TONE_DEFAULT,
        length: COVER_LETTER_LENGTH_DEFAULT,
        // A first letter has no answers yet; the editor's Availability card is
        // where they get filled in, and an empty value must stay silent rather
        // than become "salary negotiable".
        earliest_start: '',
        salary_expectation: '',
        notice_period: '',
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      const parsed = JSON.parse(cleanJsonText(res.text)) as CoverLetterContent;
      const content: CoverLetterContent = {
        ...parsed,
        bodyParagraphs: parsed.bodyParagraphs ?? [],
        jobDescription: job.jdText ?? '',
        tone: parsed.tone ?? COVER_LETTER_TONE_DEFAULT,
        length: parsed.length ?? COVER_LETTER_LENGTH_DEFAULT,
      };
      const inputHash = await this.db.hashText(
        [job.id, profile.fullMd, job.jdText ?? '', language, this.documentReviewRegion()].join(
          '\x00',
        ),
      );
      const doc = await this.db.documentLibraryUpsert({
        // One cover letter per application (ADR-0003): reuse the linked
        // row so retailor/regenerate update in place instead of stacking
        // duplicate "<Company> - Cover Letter" entries.
        id: app.coverLetterDocumentId ?? undefined,
        docType: 'cover_letter',
        source: 'generated',
        label: this.jobDocLabel(job, 'Cover Letter'),
        language,
        regionTag: this.documentReviewRegion(),
        contentJson: JSON.stringify(content),
        inputHash,
        modelUsed: settings.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
        // Draft until Export & Apply (see createCvDraft).
        isApplicationDraft: true,
      });
      const updated = await this.db.upsertApplication({
        ...app,
        coverLetterDocumentId: doc.id,
        docLanguage: language,
      });
      this.application.set(updated);
      this.linkedCoverLetter.set(doc);
      this.finalChecksOutdated.set(!!this.finalChecks());
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_cover_letter_linked'));
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
      this.toast.error(String(e));
    } finally {
      if (job.id) this.docGen.end(job.id, 'cover_letter');
    }
  }

  async chooseExistingDocument(kind: ReviewDocumentKind, id: number | null): Promise<void> {
    if (!id) return;
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const app = await this.ensureApplicationDraft();
      const item = await this.db.documentLibraryGet(id);
      if (!item) return;
      const updated = await this.db.upsertApplication({
        ...app,
        cvDocumentId: kind === 'cv' ? id : app.cvDocumentId,
        coverLetterDocumentId: kind === 'cover_letter' ? id : app.coverLetterDocumentId,
        docLanguage: item.language ?? this.documentReviewLanguage(),
      });
      this.application.set(updated);
      if (kind === 'cv') {
        this.linkedCv.set(item);
        this.chooseCvOpen.set(false);
      } else {
        this.linkedCoverLetter.set(item);
        this.chooseCoverLetterOpen.set(false);
      }
      this.finalChecksOutdated.set(!!this.finalChecks());
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
      this.toast.error(String(e));
    }
  }

  runFinalChecks(): Promise<void> {
    return this.finalChecksSvc.run(this.finalCheckInputs());
  }

  finalChecksNeedRetailor(): boolean {
    return this.finalChecksSvc.needRetailor(this.linkedCv());
  }

  async retailorFromFinalChecks(): Promise<void> {
    if (this.tailoring()) return;
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
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
      language: this.documentReviewLanguage(),
      region: this.documentReviewRegion(),
    };
  }

  private currentDocumentsHash(): Promise<string> {
    return this.finalChecksSvc.documentsHash(this.finalCheckInputs());
  }

  private refreshFinalChecksFreshness(): Promise<void> {
    return this.finalChecksSvc.refreshFreshness(this.finalCheckInputs());
  }

  async openTailorCoverLetterModal(): Promise<void> {
    this.tailorCoverLetterError.set('');
    this.selectedCoverLetterId.set(null);
    this.tailoringCoverLetter.set(false);
    this.tailorCoverLetterOpen.set(true);

    try {
      const letters = await this.db.documentLibraryList('cover_letter');
      this.coverLetters.set(letters);
      const settings = this.settings();
      this.tailorCoverLetterLanguage.set(settings?.defaultDocLanguage ?? 'en');
      const defaultDoc =
        letters.find((c) => c.isDefault && c.language === this.tailorCoverLetterLanguage()) ??
        letters.find((c) => c.language === this.tailorCoverLetterLanguage()) ??
        letters[0] ??
        null;
      if (defaultDoc) {
        this.selectedCoverLetterId.set(defaultDoc.id);
      }
    } catch {
      // Non-fatal
    }
  }

  async startTailoringCoverLetter(): Promise<void> {
    if (this.tailoringCoverLetter()) return;
    this.tailoringCoverLetter.set(true);
    this.tailorCoverLetterError.set('');

    try {
      const job = this.job();
      const profile = this.profile();
      const settings = this.settings();
      if (!job || !job.id) throw new Error('No active job selected.');
      if (!profile?.fullMd) throw new Error(this.t()('documents.cv_generate_no_profile'));

      const lang = this.tailorCoverLetterLanguage();
      const jd = job.jdText ?? '';

      let baseParagraphs: string[] = [];
      let baseAddress: CoverLetterAddress = {};
      let baseSubject = '';
      let baseGreeting = '';
      let baseClosing = '';
      let baseSignature = '';
      let baseRegionTag = 'generic';
      // Honor the base letter's chosen voice/length; fall back to defaults.
      let tone = COVER_LETTER_TONE_DEFAULT;
      let length = COVER_LETTER_LENGTH_DEFAULT;
      // Availability and salary belong to the applicant, not to one letter, so
      // they carry over from the base letter into every tailored copy.
      let earliestStart = '';
      let salaryExpectation = '';
      let noticePeriod = '';

      const selectedId = this.selectedCoverLetterId();
      if (selectedId) {
        const baseDoc = this.coverLetters().find((c) => c.id === selectedId);
        if (baseDoc && baseDoc.contentJson) {
          const content = JSON.parse(baseDoc.contentJson) as CoverLetterContent;
          baseParagraphs = content.bodyParagraphs || [];
          baseAddress = content.address || {};
          baseSubject = content.subject || '';
          baseGreeting = content.greeting || '';
          baseClosing = content.closing || '';
          baseSignature = content.signature || '';
          baseRegionTag = baseDoc.regionTag || 'generic';
          tone = content.tone ?? tone;
          length = content.length ?? length;
          earliestStart = content.earliestStart ?? '';
          salaryExpectation = content.salaryExpectation ?? '';
          noticePeriod = content.noticePeriod ?? '';
        }
      }

      let tailoredParagraphs: string[] = [];
      const modelUsed = settings?.defaultModel ?? 'quality';
      let tokensInput = 0;
      let tokensOutput = 0;

      if (baseParagraphs.length > 0) {
        const rendered = await this.ai.renderSkill('cover-letter-tailor', {
          profile_md: profile.fullMd,
          job_description: jd,
          body_paragraphs: JSON.stringify(baseParagraphs),
          language: lang,
          tone,
          length,
        });
        const res = await this.ai.run({
          mode: settings?.aiMode ?? 'api',
          provider: settings?.provider ?? 'openai',
          model: settings?.defaultModel ?? 'quality',
          systemPrompt: rendered.systemPrompt,
          userPrompt: rendered.userPrompt,
          language: lang,
        });

        const rawText = res.text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        const parsed = JSON.parse(rawText);
        tailoredParagraphs = parsed.bodyParagraphs || [];
        tokensInput = res.tokensInput;
        tokensOutput = res.tokensOutput;
      } else {
        const rendered = await this.ai.renderSkill('cover-letter-generate', {
          profile_md: profile.fullMd,
          job_description: jd,
          language: lang,
          section: 'all',
          tone,
          length,
          earliest_start: earliestStart,
          salary_expectation: salaryExpectation,
          notice_period: noticePeriod,
        });
        const res = await this.ai.run({
          mode: settings?.aiMode ?? 'api',
          provider: settings?.provider ?? 'openai',
          model: settings?.defaultModel ?? 'quality',
          systemPrompt: rendered.systemPrompt,
          userPrompt: rendered.userPrompt,
          language: lang,
        });

        const rawText = res.text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        const parsed = JSON.parse(rawText) as CoverLetterContent;
        baseAddress = parsed.address || {};
        baseSubject = parsed.subject || '';
        baseGreeting = parsed.greeting || '';
        baseClosing = parsed.closing || '';
        baseSignature = parsed.signature || '';
        tailoredParagraphs = parsed.bodyParagraphs || [];
        tokensInput = res.tokensInput;
        tokensOutput = res.tokensOutput;
      }

      const contentJsonObj: CoverLetterContent = {
        address: baseAddress,
        date: new Date().toISOString().split('T')[0],
        subject: baseSubject,
        greeting: baseGreeting,
        bodyParagraphs: tailoredParagraphs,
        closing: baseClosing,
        // The signature is the sender's name only. The AI is prompted never to
        // append contact detail, but does not obey reliably, so strip any
        // phone / email / URL deterministically before persisting.
        signature: sanitizeSignature(baseSignature),
        jobDescription: jd,
        tone,
        length,
        earliestStart,
        salaryExpectation,
        noticePeriod,
      };

      const label = this.jobDocLabel(job, 'Tailored Cover Letter');
      const created = await this.db.documentLibraryUpsert({
        docType: 'cover_letter',
        source: 'generated',
        label,
        contentJson: JSON.stringify(contentJsonObj),
        regionTag: baseRegionTag,
        language: lang,
        modelUsed,
        tokensInput,
        tokensOutput,
      });

      const app = this.application();
      if (app && app.id) {
        const updatedApp = await this.db.upsertApplication({
          ...app,
          coverLetterDocumentId: created.id,
        });
        this.application.set(updatedApp);
      }

      this.tailorCoverLetterOpen.set(false);
      void this.router.navigate(['/documents/cover-letter', created.id]);
    } catch (e) {
      this.tailorCoverLetterError.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.tailoringCoverLetter.set(false);
    }
  }

  /** Three tailoring phases (XYZ → dual critique → build) with derived state. */
  readonly tailorPhases = computed(() => {
    const done = this.tailorResults().length;
    const running = this.tailoring();
    const defs = [
      { n: 1, icon: this.icons.pencilLine, nameKey: 'jobs.wizard.phase_xyz' },
      { n: 2, icon: this.icons.scanSearch, nameKey: 'jobs.wizard.phase_critique' },
      { n: 3, icon: this.icons.hammer, nameKey: 'jobs.wizard.phase_build' },
    ];
    return defs.map((d) => {
      let state: 'done' | 'running' | 'ready' | 'pending';
      let statusKey: string;
      if (done >= d.n) {
        state = 'done';
        statusKey = 'jobs.wizard.phase_done';
      } else if (running && done === d.n - 1) {
        state = 'running';
        statusKey = 'jobs.wizard.phase_running';
      } else if (!running && done === d.n - 1) {
        state = 'ready';
        statusKey = 'jobs.wizard.phase_ready';
      } else {
        state = 'pending';
        statusKey = 'jobs.wizard.phase_pending';
      }
      return { ...d, state, statusKey };
    });
  });

  /** i18n key of the phase currently being generated - drives the animated
   * "AI thinking" line while tailoring auto-runs through all three passes. */
  readonly currentPhaseKey = computed(() => {
    const keys = ['jobs.wizard.phase_xyz', 'jobs.wizard.phase_critique', 'jobs.wizard.phase_build'];
    return keys[Math.min(this.tailorResults().length, 2)];
  });

  /** Aliases onto `DocumentExportService`. Several component methods reset the
   * status line directly, so these stay the same writable signals. */
  readonly exporting = this.exportSvc.exporting;
  readonly exportStatus = this.exportSvc.status;
  readonly exportError = this.exportSvc.error;
  readonly lastExport = this.exportSvc.lastExport;

  readonly parsing = signal(false);
  readonly scoring = this.scoreSvc.running;

  readonly parseStatus = signal('');
  readonly parseError = signal(false);
  readonly scoreStatus = this.scoreSvc.status;
  readonly scoreError = this.scoreSvc.error;

  private readonly destroyRef = inject(DestroyRef);
  /** The job id the page currently reflects, so a route param change to a
   * different job triggers a real reload instead of leaving stale content. */
  private loadedJobId: number | null = null;

  async ngOnInit(): Promise<void> {
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
    } catch {
      // non-fatal - user can still paste
    }

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
  private decideWizardView(id: number): 'return' | 'restore-docs' | null {
    const params = this.route.snapshot.queryParamMap;
    const returningFromEditor =
      params.get('returnTo') === 'applyWizard' || params.get('wizardStep') === 'documents';
    if (returningFromEditor) {
      this.wizardOpen.set(true);
      this.wizardInitialStep.set(3);
      return 'return';
    }
    // Re-open the wizard at the step the user left it on when they navigate
    // back to this job mid-flow (floating resume button, sidebar nav, browser
    // back). Restoring is token-free.
    if (this.wizardOpen()) return null;
    const prog = this.wizardProgress.progress();
    if (!prog || prog.jobId !== id) return null;
    this.wizardInitialStep.set(prog.step);
    this.wizardOpen.set(true);
    return prog.step === 3 ? 'restore-docs' : null;
  }

  /** Clear transient wizard/tailor/review state when moving to another job.
   * Background runs are keyed by job in their services, so leave those. */
  private resetJobScopedState(): void {
    this.wizardOpen.set(false);
    this.wizardInitialStep.set(0);
    this.tailorSvc.reset();
    this.tailorCancelled.set(false);
    this.postTailorSaved.set(false);
    this.finalChecksSvc.reset();
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    this.exportSvc.resetStatus();
    this.editingLocked.set(false);
    this.crossJobConfirmOpen.set(false);
    this.deleteConfirmOpen.set(false);
    this.chooseCvOpen.set(false);
    this.chooseCoverLetterOpen.set(false);
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

  private async loadJob(id: number): Promise<void> {
    try {
      const job = await this.db.getJob(id);
      if (!job) return;
      this.job.set(job);
      this.jdText.set(job.jdText ?? '');
      const headerTitle = [job.company, job.title].filter(Boolean).join(' - ');
      this.pageTitle.set(headerTitle || this.t()('nav.jobs'));
      await this.loadCachedScore(id);
      const apps = await this.db.listApplications();
      const app = apps.find((a) => a.jobId === id) ?? null;
      this.application.set(app);
      this.documentReviewLanguage.set(
        app?.docLanguage ??
          this.normalizeSupportedLanguage(job.language ?? this.settings()?.defaultDocLanguage),
      );
      this.documentReviewRegion.set(this.inferDocumentRegion(job));

      const coverLetters = await this.db.documentLibraryList('cover_letter');
      this.coverLetters.set(coverLetters);

      const cvs = await this.db.documentLibraryList('cv');
      const s = this.settings();
      const lang = job.language ?? s?.defaultDocLanguage ?? 'en';
      const matches = cvs.filter((c) => c.language === lang || c.isDefault);
      // Default the base CV to the profile ("from scratch", null). The one
      // exception: if this job already has its own tailored CV, default to
      // that so a retailor builds on the job's own document rather than a
      // generic one. Make sure that CV is selectable even if the language
      // filter would have excluded it.
      const linkedCvId = this.application()?.cvDocumentId ?? null;
      if (linkedCvId != null && !matches.some((c) => c.id === linkedCvId)) {
        const linked = cvs.find((c) => c.id === linkedCvId);
        if (linked) matches.unshift(linked);
      }
      this.matchingCvs.set(matches);
      this.selectedBaseCvId.set(
        linkedCvId != null && matches.some((c) => c.id === linkedCvId) ? linkedCvId : null,
      );
      await this.loadLinkedDocuments();

      this.portal.reset(app?.docLanguage ?? this.settings()?.defaultDocLanguage ?? 'en');
      await this.portal.loadFromCache(this.job(), this.profile(), this.settings());
      await this.restoreTailoringFromCache();
    } catch {
      // non-fatal - detail still renders, user can re-score
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
      this.documentReviewError.set(false);
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_saved_unchanged'));
    } else {
      this.finalChecks.set(null);
      this.finalChecksOutdated.set(true);
      this.documentReviewError.set(false);
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_saved_changed'));
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
    if (!j?.id || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionMsg.set('');
    try {
      const existing = this.application();
      const patch: Partial<Application> & { jobId: number; status: 'saved' } = {
        jobId: j.id,
        status: 'saved',
      };
      if (existing?.id) patch.id = existing.id;
      const app = await this.db.upsertApplication(patch);
      this.application.set(app);
      this.jobsStore.patchOverviewRow(j.id, { status: app.status });
      this.actionMsg.set(this.t()('jobs.saved_ok'));
      this.toast.success(this.t()('jobs.saved_ok'));
    } catch (e) {
      this.actionMsg.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.actionBusy.set(false);
    }
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
    if (!j?.id || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionMsg.set('');
    try {
      let app = this.application();
      if (!app?.id) {
        app = await this.db.upsertApplication({ jobId: j.id, status: 'saved' });
      }
      // Create application: generate any missing CV / cover letter, refresh a
      // stale one, and commit both into the library (deferred-to-step-5) even
      // if the user applied via a portal without exporting a PDF first.
      await this.commitApplicationDocuments(true);
      const updated = await this.db.setApplicationStatus(app.id, 'applied');
      this.application.set(updated);
      // Mirror the status the DB actually recorded, not the literal we asked
      // for - the DB is the single source of truth for the overview row.
      this.jobsStore.patchOverviewRow(j.id, { status: updated.status });
      this.editingLocked.set(false);
      this.wizardProgress.clear(j.id);
      // Applied - send the user back to My Jobs; re-entering the job shows
      // its Applied + Tailored state. The toast is the only feedback that
      // survives the navigation, so it fires before the route change.
      this.toast.success(this.t()('jobs.applied_ok'));
      await this.router.navigate(['/jobs']);
    } catch (e) {
      this.actionMsg.set(String(e));
      this.toast.error(String(e));
      this.actionBusy.set(false);
    }
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
    // Starting an application here silently overwrote an unfinished session
    // for another job. Warn first so the user can decide whether to abandon
    // that one (or go back and finish it via the floating resume button).
    const jobId = this.job()?.id;
    const prog = this.wizardProgress.progress();
    if (prog && jobId && prog.jobId !== jobId) {
      this.crossJobConfirmOpen.set(true);
      return;
    }
    this.doOpenWizard();
  }

  private doOpenWizard(): void {
    this.wizardInitialStep.set(0);
    this.wizardOpen.set(true);
    const jobId = this.job()?.id;
    if (jobId) this.wizardProgress.set(jobId, 0);
    this.scrollContentToTop();
  }

  /** Company/role of the other job whose tailoring is unfinished, for the
   * cross-job confirm copy. Empty when none or not in the loaded overview. */
  readonly crossJobLabel = computed(() => {
    const prog = this.wizardProgress.progress();
    if (!prog) return '';
    const row = this.jobsStore.overview().find((r) => r.id === prog.jobId);
    return [row?.company, row?.title].filter(Boolean).join(' - ');
  });

  /** Abandon the other job's unfinished session and open the wizard here. */
  confirmCrossJob(): void {
    this.crossJobConfirmOpen.set(false);
    this.wizardProgress.clear();
    this.doOpenWizard();
  }

  cancelCrossJob(): void {
    this.crossJobConfirmOpen.set(false);
  }

  /** Opens the confirm for abandoning this job's tailoring. */
  askDiscardTailoring(): void {
    this.discardConfirmOpen.set(true);
  }

  cancelDiscardTailoring(): void {
    this.discardConfirmOpen.set(false);
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
    if (this.discarding()) return;
    this.discarding.set(true);
    try {
      const drafts = [this.linkedCv(), this.linkedCoverLetter()].filter(
        (d): d is DocumentLibraryItem => !!d?.id && !!d.isApplicationDraft,
      );
      // `document_library_delete` clears the application's reference itself,
      // so no unlink is owed here (the upsert COALESCEs those ids and could
      // not clear them anyway).
      for (const draft of drafts) await this.db.documentLibraryDelete(draft.id as number);
      this.linkedCv.set(null);
      this.linkedCoverLetter.set(null);
      const jobId = this.job()?.id;
      if (jobId != null) {
        const apps = await this.db.listApplications();
        this.application.set(apps.find((a) => a.jobId === jobId) ?? null);
      }
      this.tailorScore.clear(this.job()?.id ?? -1);
      this.resetJobScopedState();
      this.wizardProgress.clear(this.job()?.id);
      this.discardConfirmOpen.set(false);
      this.scrollContentToTop();
    } catch (e) {
      this.documentReviewStatus.set(String(e));
    } finally {
      this.discarding.set(false);
    }
  }

  closeWizard(): void {
    this.wizardOpen.set(false);
    // Leaving the wizard for this job's summary ends the in-flight session,
    // so the floating resume affordance should stop offering it.
    this.wizardProgress.clear(this.job()?.id);
    this.scrollContentToTop();
  }

  private scrollContentToTop(): void {
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

  openDeleteConfirm(): void {
    this.deleteConfirmOpen.set(true);
  }

  cancelDeleteConfirm(): void {
    this.deleteConfirmOpen.set(false);
  }

  async confirmDeleteJob(): Promise<void> {
    const j = this.job();
    if (!j?.id || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.jobsStore.deleteJob(j.id);
      this.toast.success(this.t()('jobs.delete_ok'));
      await this.router.navigate(['/jobs']);
    } catch (e) {
      this.actionMsg.set(String(e));
      this.toast.error(String(e));
      this.deleting.set(false);
      this.deleteConfirmOpen.set(false);
    }
  }

  async parseAndFilter(): Promise<void> {
    this.parsing.set(true);
    this.parseStatus.set('');
    this.parseError.set(false);
    // Preserve a company/title already known for this job (e.g. from Discover
    // or a prior parse) so re-parsing a header-less JD does not lose it and
    // wrongly report "No company name found".
    const knownCompany = this.job()?.company ?? undefined;
    const knownTitle = this.job()?.title ?? undefined;
    this.job.set(null);
    this.cache.set(null);
    this.scoreStale.set(false);
    this.archetypeMatch.set(null);
    // Re-parsing means the JD (and therefore the score) changed - any earlier
    // tailoring for this job is now stale. Drop it so the Tailored badge and
    // Retailor state clear and the user re-tailors against the updated JD.
    this.editingLocked.set(false);
    this.resetWizard();
    try {
      const j = await this.db.jobPaste(this.jdText(), knownTitle, knownCompany);
      this.job.set(j);
      if (!j.hardFilterPassed) {
        this.parseStatus.set('Hard filter failed - job blocked.');
      } else {
        this.parseStatus.set('');
        // Check cache immediately if profile available
        const p = this.profile();
        if (p?.scoringHash && j.id) {
          const cached = await this.db.scoreCacheGet(j.id, p.scoringHash);
          if (cached) {
            this.cache.set(cached);
            this.fromCache.set(true);
            this.scoreStale.set(false);
            this.scoreStatus.set('Loaded from cache - 0 tokens used.');
          }
        }
        // Layer-1 archetype overlap check (0 tokens, deterministic) - warn only, never blocks.
        const match = await this.db.checkArchetypeMatch(
          j.title ?? undefined,
          j.jdText ?? '',
          p?.targetArchetypes
            ? JSON.stringify(archetypeNames(parseArchetypes(p.targetArchetypes)))
            : undefined,
        );
        this.archetypeMatch.set(match);
      }
    } catch (e) {
      this.parseStatus.set(`Failed: ${String(e)}`);
      this.parseError.set(true);
    } finally {
      this.parsing.set(false);
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
      reviewRegion: this.documentReviewRegion(),
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
    this.wizardProgress.clear(j.id);
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
        this.scrollContentToTop();
      })();
    }, 2200);
  }

  legitimacyNotes(): string[] {
    try {
      return JSON.parse(this.job()?.legitimacyNotes ?? '[]');
    } catch {
      return [];
    }
  }

  hasArchetypes(): boolean {
    return parseArchetypes(this.profile()?.targetArchetypes).length > 0;
  }

  /** Profile compensation target parsed from the loaded profile markdown. */
  protected readonly compTarget = computed(() => {
    const cf = parseProfileMd(this.profile()?.fullMd ?? '');
    return { min: cf.compMin, max: cf.compMax, currency: cf.compCurrency, period: cf.compPeriod };
  });

  /** True when the user has a compensation target to compare against. */
  protected readonly hasCompTarget = computed(
    () => !!(this.compTarget().min || this.compTarget().max),
  );

  /** Salary-fit verdict for this job's JD text vs the profile target. */
  protected readonly compVerdict = computed<CompensationVerdict>(() =>
    compareCompensation(this.compTarget(), extractSalaryFromJd(this.jdText())),
  );

  protected compBadgeLabel(): string {
    const v = this.compVerdict();
    if (v === 'above') return this.t()('comp.badge_above');
    if (v === 'within') return this.t()('comp.badge_within');
    if (v === 'below') return this.t()('comp.badge_below');
    return this.t()('comp.not_stated');
  }

  // ── Tailoring wizard ────────────────────────────────────────────────────────

  /** Runs the full 3-pass tailoring pipeline back-to-back on one click - the
   * phase cards animate through running/done as each pass lands, no manual
   * Continue between passes. Stops on the first failing pass. */
  async startTailoring(): Promise<void> {
    // State a tailoring run invalidates but does not own: the export status
    // line, the post-tailor rescore, and the final checks.
    this.exportStatus.set('');
    this.lastExport.set(null);
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
    this.wizardInitialStep.set(step);
    // Remember where the user is so leaving the page (sidebar nav, the
    // document editor) can bring them back to this exact step instead of
    // the job list.
    const jobId = this.job()?.id;
    if (jobId) this.wizardProgress.set(jobId, step);
    // Every step transition lands the user at the top of the page.
    this.scrollContentToTop();

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
    this.exportStatus.set('');
    this.exportError.set(false);
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
    this.wizardInitialStep.set(1);
    const jobId = this.job()?.id;
    if (jobId) this.wizardProgress.set(jobId, 1);
    this.scrollContentToTop();
  }

  doExport(kind: ReviewDocumentKind, format: ExportFormat): Promise<void> {
    return this.exportSvc.run(
      kind,
      format,
      kind === 'cv' ? this.linkedCv() : this.linkedCoverLetter(),
      (committed) => this.commitLinkedDocument(committed),
    );
  }

  openExportedFile(path: string): void {
    this.exportSvc.openFile(path);
  }

  revealExportedFile(path: string): void {
    this.exportSvc.revealFile(path);
  }
}

import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Application, DocumentLibraryItem, Job, type CvGapAnswer } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CoverLetterDraftService } from '../documents/cover-letter-draft.service';
import { CoverLetterTailorService } from '../documents/cover-letter-tailor.service';
import { CvDraftService } from '../documents/cv-draft.service';
import { CvGapDialogService } from '../documents/cv-gap-dialog.service';
import { DocumentGenService, ReviewDocumentKind } from '../documents/document-gen.service';
import { GapFillHooks } from '../documents/gap-fill';
import { JobGapFillService, jobDocLabel } from '../documents/job-gap-fill.service';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { DocumentReviewStatusService } from './document-review-status.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { JobDetailStore } from './job-detail.store';
import { JobFinalChecksStore } from './job-final-checks.store';

/**
 * Generating a document for this job: the CV draft, the cover letter draft, the
 * gap-fill dialog both of them raise, and the separate "tailor an existing
 * cover letter" flow.
 *
 * Split from `JobDocumentsStore` because the two answer different questions.
 * This store *produces* a document; that one decides whether the produced
 * document is still current and commits it to the library. They were one class
 * of 278 lines against a budget of 250, and the seam was already visible in the
 * call graph - `commit()` calls into here, never the other way.
 */
@Injectable()
export class JobDocumentDraftsStore {
  private readonly detail = inject(JobDetailStore);
  private readonly finalChecks = inject(JobFinalChecksStore);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  private readonly reviewStatus = inject(DocumentReviewStatusService);
  private readonly targets = inject(DocumentReviewTargetsService);
  private readonly cvDraftSvc = inject(CvDraftService);
  private readonly coverLetterSvc = inject(CoverLetterDraftService);
  private readonly coverLetterTailor = inject(CoverLetterTailorService);
  private readonly gapFill = inject(JobGapFillService);
  private readonly gapSvc = inject(CvGapDialogService);
  private readonly docGen = inject(DocumentGenService);
  private readonly router = inject(Router);
  private readonly t = inject(TranslateService).t;

  /**
   * Which drafts are generating, read from `DocumentGenService` - a root
   * singleton, so an in-flight run survives leaving this page, and the CV and
   * the cover letter generate independently.
   */
  readonly preparingCv = computed(() => this.docGen.isPreparing(this.jobId(), 'cv'));
  readonly preparingCoverLetter = computed(() =>
    this.docGen.isPreparing(this.jobId(), 'cover_letter'),
  );
  readonly anyPreparing = computed(() => this.docGen.anyPreparing(this.jobId()));

  private jobId(): number {
    return this.detail.job()?.id ?? -1;
  }

  async createCv(tailoredMd: string): Promise<void> {
    if (this.preparingCv()) return;
    const job = this.detail.job();
    const settings = this.detail.settings();
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
        ensureApplication: () => this.ensureApplication(),
        ...this.gapFillHooks(job),
      });
      if (!result) return;
      this.link(result.application, 'cv', result.document);
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_cv_linked'));
    });
  }

  async createCoverLetter(): Promise<void> {
    if (this.preparingCoverLetter()) return;
    const job = this.detail.job();
    const profile = this.detail.profile();
    const settings = this.detail.settings();
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
        // still generating has not linked itself yet, so testing only the
        // linked CV let a cover letter started alongside it run a second
        // analysis and raise a second dialog for the same questions.
        skipGapFill: !!this.linkedDocs.cv() || this.preparingCv(),
        ensureApplication: () => this.ensureApplication(),
        ...this.gapFillHooks(job),
      });
      if (!result) return;
      this.link(result.application, 'cover_letter', result.document);
      this.reviewStatus.succeed(this.t()('jobs.wizard.document_cover_letter_linked'));
    });
  }

  /** What both create paths do with a result: adopt the application, link the
   * document, and tell the checks that what they described has changed. */
  private link(
    application: Application,
    kind: ReviewDocumentKind,
    document: DocumentLibraryItem,
  ): void {
    this.detail.application.set(application);
    if (kind === 'cv') this.linkedDocs.cv.set(document);
    else this.linkedDocs.coverLetter.set(document);
    this.finalChecks.markOutdated();
  }

  private ensureApplication(): Promise<Application> {
    return this.detail.ensureApplicationOrThrow(this.targets.language());
  }

  /** The gap-fill callbacks both document flows hand to their draft service. */
  private gapFillHooks(job: Job): GapFillHooks {
    return this.gapFill.hooks({
      job,
      settings: this.detail.settings(),
      language: this.targets.language(),
      profile: this.detail.profile(),
      applyProfile: (profile) => this.detail.profile.set(profile),
    });
  }

  submitGap(result: { answers: CvGapAnswer[]; saveToProfile: boolean }): void {
    this.gapSvc.submit(result);
  }

  cancelGap(): void {
    this.gapSvc.cancel();
  }

  /**
   * "Tailor an existing cover letter to this job".
   *
   * **Nothing calls this today, and that is a defect rather than a design.**
   * `CoverLetterTailorService.modalOpen` is set in exactly one place - inside
   * `prepare()` below - and `prepare()` had exactly one caller, the page method
   * this replaced, which had none of its own. So the modal cannot be opened,
   * and `startTailoringCoverLetter` is only reachable from inside it.
   *
   * Both are moved here unchanged rather than deleted: whether the feature gets
   * its trigger back or goes away is a product decision, and deleting a working
   * flow because its button is missing would make that decision by default.
   */
  async openTailorCoverLetterModal(): Promise<void> {
    const letters = await this.coverLetterTailor.prepare(this.detail.settings());
    // Null means the list could not be read - non-fatal, keep what we had.
    if (letters) this.detail.coverLetters.set(letters);
  }

  async startTailoringCoverLetter(): Promise<void> {
    const result = await this.coverLetterTailor.run({
      job: this.detail.job(),
      profile: this.detail.profile(),
      settings: this.detail.settings(),
      letters: this.detail.coverLetters(),
      application: this.detail.application(),
      label: (job) => jobDocLabel(job, 'Tailored Cover Letter'),
    });
    if (!result) return;
    if (result.application) this.detail.application.set(result.application);
    void this.router.navigate(['/documents/cover-letter', result.document.id]);
  }
}

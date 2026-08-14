import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Application } from '@applye/core';
import {
  coverLetterStaleInput,
  cvStaleInput,
  decideCoverLetterAction,
  decideCvAction,
} from '../documents/application-document-actions';
import { ReviewDocumentKind } from '../documents/document-gen.service';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { DocumentReviewStatusService } from './document-review-status.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentDraftsStore } from './job-document-drafts.store';
import { JobFinalChecksStore } from './job-final-checks.store';

/**
 * Which CV and cover letter this application is linked to, whether they still
 * match the tailoring in hand, and how the user reaches them.
 *
 * Provided by the page, not in root: the linked documents belong to the job open
 * on this screen and must not outlive it - the same lifetime
 * `LinkedDocumentsService` and `FinalChecksService` already have.
 *
 * **Generating a document is `JobDocumentDraftsStore`'s job**, and the
 * dependency runs one way: `commit()` calls into it, never the reverse. **The
 * tailoring itself is neither store's**: `retailorFromFinalChecks` stays on the
 * page because it drives tailoring, rescoring and this store at once, and
 * moving it would drag the tailoring block along before its own turn.
 */
@Injectable()
export class JobDocumentsStore {
  private readonly detail = inject(JobDetailStore);
  private readonly drafts = inject(JobDocumentDraftsStore);
  private readonly finalChecks = inject(JobFinalChecksStore);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  private readonly reviewStatus = inject(DocumentReviewStatusService);
  private readonly targets = inject(DocumentReviewTargetsService);
  private readonly router = inject(Router);

  /** Aliases onto `LinkedDocumentsService`'s writable signals. */
  readonly cv = this.linkedDocs.cv;
  readonly coverLetter = this.linkedDocs.coverLetter;

  async openCv(id: number, returnToWizard = false): Promise<void> {
    await this.openEditor('cv', id, returnToWizard);
  }

  async openCoverLetter(id: number, returnToWizard = false): Promise<void> {
    await this.openEditor('cover_letter', id, returnToWizard);
  }

  /**
   * Opens a linked document in its editor. The two return paths differ in what
   * the editor's back arrow does: from the My Jobs badges it returns to this
   * job, and from the wizard it returns into the wizard's review step, carrying
   * the hash that says whether the documents changed while it was open.
   */
  private async openEditor(
    kind: ReviewDocumentKind,
    id: number,
    returnToWizard: boolean,
  ): Promise<void> {
    const job = this.detail.job();
    if (!job?.id) return;
    const path = kind === 'cv' ? ['/documents/cv', id] : ['/documents/cover-letter', id];
    if (!returnToWizard) {
      await this.router.navigate(path, {
        queryParams: {
          returnTo: 'myJobs',
          jobId: job.id,
          jobLabel: job.company || job.title || '',
        },
      });
      return;
    }
    const reviewHash = await this.finalChecks.documentsHash();
    this.finalChecks.storeForReturn(reviewHash);
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

  /** The application row the documents attach to, in this store's vocabulary so
   * a caller does not have to know the review language to ask for one. */
  ensureApplicationDraft(): Promise<Application> {
    return this.detail.ensureApplicationOrThrow(this.targets.language());
  }

  async prepareStep(): Promise<void> {
    await this.reviewStatus.run(async () => {
      await this.detail.refreshLibrary();
      await this.ensureApplicationDraft();
      await this.loadLinked();
      // Do not auto-create the CV on entering this step. The document is
      // written only when the user explicitly clicks Create/Regenerate,
      // so nothing is generated (or spends tokens) behind their back.
    });
  }

  async loadLinked(): Promise<void> {
    await this.linkedDocs.load(this.detail.application());
    await this.finalChecks.refreshFreshness();
  }

  /**
   * Ensures the application's CV and cover letter exist and (when
   * `regenerateStale`) match the latest tailoring, then commits both into the
   * library. Generation reuses the Review-documents path, so it is fail-soft -
   * those set an error status instead of throwing, and the CV path is skipped
   * when there is no tailored source to build from. This is the "Create /
   * Update application" action: nothing reaches the library until it runs.
   */
  async commit(tailoredMd: string, regenerateStale: boolean): Promise<void> {
    const cv = await decideCvAction({
      linked: !!this.cv(),
      tailoredMd,
      regenerateStale,
      isStale: () => this.cvStale(tailoredMd),
    });
    if (cv !== 'keep') await this.drafts.createCv(tailoredMd);
    await this.linkedDocs.commit('cv');

    const coverLetter = await decideCoverLetterAction({
      linked: !!this.coverLetter(),
      regenerateStale,
      isStale: () => this.coverLetterStale(),
    });
    if (coverLetter !== 'keep') await this.drafts.createCoverLetter();
    await this.linkedDocs.commit('cover_letter');
  }

  /** True when the linked CV was generated from a different tailoring than the
   * one now in hand, so committing the application should refresh it first. */
  private cvStale(tailoredMd: string): Promise<boolean> {
    const input = cvStaleInput(
      this.detail.job(),
      tailoredMd,
      this.targets.language(),
      this.targets.region(),
    );
    return input ? this.linkedDocs.isStale('cv', input) : Promise.resolve(false);
  }

  /** True when the linked cover letter was built from a different profile or JD
   * than the current one. */
  private coverLetterStale(): Promise<boolean> {
    const input = coverLetterStaleInput(
      this.detail.job(),
      this.detail.profile(),
      this.targets.language(),
      this.targets.region(),
    );
    return input ? this.linkedDocs.isStale('cover_letter', input) : Promise.resolve(false);
  }

  async chooseExisting(kind: ReviewDocumentKind, id: number | null): Promise<void> {
    if (!id) return;
    await this.reviewStatus.run(async () => {
      const app = await this.detail.ensureApplicationOrThrow(this.targets.language());
      const result = await this.linkedDocs.link(kind, id, app, this.targets.language());
      if (!result) return;
      this.detail.application.set(result.application);
      this.reviewStatus.closeChooser(kind);
      this.finalChecks.markOutdated();
    });
  }
}

import { Injectable, inject } from '@angular/core';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { FinalCheckInputs, FinalChecksService } from './final-checks.service';
import { JobDetailStore } from './job-detail.store';

/**
 * The job detail screen's final-checks state: what the checks ran against, and
 * whether what they say still describes the documents in hand.
 *
 * `FinalChecksService` is stateless about *which* documents it is checking - it
 * takes a `FinalCheckInputs` on every call. Assembling that record was five
 * lines repeated at four call sites on the page, and it is the only reason the
 * page needed `LinkedDocumentsService`, `DocumentReviewTargetsService` and
 * `JobDetailStore` in the same breath. This store owns the assembly; the page
 * asks in verbs.
 *
 * **It deliberately does not depend on `JobDocumentsStore`.** The inputs come
 * from `LinkedDocumentsService`, which both stores inject, so the dependency
 * runs one way - documents -> final checks - and there is no cycle to reason
 * about. Both are provided by the page, so both see the same linked documents.
 */
@Injectable()
export class JobFinalChecksStore {
  private readonly svc = inject(FinalChecksService);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  private readonly detail = inject(JobDetailStore);
  private readonly targets = inject(DocumentReviewTargetsService);

  /**
   * Aliases onto the service's own writable signals rather than views of them:
   * `job-final-checks.component.ts` and `job-document-cards.component.ts` read
   * the service directly, so a copy here would be a second source of truth.
   */
  readonly checks = this.svc.checks;
  readonly outdated = this.svc.outdated;

  run(): Promise<void> {
    return this.svc.run(this.inputs());
  }

  /** The hash the wizard carries into the document editor and back. */
  documentsHash(): Promise<string> {
    return this.svc.documentsHash(this.inputs());
  }

  refreshFreshness(): Promise<void> {
    return this.svc.refreshFreshness(this.inputs());
  }

  storeForReturn(reviewHash: string): void {
    this.svc.storeForReturn(reviewHash);
  }

  /**
   * A document changed under checks that have already run. Guarded on `checks()`
   * because "outdated" is only meaningful once there is a result to be outdated:
   * setting it before the first run would light the banner on a screen that has
   * never been checked.
   */
  markOutdated(): void {
    this.outdated.set(!!this.checks());
  }

  /** Retailoring invalidates the result outright - the documents it described
   * are being rebuilt, so there is nothing left to mark stale. */
  invalidate(): void {
    this.checks.set(null);
    this.outdated.set(true);
  }

  private inputs(): FinalCheckInputs {
    return {
      cv: this.linkedDocs.cv(),
      coverLetter: this.linkedDocs.coverLetter(),
      jdText: this.detail.jdText(),
      language: this.targets.language(),
      region: this.targets.region(),
    };
  }
}

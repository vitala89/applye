import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  DocumentEditorDestination,
  JobDocumentDraftsStore,
  JobDocumentsStore,
} from '@applye/application';
import { parkFinalChecks } from '../../core/browser-ui-state';

/**
 * Turns a document-editor destination into a route change.
 *
 * The stores decide the path and whether final checks must survive the trip.
 * This service is the only thing on the jobs page that calls `Router` for
 * those destinations.
 */
@Injectable()
export class JobEditorNavigation {
  private readonly docs = inject(JobDocumentsStore);
  private readonly drafts = inject(JobDocumentDraftsStore);
  private readonly router = inject(Router);

  openCv(id: number, returnToWizard = false): Promise<void> {
    return this.follow(this.docs.openCv(id, returnToWizard));
  }

  openCoverLetter(id: number, returnToWizard = false): Promise<void> {
    return this.follow(this.docs.openCoverLetter(id, returnToWizard));
  }

  openTailoredCoverLetter(): Promise<void> {
    return this.follow(this.drafts.startTailoringCoverLetter());
  }

  private async follow(pending: Promise<DocumentEditorDestination | null>): Promise<void> {
    const destination = await pending;
    if (!destination) return;
    if (destination.parkedReview) {
      parkFinalChecks(destination.parkedReview.reviewHash, destination.parkedReview.checks);
    }
    await this.router.navigate(
      destination.commands,
      destination.queryParams ? { queryParams: destination.queryParams } : undefined,
    );
  }
}

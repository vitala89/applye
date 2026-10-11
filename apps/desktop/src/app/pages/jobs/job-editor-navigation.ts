import { Injectable, inject } from '@angular/core';
import { Params, Router } from '@angular/router';
import {
  DocumentEditorDestination,
  JobDocumentDraftsStore,
  JobDocumentsStore,
} from '@applye/application';
import { parkFinalChecks } from '../../core/browser-ui-state';

/** The route the desktop builds from a semantic editor destination. */
export function editorRoute(destination: DocumentEditorDestination): {
  commands: (string | number)[];
  extras: { queryParams: Params } | undefined;
} {
  const commands = [
    destination.kind === 'cv' ? '/documents/cv' : '/documents/cover-letter',
    destination.documentId,
  ];
  const back = destination.returnTo;
  if (!back) return { commands, extras: undefined };
  if (back.context === 'myJobs') {
    return {
      commands,
      extras: {
        queryParams: { returnTo: 'myJobs', jobId: back.jobId, jobLabel: back.jobLabel },
      },
    };
  }
  return {
    commands,
    extras: {
      queryParams: {
        returnTo: 'applyWizard',
        jobId: back.jobId,
        documentType: destination.kind,
        documentId: destination.documentId,
        reviewHash: back.reviewHash,
        ...(destination.preview ? { preview: '1' } : {}),
      },
    },
  };
}

/**
 * Turns a document-editor destination into a route change.
 *
 * The stores decide which document and which trip back. This service is the
 * only thing on the jobs page that calls `Router` for those destinations.
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
    const route = editorRoute(destination);
    await this.router.navigate(route.commands, route.extras);
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { Application, DocumentLibraryItem } from '@applye/core';
import { DbService, DocumentsGateway } from '@applye/data';
import { DocumentReviewStatusService } from './document-review-status.service';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { TailorScoreService } from './tailor-score.service';

/**
 * The documents a discard is allowed to destroy: the ones this application
 * generated and has not committed to the library. A committed document is the
 * user's, and deleting it would throw away work the discard was never asked to
 * touch. A draft with no row has nothing to delete.
 */
export function applicationDrafts(
  documents: (DocumentLibraryItem | null)[],
): DocumentLibraryItem[] {
  return documents.filter((d): d is DocumentLibraryItem => !!d?.id && !!d.isApplicationDraft);
}

/** What the page hands over, and the one thing it wants handed back. */
export interface TailoringDiscardContext {
  jobId: number | null;
  /** The linked CV and cover letter, in any state - filtered here. */
  documents: (DocumentLibraryItem | null)[];
  /** Receives the application as it stands after the drafts are gone. */
  applyApplication: (application: Application | null) => void;
}

/**
 * Discarding a tailoring: deleting the drafts it produced, and the confirmation
 * in front of that.
 *
 * Extracted to give the flow a test seam. It had none, and the failure path was
 * wrong in a way only a test would catch: the error text went to the status
 * line with no error flag and no toast, so a discard that destroyed nothing
 * rendered exactly like one that worked.
 */
@Injectable()
export class TailoringDiscardService {
  private readonly db = inject(DbService);
  private readonly docs = inject(DocumentsGateway);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  private readonly tailorScore = inject(TailorScoreService);
  private readonly status = inject(DocumentReviewStatusService);

  readonly confirmOpen = signal(false);
  readonly discarding = signal(false);

  ask(): void {
    this.confirmOpen.set(true);
  }

  cancel(): void {
    this.confirmOpen.set(false);
  }

  /**
   * Returns true when the drafts are gone, false when nothing was discarded -
   * whether because a run was already in flight or because the delete failed.
   * The caller resets the page's own state only on true, so a failed discard
   * leaves the user where they were, with the reason on screen.
   */
  async discard(ctx: TailoringDiscardContext): Promise<boolean> {
    if (this.discarding()) return false;
    this.discarding.set(true);
    try {
      // `document_library_delete` clears the application's reference itself,
      // so no unlink is owed here (the upsert COALESCEs those ids and could
      // not clear them anyway).
      for (const draft of applicationDrafts(ctx.documents)) {
        await this.docs.documentLibraryDelete(draft.id as number);
      }
      this.linkedDocs.clear();
      if (ctx.jobId != null) {
        const apps = await this.db.listApplications();
        ctx.applyApplication(apps.find((a) => a.jobId === ctx.jobId) ?? null);
      }
      this.tailorScore.clear(ctx.jobId ?? -1);
      this.confirmOpen.set(false);
      return true;
    } catch (e) {
      this.status.fail(e);
      return false;
    } finally {
      this.discarding.set(false);
    }
  }
}

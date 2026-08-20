import { Injectable, inject, signal } from '@angular/core';
import { Application, DocumentLibraryItem } from '@applye/core';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { DocumentReviewStatusService } from './document-review-status.service';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { TailorScoreService } from './tailor-score.service';
import { TailoringPassDraftsService } from './tailoring-pass-drafts.service';

/**
 * The documents a discard is allowed to destroy: the ones this application
 * generated and has not committed to the library. A committed document is the
 * user's, and deleting it would throw away work the discard was never asked to
 * touch. A draft with no row has nothing to delete.
 *
 * Necessary but not sufficient - see `passDrafts`, which narrows this to the
 * pass being abandoned.
 */
export function applicationDrafts(
  documents: (DocumentLibraryItem | null)[],
): DocumentLibraryItem[] {
  return documents.filter((d): d is DocumentLibraryItem => !!d?.id && !!d.isApplicationDraft);
}

/**
 * Of those drafts, the ones the in-flight pass actually created.
 *
 * A job tailored once and re-tailored still has the first pass's CV and cover
 * letter in draft, so "is it a draft" authorised deleting them - and
 * `document_library_delete` unlinks and deletes, so the tokens they cost were
 * gone for good. That is `B1`. Ownership is recorded at creation rather than
 * inferred here, because nothing on the row says which pass wrote it.
 */
export function passDrafts(
  documents: (DocumentLibraryItem | null)[],
  ownedIds: number[],
): DocumentLibraryItem[] {
  return applicationDrafts(documents).filter((d) => ownedIds.includes(d.id as number));
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
  private readonly db = inject(JobsGateway);
  private readonly docs = inject(DocumentsGateway);
  private readonly linkedDocs = inject(LinkedDocumentsService);
  private readonly tailorScore = inject(TailorScoreService);
  private readonly status = inject(DocumentReviewStatusService);
  private readonly passDraftsSvc = inject(TailoringPassDraftsService);

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
      for (const draft of passDrafts(ctx.documents, this.passDraftsSvc.ids(ctx.jobId))) {
        await this.docs.documentLibraryDelete(draft.id as number);
      }
      // Only once the deletes are through: a failed discard is retried, and a
      // retry that no longer owns the pass would delete nothing and call it
      // done, leaving the drafts it was asked to remove.
      this.passDraftsSvc.clear(ctx.jobId ?? undefined);
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

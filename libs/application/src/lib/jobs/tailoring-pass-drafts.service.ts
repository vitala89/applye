import { Injectable, signal } from '@angular/core';

export interface TailoringPassDrafts {
  jobId: number;
  /** Library rows this pass generated, in the order they were created. */
  ids: number[];
}

/**
 * Which document-library rows the in-flight tailoring pass created.
 *
 * A discard is allowed to destroy the pass it is abandoning and nothing else.
 * Without this record it could only ask "is this an application draft", and a
 * job tailored once and then re-tailored still has its earlier CV and cover
 * letter in draft - so cancelling the second pass deleted the first pass's
 * documents, permanently (`document_library_delete` unlinks and deletes). That
 * is `B1`, and it cost the user the tokens both documents were generated with.
 *
 * Ownership is recorded where a draft is born - `JobDocumentDraftsStore.link` -
 * rather than snapshotted when the wizard opens. There are two open paths
 * (`JobActionsStore.openWizard` and the cross-job confirm) and only one
 * creation path, so this hook cannot be missed on a route the other forgot.
 *
 * The record has to outlive the jobs page: the discard service is
 * component-scoped, and stepping into the document editor destroys that page.
 * This service is a root singleton, and the desktop mirrors `current` into
 * session storage so a reload inside the same app session still knows which
 * rows the pass owns (ADR-0005, amendment sixty-six).
 *
 * One pass at a time, matching `WizardProgress` - the cross-job confirm already
 * refuses to run two. **The failure direction is deliberate**: an app restart
 * empties the record, so a discard afterwards deletes nothing rather than
 * deleting too much. Orphan drafts are recoverable; destroyed ones are not.
 */
@Injectable({ providedIn: 'root' })
export class TailoringPassDraftsService {
  readonly current = signal<TailoringPassDrafts | null>(null);

  hydrate(drafts: TailoringPassDrafts | null): void {
    this.current.set(drafts);
  }

  /**
   * Record that `documentId` was generated for `jobId` by the pass now running.
   * A different job starts a fresh record: only one pass runs at a time, so the
   * previous job's ids are no longer anyone's to delete.
   */
  record(jobId: number, documentId: number): void {
    const current = this.current();
    const ids = current?.jobId === jobId ? current.ids : [];
    if (ids.includes(documentId)) return;
    this.current.set({ jobId, ids: [...ids, documentId] });
  }

  /** The rows this pass created for `jobId`, empty for any other job. */
  ids(jobId: number | null): number[] {
    const current = this.current();
    return current && jobId != null && current.jobId === jobId ? current.ids : [];
  }

  /**
   * Drop the record. With `jobId`, only clears when it belongs to that job, so
   * ending one job's pass never disowns another's - the same guard
   * `WizardProgressService.clear` uses, for the same reason.
   */
  clear(jobId?: number): void {
    if (jobId != null && this.current()?.jobId !== jobId) return;
    this.current.set(null);
  }
}

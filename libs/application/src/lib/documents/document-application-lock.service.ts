import { Injectable, inject, signal } from '@angular/core';
import { JobsGateway } from '@applye/data';

export type LockableDocumentKind = 'cv' | 'cover_letter';

/**
 * Whether a CV or cover letter is locked for editing: linked to an
 * application that has left `saved` - `applied` is terminal for everything
 * (`P2`), and the version that was sent is the version that exists.
 *
 * Keyed on document identity rather than how the editor was opened, so the
 * same document reads locked whether it is reached from the Documents list,
 * My Jobs, or the wizard - a document does not become editable again just
 * because its job context was left behind in the URL.
 *
 * Component-scoped: each editor checks the one document it has open.
 */
@Injectable()
export class DocumentApplicationLockService {
  private readonly jobs = inject(JobsGateway);

  readonly locked = signal(false);

  async check(kind: LockableDocumentKind, documentId: number): Promise<void> {
    const apps = await this.jobs.listApplications();
    const linked = apps.find((a) =>
      kind === 'cv' ? a.cvDocumentId === documentId : a.coverLetterDocumentId === documentId,
    );
    this.locked.set(!!linked && linked.status !== 'saved');
  }
}

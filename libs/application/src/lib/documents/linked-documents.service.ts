import { Injectable, inject, signal } from '@angular/core';
import { Application, DocumentLibraryItem, SupportedLanguage } from '@applye/core';
import { DbService, SystemGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ReviewDocumentKind } from './document-gen.service';

export interface LinkResult {
  application: Application;
  item: DocumentLibraryItem;
}

/**
 * The two documents linked to an application: loading them, pointing them at a
 * library row, committing them out of draft, and answering whether one was
 * built from inputs that have since changed.
 *
 * Deliberately free of the decision that uses that answer. "Is it stale, do I
 * regenerate, which generator do I call" is the page's orchestration; this
 * service only reports and commits. It is why nothing here injects the draft
 * services, and why it can be tested against a fake database alone.
 *
 * Component-scoped via the page's `providers`: the signals live exactly as long
 * as one page component.
 */
@Injectable()
export class LinkedDocumentsService {
  private readonly db = inject(DbService);
  private readonly system = inject(SystemGateway);
  private readonly t = inject(TranslateService).t;

  /** Writable so the page can alias them straight onto the template. */
  readonly cv = signal<DocumentLibraryItem | null>(null);
  readonly coverLetter = signal<DocumentLibraryItem | null>(null);

  /**
   * Why the last commit-out-of-draft did not happen. The swallow below is
   * deliberate and stays - a failed commit must not break an export - but it
   * used to leave no trace at all, so a document that never left draft looked
   * like one nobody had committed yet.
   */
  readonly commitError = signal<string | null>(null);

  current(kind: ReviewDocumentKind): DocumentLibraryItem | null {
    return kind === 'cv' ? this.cv() : this.coverLetter();
  }

  private set(kind: ReviewDocumentKind, item: DocumentLibraryItem | null): void {
    if (kind === 'cv') this.cv.set(item);
    else this.coverLetter.set(item);
  }

  /** Read both documents an application points at. Either side may be absent. */
  async load(app: Application | null): Promise<void> {
    const [cv, letter] = await Promise.all([
      app?.cvDocumentId ? this.db.documentLibraryGet(app.cvDocumentId) : Promise.resolve(null),
      app?.coverLetterDocumentId
        ? this.db.documentLibraryGet(app.coverLetterDocumentId)
        : Promise.resolve(null),
    ]);
    this.cv.set(cv);
    this.coverLetter.set(letter);
  }

  clear(): void {
    this.cv.set(null);
    this.coverLetter.set(null);
  }

  /**
   * Point the application at an existing library row. Returns null when the row
   * has gone, so the caller can leave its dialog open rather than close it over
   * nothing. Throws whatever the database throws.
   */
  async link(
    kind: ReviewDocumentKind,
    id: number,
    app: Application,
    fallbackLanguage: SupportedLanguage,
  ): Promise<LinkResult | null> {
    const item = await this.db.documentLibraryGet(id);
    if (!item) return null;
    const application = await this.db.upsertApplication({
      ...app,
      cvDocumentId: kind === 'cv' ? id : app.cvDocumentId,
      coverLetterDocumentId: kind === 'cover_letter' ? id : app.coverLetterDocumentId,
      docLanguage: item.language ?? fallbackLanguage,
    });
    this.set(kind, item);
    return { application, item };
  }

  /**
   * Commit the linked document of `kind` if it is still a draft: clear the
   * apply-wizard draft flag so it graduates into the Documents library, and
   * mirror the change into the signal.
   *
   * Best-effort by design - a failed commit never breaks export or apply. The
   * document stays a draft and the next attempt tries again.
   */
  async commit(kind: ReviewDocumentKind): Promise<void> {
    const item = this.current(kind);
    if (!item || !item.isApplicationDraft) return;
    this.commitError.set(null);
    try {
      const committed = await this.db.documentLibraryCommit(item.id);
      if (!committed) return;
      this.set(kind, committed);
    } catch (e) {
      // Still swallowed: keep the draft, retry on the next export / mark-applied.
      // Recorded rather than discarded, so a commit that keeps failing is
      // visible instead of being inferred from a draft that never changes.
      const key =
        kind === 'cv' ? 'documents.commit_cv_failed' : 'documents.commit_cover_letter_failed';
      this.commitError.set(`${this.t()(key)} ${String(e)}`);
    }
  }

  /**
   * True when the linked document of `kind` was built from different inputs
   * than `hashInput` describes. The caller supplies that input through the
   * generator's own exported builder, so the question asked here is exactly the
   * one the draft answered when it saved.
   *
   * False with nothing linked: absent is not stale, and the caller's own
   * "generate when missing" branch handles it.
   */
  async isStale(kind: ReviewDocumentKind, hashInput: string): Promise<boolean> {
    const doc = this.current(kind);
    if (!doc) return false;
    return (await this.system.hashText(hashInput)) !== doc.inputHash;
  }
}

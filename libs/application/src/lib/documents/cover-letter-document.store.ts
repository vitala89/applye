import { Injectable, inject, signal } from '@angular/core';
import type { DocumentLibraryItem } from '@applye/core';
import { DocumentsGateway } from '@applye/data';
import { CoverLetterContentStore } from './cover-letter-content.store';
import { CoverLetterStyleStore } from './cover-letter-style.store';
import { buildCoverLetterUpsert } from './cover-letter-record';
import { siblingsToUndefault } from './document-record';

/**
 * The cover-letter row itself: what was loaded, the row-level fields the editor
 * changes, and the one write that persists it.
 *
 * **It owns the save, and that is why it injects the other two stores.**
 * `documentLibraryUpsert` takes a whole record, so the content store and the
 * style store cannot each save their own slice without clobbering the other.
 * The same reason `CvDocumentStore` injects `CvPhotoStore` and `CvStyleStore`;
 * component-scoped, like all four.
 *
 * **It never notifies the user and never navigates** (ADR-0005, amendment
 * three). `save` returns the saved row and lets a failure throw; the page
 * decides what to toast and whether to return to the apply wizard.
 */
@Injectable()
export class CoverLetterDocumentStore {
  private readonly db = inject(DocumentsGateway);
  private readonly letter = inject(CoverLetterContentStore);
  private readonly styles = inject(CoverLetterStyleStore);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly doc = signal<DocumentLibraryItem | null>(null);

  readonly label = signal('');
  readonly regionTag = signal('generic');
  readonly isDefault = signal(false);

  readonly saving = signal(false);

  /**
   * Reads the document and hands its content and style to the two stores that
   * own them. Never rejects: a failure sets `loadError`, because the page
   * renders an error state rather than catching. A malformed `contentJson` or
   * `styleJson` throws out of `hydrate` and lands in the same place, which is
   * why the hydrate calls are inside the `try`.
   */
  async load(id: number): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const item = await this.db.documentLibraryGet(id);
      if (!item) {
        this.loadError.set(true);
        return;
      }
      this.doc.set(item);
      this.label.set(item.label ?? '');
      this.regionTag.set(item.regionTag ?? 'generic');
      this.isDefault.set(item.isDefault);

      this.letter.hydrate(item.contentJson);
      this.styles.hydrate(item.styleJson);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Writes the row. Returns the saved document, or `null` when there is nothing
   * to save or a save is already running - the caller must treat `null` as "no
   * write happened", not as failure. A gateway error propagates.
   *
   * Claiming the default flag displaces the siblings that hold it for the same
   * region first, so the invariant never briefly has two defaults.
   */
  async save(): Promise<DocumentLibraryItem | null> {
    const doc = this.doc();
    if (!doc || this.saving()) return null;
    this.saving.set(true);
    try {
      if (this.isDefault()) {
        const siblings = await this.db.documentLibraryList('cover_letter');
        for (const sibling of siblingsToUndefault(siblings, doc.id, this.regionTag())) {
          await this.db.documentLibraryUpsert({ ...sibling, id: sibling.id, isDefault: false });
        }
      }

      const saved = await this.db.documentLibraryUpsert(
        buildCoverLetterUpsert(doc, {
          label: this.label(),
          content: this.letter.content(),
          style: this.styles.style(),
          regionTag: this.regionTag(),
          isDefault: this.isDefault(),
        }),
      );
      this.doc.set(saved);
      return saved;
    } finally {
      this.saving.set(false);
    }
  }
}

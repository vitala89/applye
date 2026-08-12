import { Injectable, inject, signal } from '@angular/core';
import type {
  CvContent,
  CvSection,
  CvSectionKey,
  CvTemplate,
  DocumentLibraryItem,
} from '@applye/core';
import { normalizeCvContent } from '@applye/core';
import { DbService } from '@applye/data';
import { CvPhotoStore } from './cv-photo.store';
import { CvStyleStore } from './cv-style.store';
import { buildCvUpsert, cvSiblingsToUndefault } from './cv-document-record';
import { moveCvSection, reorderCvSections, replaceCvSection } from './cv-section-order';

/**
 * The CV row itself: what was loaded, what the editor has changed, and the one
 * write that persists it.
 *
 * **It owns the save, and that is why it injects the other two stores.**
 * `documentLibraryUpsert` takes a whole record, so three stores editing one CV
 * cannot each save their own slice without clobbering the others.
 * `CvPhotoStore` supplies the sections with its four toggles written in, and
 * `CvStyleStore` supplies the style and theme; this store assembles them into a
 * single row. Component-scoped, like both of them.
 *
 * **It never notifies the user** (ADR-0005, amendment three). `save` and
 * `confirmSaveTemplate` return their result and let a failure throw; the page
 * decides what to show and where to navigate afterwards.
 */
@Injectable()
export class CvDocumentStore {
  private readonly db = inject(DbService);
  private readonly photo = inject(CvPhotoStore);
  private readonly style = inject(CvStyleStore);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly doc = signal<DocumentLibraryItem | null>(null);
  readonly sections = signal<CvSection[]>([]);
  readonly templates = signal<CvTemplate[]>([]);

  readonly label = signal('');
  readonly regionTag = signal('generic');
  readonly isDefault = signal(false);

  readonly saving = signal(false);
  readonly saveTemplateOpen = signal(false);
  readonly saveTemplateName = signal('');
  readonly savingTemplate = signal(false);

  /**
   * Reads the document and the template list, and hands the loaded row to the
   * photo and style stores. Never rejects: a failure sets `loadError`, because
   * the page renders an error state rather than catching.
   */
  async load(id: number): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      // The photo itself lives on the profile now, and its store reads it: this
      // document only decides whether to show it and where.
      const [item, templates] = await Promise.all([
        this.db.documentLibraryGet(id),
        this.db.cvTemplatesList(),
        this.photo.loadProfilePhoto(),
      ]);
      if (!item) {
        this.loadError.set(true);
        return;
      }
      this.doc.set(item);
      this.templates.set(templates);
      this.label.set(item.label ?? '');
      this.regionTag.set(item.regionTag ?? 'generic');
      this.isDefault.set(item.isDefault);

      const raw: CvContent = item.contentJson ? JSON.parse(item.contentJson) : { sections: [] };
      const ordered = [...normalizeCvContent(raw).sections].sort((a, b) => a.order - b.order);
      this.sections.set(ordered);
      this.photo.hydrate(ordered);
      await this.style.hydrate(item.themeId, item.styleJson);
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
      const sections = this.photo.sectionsForSave(this.sections());
      this.sections.set(sections);

      if (this.isDefault()) {
        const siblings = await this.db.documentLibraryList('cv');
        for (const sibling of cvSiblingsToUndefault(siblings, doc.id, this.regionTag())) {
          await this.db.documentLibraryUpsert({ ...sibling, id: sibling.id, isDefault: false });
        }
      }

      const saved = await this.db.documentLibraryUpsert(
        buildCvUpsert(doc, {
          label: this.label(),
          sections,
          style: this.style.style(),
          themeId: this.style.themeId(),
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

  reorder(from: number, to: number): void {
    this.sections.set(reorderCvSections(this.sections(), from, to));
  }

  moveSection(key: CvSectionKey, offset: -1 | 1): void {
    this.sections.set(moveCvSection(this.sections(), key, offset));
  }

  replaceSection(updated: CvSection): void {
    this.sections.set(replaceCvSection(this.sections(), updated));
  }

  /** Takes a section list produced outside the ordering helpers - the photo
   * toggle returns one, and `withPhotoSection` already prepends the photo and
   * reindexes, so this deliberately does not re-pin on top of it. */
  setSections(list: readonly CvSection[]): void {
    this.sections.set([...list]);
  }

  openSaveTemplate(): void {
    this.saveTemplateName.set('');
    this.saveTemplateOpen.set(true);
  }

  cancelSaveTemplate(): void {
    this.saveTemplateOpen.set(false);
  }

  /**
   * Saves the current section order and photo toggles as a reusable template.
   * Returns `false` when there was nothing to do (no name, or already running);
   * a gateway error propagates.
   */
  async confirmSaveTemplate(): Promise<boolean> {
    const name = this.saveTemplateName().trim();
    if (!name || this.savingTemplate()) return false;
    this.savingTemplate.set(true);
    try {
      const orderedKeys = this.sections()
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => s.key);
      await this.db.cvTemplateUpsert({
        name,
        regionTag: this.regionTag(),
        sectionsJson: JSON.stringify(orderedKeys),
        includePhoto: this.photo.includePhoto(),
        includeBirthdate: this.photo.includeBirthdate(),
        includeMaritalStatus: this.photo.includeMaritalStatus(),
      });
      this.templates.set(await this.db.cvTemplatesList());
      this.saveTemplateOpen.set(false);
      return true;
    } finally {
      this.savingTemplate.set(false);
    }
  }
}

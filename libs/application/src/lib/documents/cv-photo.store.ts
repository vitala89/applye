import { Injectable, computed, inject, signal } from '@angular/core';
import type { CvSection, PhotoPlacement } from '@applye/core';
import { DbService } from '@applye/data';
import {
  type CvPhotoFlags,
  applyPhotoFlags,
  readPhotoFlags,
  withPhotoSection,
} from './cv-photo-sections';

/** The header slots a photo can occupy, and the label key for each. */
export const CV_PHOTO_PLACEMENTS: readonly { value: PhotoPlacement; labelKey: string }[] = [
  { value: 'above_left', labelKey: 'documents.cv_photo_placement_left' },
  { value: 'above_center', labelKey: 'documents.cv_photo_placement_center' },
  { value: 'above_right', labelKey: 'documents.cv_photo_placement_right' },
];

/**
 * Whether a CV shows a photo, where, and whether it carries a birth date or
 * marital status.
 *
 * **The image itself is not per-document.** One reusable photo lives on the
 * profile; this store reads it and falls back to bytes an older document already
 * carries, which is why `dataUri` is a `computed` over two sources rather than a
 * signal anyone writes. What stays per-document is whether to show it and where.
 *
 * **Component-scoped**, and it does not own the section list - `hydrate` reads
 * the four toggles out of a loaded document and `sectionsForSave` writes them
 * back, so the store that owns the row stays the only writer. That split exists
 * because `documentLibraryUpsert` takes a whole record: three stores editing one
 * CV cannot each save their own slice without clobbering the others.
 */
@Injectable()
export class CvPhotoStore {
  private readonly db = inject(DbService);

  readonly includePhoto = signal(false);
  readonly placement = signal<PhotoPlacement>('above_left');
  readonly includeBirthdate = signal(false);
  readonly includeMaritalStatus = signal(false);

  /** Photo bytes stored on THIS document, kept only so CVs written before the
   * photo moved to the profile keep rendering. New photos never land here. */
  private readonly legacyPhotoDataUri = signal<string | null>(null);
  /** The one reusable photo, from the profile. */
  readonly profilePhoto = signal<string | null>(null);

  /** The photo this CV renders: the profile's, or an older document's own. */
  readonly dataUri = computed(() => this.profilePhoto() ?? this.legacyPhotoDataUri());

  readonly placements = CV_PHOTO_PLACEMENTS;

  /** Reads the profile's photo. Silent on failure: a CV that cannot show its
   * photo is still a CV worth editing, and the document read reports its own. */
  async loadProfilePhoto(): Promise<void> {
    try {
      const profile = await this.db.getProfile();
      this.profilePhoto.set(profile?.photoDataUri ?? null);
    } catch (e) {
      console.error('cv-detail: profile photo read failed', e);
      this.profilePhoto.set(null);
    }
  }

  /** Takes the four toggles from a freshly loaded document. */
  hydrate(sections: readonly CvSection[]): void {
    const flags = readPhotoFlags(sections);
    this.includePhoto.set(flags.includePhoto);
    this.legacyPhotoDataUri.set(flags.legacyPhotoDataUri);
    this.placement.set(flags.placement);
    this.includeBirthdate.set(flags.includeBirthdate);
    this.includeMaritalStatus.set(flags.includeMaritalStatus);
  }

  setPlacement(placement: PhotoPlacement): void {
    this.placement.set(placement);
  }

  /**
   * Switches the photo on or off, and returns the section list the document
   * should now hold.
   *
   * Turning it **on** guarantees a `photo` section exists, because most
   * templates seed none and the upload card would otherwise have nothing to bind
   * to. Turning it **off** only hides it: the stored bytes stay, so switching
   * back on does not lose the image.
   */
  toggleIncludePhoto(sections: readonly CvSection[]): CvSection[] {
    const next = !this.includePhoto();
    this.includePhoto.set(next);
    return next ? withPhotoSection(sections, this.legacyPhotoDataUri()) : [...sections];
  }

  /** The sections as they should be saved, with the four toggles written in. */
  sectionsForSave(sections: readonly CvSection[]): CvSection[] {
    return applyPhotoFlags(sections, this.flags());
  }

  /** What the toggles currently say - also what the ATS notes are computed from. */
  flags(): CvPhotoFlags {
    return {
      includePhoto: this.includePhoto(),
      legacyPhotoDataUri: this.legacyPhotoDataUri(),
      placement: this.placement(),
      includeBirthdate: this.includeBirthdate(),
      includeMaritalStatus: this.includeMaritalStatus(),
    };
  }
}

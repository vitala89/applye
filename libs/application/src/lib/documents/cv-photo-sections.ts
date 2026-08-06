/**
 * The section-list side of a CV's photo and personal-details toggles.
 *
 * Pure and beside its store rather than in `libs/core`: these are not domain
 * rules about what a CV means, they are how four editor toggles are read out of
 * a section list and written back into one (ADR-0005, amendment two). Pure
 * because every one of them was previously inline in a 1019-line page class and
 * therefore untested.
 */
import type { CvSection, PhotoPlacement } from '@applye/core';

/** What the photo and personal-details sections say about the four toggles. */
export interface CvPhotoFlags {
  includePhoto: boolean;
  /** Photo bytes stored on the document itself, for CVs written before the
   * photo moved to the profile. Never written for a new photo. */
  legacyPhotoDataUri: string | null;
  placement: PhotoPlacement;
  includeBirthdate: boolean;
  includeMaritalStatus: boolean;
}

type PhotoSection = Extract<CvSection, { key: 'photo' }>;
type PersonalSection = Extract<CvSection, { key: 'personal_details' }>;

export function photoSectionOf(sections: readonly CvSection[]): PhotoSection | undefined {
  return sections.find((s): s is PhotoSection => s.key === 'photo');
}

export function personalSectionOf(sections: readonly CvSection[]): PersonalSection | undefined {
  return sections.find((s): s is PersonalSection => s.key === 'personal_details');
}

/**
 * Reads the four toggles out of a loaded section list.
 *
 * A missing photo section means "no photo", and a photo section with no
 * `placement` means `above_left` - the legacy inline top box, which is what
 * documents written before placement existed rendered as.
 */
export function readPhotoFlags(sections: readonly CvSection[]): CvPhotoFlags {
  const photo = photoSectionOf(sections);
  const personal = personalSectionOf(sections);
  return {
    includePhoto: photo?.visible ?? false,
    legacyPhotoDataUri: photo?.dataUri ?? null,
    placement: photo?.placement ?? 'above_left',
    includeBirthdate: !!personal?.birthDate,
    includeMaritalStatus: !!personal?.maritalStatus,
  };
}

/**
 * Guarantees a `photo` section exists, so the upload card has something to bind
 * to when the user switches the photo on - most templates seed no photo section
 * at all.
 *
 * Returns the list unchanged when one is already there, so a caller can use the
 * identity of the result to decide whether anything happened.
 */
export function withPhotoSection(
  sections: readonly CvSection[],
  legacyPhotoDataUri: string | null,
): CvSection[] {
  if (sections.some((s) => s.key === 'photo')) return [...sections];
  const photo: PhotoSection = {
    key: 'photo',
    order: 0,
    visible: true,
    dataUri: legacyPhotoDataUri ?? undefined,
  };
  return [photo, ...sections].map((s, index) => ({ ...s, order: index }));
}

/**
 * Writes the four toggles back into the sections about to be saved.
 *
 * Switching a field off **clears the value** rather than hiding it: an excluded
 * birth date or marital status must not survive in the saved document, because
 * the reason to exclude it is that it should not be there at all. The photo is
 * the opposite - `visible: false` keeps the stored bytes, so switching it back
 * on does not lose the image.
 */
export function applyPhotoFlags(sections: readonly CvSection[], flags: CvPhotoFlags): CvSection[] {
  return sections.map((section) => {
    if (section.key === 'photo') {
      return {
        ...section,
        visible: flags.includePhoto,
        dataUri: flags.legacyPhotoDataUri ?? undefined,
        placement: flags.placement,
      };
    }
    if (section.key === 'personal_details') {
      return {
        ...section,
        birthDate: flags.includeBirthdate ? section.birthDate : undefined,
        maritalStatus: flags.includeMaritalStatus ? section.maritalStatus : undefined,
      };
    }
    return section;
  });
}

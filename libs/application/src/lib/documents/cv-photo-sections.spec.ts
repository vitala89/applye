import type { CvSection } from '@applye/core';
import {
  applyPhotoFlags,
  personalSectionOf,
  photoSectionOf,
  readPhotoFlags,
  withPhotoSection,
} from './cv-photo-sections';

function photo(over: Partial<Extract<CvSection, { key: 'photo' }>> = {}): CvSection {
  return { key: 'photo', order: 0, visible: true, ...over } as CvSection;
}

function personal(over: Partial<Extract<CvSection, { key: 'personal_details' }>> = {}): CvSection {
  return { key: 'personal_details', order: 1, fullName: 'Ada Lovelace', ...over } as CvSection;
}

function summary(): CvSection {
  return { key: 'summary', order: 2, text: 'Engineer.' } as CvSection;
}

describe('readPhotoFlags', () => {
  it('reads the four toggles out of a loaded document', () => {
    expect(
      readPhotoFlags([
        photo({ visible: true, dataUri: 'data:image/jpeg;base64,x', placement: 'above_center' }),
        personal({ birthDate: '1815-12-10', maritalStatus: 'single' }),
      ]),
    ).toEqual({
      includePhoto: true,
      legacyPhotoDataUri: 'data:image/jpeg;base64,x',
      placement: 'above_center',
      includeBirthdate: true,
      includeMaritalStatus: true,
    });
  });

  /// A document written before placement existed rendered as the inline top box,
  /// so a missing placement must read as `above_left` and not as "unset".
  it('defaults a placement-less photo to above_left', () => {
    expect(readPhotoFlags([photo()]).placement).toBe('above_left');
  });

  it('reads no photo section as no photo', () => {
    expect(readPhotoFlags([personal(), summary()])).toEqual({
      includePhoto: false,
      legacyPhotoDataUri: null,
      placement: 'above_left',
      includeBirthdate: false,
      includeMaritalStatus: false,
    });
  });

  /// The toggles mean "does this document carry the field", so an empty string is
  /// off - otherwise a cleared field would come back switched on.
  it('treats an empty personal field as off', () => {
    const flags = readPhotoFlags([personal({ birthDate: '', maritalStatus: '' })]);
    expect(flags.includeBirthdate).toBe(false);
    expect(flags.includeMaritalStatus).toBe(false);
  });

  it('finds the two sections it reads, and nothing else', () => {
    const sections = [summary(), photo(), personal()];
    expect(photoSectionOf(sections)?.key).toBe('photo');
    expect(personalSectionOf(sections)?.key).toBe('personal_details');
    expect(photoSectionOf([summary()])).toBeUndefined();
    expect(personalSectionOf([summary()])).toBeUndefined();
  });
});

describe('withPhotoSection', () => {
  /// Most templates seed no photo section, so switching the photo on has to
  /// create one or the upload card has nothing to bind to.
  it('creates a photo section at the top and renumbers the rest', () => {
    const result = withPhotoSection([personal(), summary()], null);
    expect(result.map((s) => s.key)).toEqual(['photo', 'personal_details', 'summary']);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(photoSectionOf(result)?.visible).toBe(true);
  });

  it('carries the photo bytes an older document already had into the new section', () => {
    const result = withPhotoSection([personal()], 'data:image/jpeg;base64,legacy');
    expect(photoSectionOf(result)?.dataUri).toBe('data:image/jpeg;base64,legacy');
  });

  it('leaves a list that already has a photo section alone', () => {
    const sections = [photo({ order: 0, dataUri: 'kept' }), personal()];
    const result = withPhotoSection(sections, 'other');
    expect(result).toEqual(sections);
    expect(photoSectionOf(result)?.dataUri).toBe('kept');
  });

  it('does not mutate the list it was given', () => {
    const sections = [personal()];
    withPhotoSection(sections, null);
    expect(sections).toHaveLength(1);
  });
});

describe('applyPhotoFlags', () => {
  const flags = {
    includePhoto: false,
    legacyPhotoDataUri: 'data:image/jpeg;base64,legacy',
    placement: 'above_right' as const,
    includeBirthdate: false,
    includeMaritalStatus: false,
  };

  /// Switching the photo off hides it but keeps the bytes, so switching back on
  /// does not lose the image.
  it('hides the photo without dropping its bytes', () => {
    const result = applyPhotoFlags([photo({ visible: true }), personal()], flags);
    const saved = photoSectionOf(result);
    expect(saved?.visible).toBe(false);
    expect(saved?.dataUri).toBe('data:image/jpeg;base64,legacy');
    expect(saved?.placement).toBe('above_right');
  });

  /// The personal fields are the opposite: excluding one must clear it, because
  /// the reason to exclude it is that it should not be in the saved document.
  it('clears an excluded birth date and marital status', () => {
    const result = applyPhotoFlags(
      [personal({ birthDate: '1815-12-10', maritalStatus: 'single' })],
      flags,
    );
    const saved = personalSectionOf(result);
    expect(saved?.birthDate).toBeUndefined();
    expect(saved?.maritalStatus).toBeUndefined();
    expect(saved?.fullName).toBe('Ada Lovelace');
  });

  it('keeps an included birth date and marital status', () => {
    const result = applyPhotoFlags(
      [personal({ birthDate: '1815-12-10', maritalStatus: 'single' })],
      { ...flags, includeBirthdate: true, includeMaritalStatus: true },
    );
    const saved = personalSectionOf(result);
    expect(saved?.birthDate).toBe('1815-12-10');
    expect(saved?.maritalStatus).toBe('single');
  });

  /// Each field must read its own flag. Every case above sets the two the same
  /// way, so crossing them is invisible without this one.
  it('excludes one personal field while keeping the other', () => {
    const result = applyPhotoFlags(
      [personal({ birthDate: '1815-12-10', maritalStatus: 'single' })],
      { ...flags, includeBirthdate: true, includeMaritalStatus: false },
    );
    const saved = personalSectionOf(result);
    expect(saved?.birthDate).toBe('1815-12-10');
    expect(saved?.maritalStatus).toBeUndefined();
  });

  it('leaves every other section untouched', () => {
    const other = summary();
    expect(applyPhotoFlags([other], flags)).toEqual([other]);
  });
});

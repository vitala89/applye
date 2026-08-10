import { EMPTY_FORM, ProfileForm } from '@applye/core';
import {
  ParsedProfile,
  parsedContactPatch,
  parsedEducationEntries,
  parsedExperienceEntries,
  parsedLanguageEntries,
  parsedSkills,
} from './profile-parse.util';

function form(over: Partial<ProfileForm> = {}): ProfileForm {
  return { ...EMPTY_FORM, ...over };
}

describe('parsedContactPatch', () => {
  /** The headline rule: the AI omitting a field is not the user saying they
   * have none, so a blank parse keeps what is already there. */
  it('keeps the existing value for every field the parse left blank', () => {
    const current = form({
      name: 'Vitalii Kasap',
      title: 'Frontend Engineer',
      location: 'Kyiv',
      email: 'v@example.com',
      phone: '+380',
      website: 'example.com',
      linkedin: 'in/v',
    });
    expect(parsedContactPatch({}, current)).toEqual({
      name: 'Vitalii Kasap',
      title: 'Frontend Engineer',
      location: 'Kyiv',
      email: 'v@example.com',
      phone: '+380',
      website: 'example.com',
      linkedin: 'in/v',
    });
  });

  it('treats null, an empty string and whitespace as "the parse found nothing"', () => {
    const current = form({ title: 'Kept', location: 'Kept too', email: 'kept@example.com' });
    const patch = parsedContactPatch({ title: null, location: '', email: '   ' }, current);
    expect(patch.title).toBe('Kept');
    expect(patch.location).toBe('Kept too');
    expect(patch.email).toBe('kept@example.com');
  });

  it('overwrites with what the parse found, trimmed', () => {
    const patch = parsedContactPatch({ title: '  Staff Engineer  ' }, form({ title: 'Old' }));
    expect(patch.title).toBe('Staff Engineer');
  });
});

describe('the structured sections', () => {
  /** The opposite rule from the contact fields: applying the preview replaces
   * the sections wholesale, because the user has just read what it shows. */
  it('replaces with nothing when the parse has no sections at all', () => {
    const empty: ParsedProfile = {};
    expect(parsedExperienceEntries(empty)).toEqual([]);
    expect(parsedLanguageEntries(empty)).toEqual([]);
    expect(parsedEducationEntries(empty)).toEqual([]);
    expect(parsedSkills(empty)).toEqual([]);
  });

  it('fills every experience field, trimming, and drops blank bullets', () => {
    expect(
      parsedExperienceEntries({
        experience: [
          {
            role: '  Staff Engineer ',
            company: 'Acme',
            location: null,
            startDate: '2020',
            endDate: undefined,
            bullets: ['  shipped a thing  ', '', '   '],
          },
        ],
      }),
    ).toEqual([
      {
        role: 'Staff Engineer',
        company: 'Acme',
        location: '',
        startDate: '2020',
        endDate: '',
        bullets: ['shipped a thing'],
      },
    ]);
  });

  /** A level with no language names nothing, so it is not a row. */
  it('drops a language entry with no name but keeps one with no level', () => {
    expect(
      parsedLanguageEntries({
        languages: [
          { language: 'Ukrainian', level: 'Native' },
          { language: '  ', level: 'C1' },
          { language: 'German', level: null },
        ],
      }),
    ).toEqual([
      { language: 'Ukrainian', level: 'Native' },
      { language: 'German', level: '' },
    ]);
  });

  it('fills every education field, trimming', () => {
    expect(
      parsedEducationEntries({
        education: [{ title: ' MSc ', institution: null, startDate: '2016', endDate: '2018' }],
      }),
    ).toEqual([{ title: 'MSc', institution: '', startDate: '2016', endDate: '2018' }]);
  });

  it('trims skills and drops the blank ones', () => {
    expect(parsedSkills({ skills: [' Angular ', '', 'Rust', '   '] })).toEqual(['Angular', 'Rust']);
  });
});

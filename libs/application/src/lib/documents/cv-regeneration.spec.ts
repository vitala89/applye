import type { CvParsedContent } from '@applye/core';
import {
  CvNoProfileError,
  type PersonalDetailsSection,
  mergePersonalDetails,
  mergePersonalField,
  regenerationHashInput,
  resolveDocLanguage,
} from './cv-regeneration';

describe('mergePersonalField', () => {
  it('keeps the current value for an empty, blank or absent incoming one', () => {
    expect(mergePersonalField('', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField('   ', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField(undefined, 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField(null, 'Vitalii')).toBe('Vitalii');
  });

  it('takes a non-empty incoming value, untrimmed', () => {
    expect(mergePersonalField('New', 'Vitalii')).toBe('New');
    // The guard trims to decide, but the value is stored as it arrived.
    expect(mergePersonalField('  New  ', 'Vitalii')).toBe('  New  ');
  });

  it('leaves an absent current value absent when there is nothing to merge', () => {
    expect(mergePersonalField(undefined, undefined)).toBeUndefined();
  });
});

describe('mergePersonalDetails', () => {
  const section = {
    key: 'personal_details',
    order: 1,
    visible: true,
    fullName: 'Ada Lovelace',
    title: 'Analyst',
    email: 'ada@example.com',
    phone: '+49 111',
    address: 'Berlin',
    website: 'ada.dev',
    linkedin: 'in/ada',
    birthDate: '1815-12-10',
  } as PersonalDetailsSection;

  // Asymmetric on purpose: every one of the seven fields differs from every
  // other, and the incoming payload fills a DIFFERENT subset than it blanks -
  // so a merge that reads the wrong field, or applies one field's decision to
  // all of them, changes an assertion rather than matching by luck.
  const parsed = {
    fullName: 'Ada King',
    title: '',
    email: '   ',
    phone: '+49 222',
    address: undefined,
    website: null,
    linkedin: 'in/ada-king',
  } as unknown as CvParsedContent['personalDetails'];

  it('takes the filled incoming fields and keeps the current ones for the rest', () => {
    expect(mergePersonalDetails(section, parsed)).toMatchObject({
      fullName: 'Ada King',
      title: 'Analyst',
      email: 'ada@example.com',
      phone: '+49 222',
      address: 'Berlin',
      website: 'ada.dev',
      linkedin: 'in/ada-king',
    });
  });

  it('carries over the fields the merge does not touch', () => {
    expect(mergePersonalDetails(section, parsed)).toMatchObject({
      key: 'personal_details',
      order: 1,
      visible: true,
      birthDate: '1815-12-10',
    });
  });

  it('returns a NEW section and does not mutate the one it was given', () => {
    const next = mergePersonalDetails(section, parsed);
    expect(next).not.toBe(section);
    expect(section.fullName).toBe('Ada Lovelace');
  });
});

describe('regenerationHashInput', () => {
  it('joins every input that changes what the model would be asked', () => {
    expect(regenerationHashInput('MD', 'de', 'generalist', 'en', 'summary')).toBe(
      'MD|de|generalist|en|summary',
    );
  });

  it('changes when any single component changes', () => {
    const base = regenerationHashInput('MD', 'de', 'generalist', 'en', 'summary');
    // Each variant differs from `base` in exactly one position, so a hash input
    // that drops a component fails on that component alone.
    expect(regenerationHashInput('MD2', 'de', 'generalist', 'en', 'summary')).not.toBe(base);
    expect(regenerationHashInput('MD', 'us', 'generalist', 'en', 'summary')).not.toBe(base);
    expect(regenerationHashInput('MD', 'de', 'specialist', 'en', 'summary')).not.toBe(base);
    expect(regenerationHashInput('MD', 'de', 'generalist', 'de', 'summary')).not.toBe(base);
    expect(regenerationHashInput('MD', 'de', 'generalist', 'en', 'skills')).not.toBe(base);
  });
});

describe('resolveDocLanguage', () => {
  it('prefers the document, then the setting, then English', () => {
    expect(resolveDocLanguage('de', 'pl')).toBe('de');
    expect(resolveDocLanguage(undefined, 'pl')).toBe('pl');
    expect(resolveDocLanguage(undefined, undefined)).toBe('en');
  });
});

describe('CvNoProfileError', () => {
  it('is an Error the page can identify without matching on a message', () => {
    const e = new CvNoProfileError();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(CvNoProfileError);
    expect(e.name).toBe('CvNoProfileError');
  });
});

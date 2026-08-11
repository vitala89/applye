import type {
  CvEducationSection,
  CvExperienceSection,
  CvLanguagesSection,
  CvSkillsSection,
} from '../models/document.model';
import {
  blankEducationEntry,
  blankExperienceEntry,
  parseSkillValues,
  replaceEducationEntryField,
  replaceExperienceBullet,
  replaceExperienceEntryField,
  replaceLanguageValue,
  replaceSkillGroupLabel,
  replaceSkillGroupValues,
} from './cv-entry.util';

describe('blank entry factories', () => {
  it('creates an empty experience entry with an empty bullet', () => {
    expect(blankExperienceEntry()).toEqual({
      company: '',
      role: '',
      startDate: '',
      endDate: '',
      location: '',
      bullets: [''],
    });
  });
  it('creates an empty education entry', () => {
    expect(blankEducationEntry()).toEqual({
      institution: '',
      degree: '',
      startDate: '',
      endDate: '',
    });
  });
});

describe('replaceExperienceEntryField', () => {
  const section: CvExperienceSection = {
    key: 'experience',
    order: 0,
    visible: true,
    entries: [
      { company: 'Acme', role: 'Dev', startDate: '2020', endDate: '2021', bullets: ['one'] },
      { company: 'Globex', role: 'Lead', startDate: '2021', bullets: ['two', 'three'] },
    ],
  };

  it('replaces only the targeted field of the targeted entry', () => {
    const updated = replaceExperienceEntryField(section, 1, 'company', 'Initech');
    expect(updated.entries[1].company).toBe('Initech');
    expect(updated.entries[1]).toMatchObject({ role: 'Lead', startDate: '2021' });
  });

  it('leaves the original section and untouched entries unchanged (same references)', () => {
    const untouchedEntry = section.entries[0];
    const updated = replaceExperienceEntryField(section, 1, 'company', 'Initech');
    expect(updated).not.toBe(section);
    expect(updated.entries).not.toBe(section.entries);
    expect(updated.entries[0]).toBe(untouchedEntry);
    expect(section.entries[1].company).toBe('Globex'); // original untouched
  });

  it('supports every editable experience field', () => {
    expect(replaceExperienceEntryField(section, 0, 'industry', 'SaaS').entries[0].industry).toBe(
      'SaaS',
    );
    expect(replaceExperienceEntryField(section, 0, 'location', 'Berlin').entries[0].location).toBe(
      'Berlin',
    );
    expect(replaceExperienceEntryField(section, 0, 'role', 'Staff Dev').entries[0].role).toBe(
      'Staff Dev',
    );
    expect(replaceExperienceEntryField(section, 0, 'startDate', '2019').entries[0].startDate).toBe(
      '2019',
    );
    expect(replaceExperienceEntryField(section, 0, 'endDate', '2022').entries[0].endDate).toBe(
      '2022',
    );
  });
});

describe('replaceExperienceBullet', () => {
  const section: CvExperienceSection = {
    key: 'experience',
    order: 0,
    visible: true,
    entries: [
      { company: 'Acme', role: 'Dev', startDate: '2020', bullets: ['one', 'two'] },
      { company: 'Globex', role: 'Lead', startDate: '2021', bullets: ['three'] },
    ],
  };

  it('replaces only the targeted bullet of the targeted entry', () => {
    const updated = replaceExperienceBullet(section, 0, 1, 'two, edited');
    expect(updated.entries[0].bullets).toEqual(['one', 'two, edited']);
  });

  it('leaves every other entry and every other bullet unchanged (same references)', () => {
    const untouchedEntry = section.entries[1];
    const updated = replaceExperienceBullet(section, 0, 1, 'two, edited');
    expect(updated.entries[1]).toBe(untouchedEntry);
    expect(updated.entries[0].bullets[0]).toBe('one');
    expect(section.entries[0].bullets[1]).toBe('two'); // original untouched
  });
});

describe('replaceEducationEntryField', () => {
  const section: CvEducationSection = {
    key: 'education',
    order: 0,
    visible: true,
    entries: [
      { institution: 'MIT', degree: 'BSc', startDate: '2016', endDate: '2020' },
      { institution: 'Stanford', degree: 'MSc', startDate: '2020' },
    ],
  };

  it('replaces only the targeted field of the targeted entry', () => {
    const updated = replaceEducationEntryField(section, 0, 'degree', 'BA');
    expect(updated.entries[0].degree).toBe('BA');
    expect(updated.entries[0].institution).toBe('MIT');
  });

  it('leaves the original section and untouched entries unchanged', () => {
    const untouchedEntry = section.entries[1];
    const updated = replaceEducationEntryField(section, 0, 'institution', 'Harvard');
    expect(updated.entries[1]).toBe(untouchedEntry);
    expect(section.entries[0].institution).toBe('MIT'); // original untouched
  });

  it('supports startDate and endDate', () => {
    expect(replaceEducationEntryField(section, 1, 'startDate', '2021').entries[1].startDate).toBe(
      '2021',
    );
    expect(replaceEducationEntryField(section, 0, 'endDate', '2021').entries[0].endDate).toBe(
      '2021',
    );
  });
});

describe('skill group replacement', () => {
  const section: CvSkillsSection = {
    key: 'skills',
    order: 0,
    visible: true,
    groups: [
      { label: 'Languages', values: ['TypeScript', 'Rust'] },
      { label: 'Tools', values: ['Git'] },
    ],
  };

  it('replaceSkillGroupLabel replaces only the targeted group label', () => {
    const updated = replaceSkillGroupLabel(section, 1, 'DevOps');
    expect(updated.groups[1]).toMatchObject({ label: 'DevOps', values: ['Git'] });
    expect(updated.groups[0]).toBe(section.groups[0]); // untouched group same reference
  });

  it('replaceSkillGroupValues replaces only the targeted group values array', () => {
    const untouchedGroup = section.groups[1];
    const updated = replaceSkillGroupValues(section, 0, ['TypeScript', 'Angular']);
    expect(updated.groups[0].values).toEqual(['TypeScript', 'Angular']);
    expect(updated.groups[1]).toBe(untouchedGroup);
    expect(section.groups[0].values).toEqual(['TypeScript', 'Rust']); // original untouched
  });

  it('parseSkillValues splits, trims, and drops empty entries', () => {
    expect(parseSkillValues('TypeScript, Rust ,  , Go')).toEqual(['TypeScript', 'Rust', 'Go']);
  });
});

describe('replaceLanguageValue', () => {
  const section: CvLanguagesSection = {
    key: 'languages',
    order: 0,
    visible: true,
    items: [
      { language: 'English', level: 'C2' },
      { language: 'German', level: 'B1' },
    ],
  };

  it('replaces only the targeted language value, leaving level untouched', () => {
    const updated = replaceLanguageValue(section, 1, 'Deutsch');
    expect(updated.items[1]).toEqual({ language: 'Deutsch', level: 'B1' });
    expect(updated.items[0]).toBe(section.items[0]); // untouched item same reference
  });

  it('leaves the original section unchanged', () => {
    replaceLanguageValue(section, 0, 'Anglais');
    expect(section.items[0].language).toBe('English');
  });
});

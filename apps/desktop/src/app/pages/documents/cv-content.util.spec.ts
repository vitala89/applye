import type {
  CvContent,
  CvEducationSection,
  CvExperienceSection,
  CvLanguagesSection,
  CvParsedContent,
  CvPersonalDetailsSection,
  CvSection,
  CvSkillsSection,
  CvTemplate,
} from '@applye/core';
import {
  blankEducationEntry,
  blankExperienceEntry,
  buildContactLine,
  buildCvContent,
  cleanJsonText,
  cvContentToMd,
  effectiveLeafStyle,
  effectiveSectionStyle,
  effectiveTitleStyle,
  buildAdditionalInfoBlock,
  clearSectionElementOverrides,
  effectiveTitleBorder,
  effectiveTitleRuleColor,
  effectiveTitleRuleWidth,
  leafPath,
  mergeRegeneratedSection,
  normalizeCvContent,
  parseCvGapResponse,
  parseCvSkillResponse,
  parseDateAnswer,
  parseSkillValues,
  patchCvDocumentBody,
  patchCvElementStyle,
  patchCvSectionStyle,
  repairTruncatedJson,
  replaceEducationEntryField,
  replaceExperienceBullet,
  replaceExperienceEntryField,
  replaceLanguageValue,
  replaceSkillGroupLabel,
  replaceSkillGroupValues,
  resetCvElementStyle,
  resetCvSectionStyle,
  resolvePageSettings,
  visiblePersonalContactFields,
  withCvPhoto,
} from './cv-content.util';
import { CV_STYLE_DEFAULT, CvStyle } from '@applye/core';

describe('cleanJsonText', () => {
  it('extracts a fenced JSON object unchanged', () => {
    const text = '```json\n{"a": 1}\n```';
    expect(JSON.parse(cleanJsonText(text))).toEqual({ a: 1 });
  });

  it('extracts a fenced JSON array without swallowing the outer brackets', () => {
    const text = '```json\n[{"question": "Q1"}, {"question": "Q2"}]\n```';
    expect(JSON.parse(cleanJsonText(text))).toEqual([{ question: 'Q1' }, { question: 'Q2' }]);
  });

  it('extracts an unfenced array with surrounding prose stripped', () => {
    const text = 'Here you go:\n[{"a": 1}]\nEnjoy.';
    expect(JSON.parse(cleanJsonText(text))).toEqual([{ a: 1 }]);
  });
});

describe('parseDateAnswer', () => {
  const dash = String.fromCharCode(0x2013); // en dash, kept out of source per house rule

  it('splits a spaced hyphen range into start and end', () => {
    expect(parseDateAnswer('2019 - 2021')).toEqual({ startDate: '2019', endDate: '2021' });
  });

  it('treats a trailing "Present" as an open (empty) end date', () => {
    expect(parseDateAnswer('Jan 2021 - Present')).toEqual({ startDate: 'Jan 2021', endDate: '' });
    expect(parseDateAnswer('Jan 2021 - heute')).toEqual({ startDate: 'Jan 2021', endDate: '' });
  });

  it('handles "to"/"bis" separators', () => {
    expect(parseDateAnswer('March 2020 to July 2022')).toEqual({
      startDate: 'March 2020',
      endDate: 'July 2022',
    });
  });

  it('splits an en-dash range even without surrounding spaces', () => {
    expect(parseDateAnswer(`2019${dash}2021`)).toEqual({ startDate: '2019', endDate: '2021' });
  });

  it('keeps an internal hyphen (01-2021) intact when unspaced', () => {
    expect(parseDateAnswer('01-2021')).toEqual({ startDate: '01-2021', endDate: '' });
  });

  it('returns a lone start with an empty end', () => {
    expect(parseDateAnswer('2018')).toEqual({ startDate: '2018', endDate: '' });
  });

  it('returns two empty strings for a blank answer', () => {
    expect(parseDateAnswer('   ')).toEqual({ startDate: '', endDate: '' });
  });
});

describe('normalizeCvContent', () => {
  it('migrates a legacy items[] skills section into a single group', () => {
    const legacy = {
      sections: [{ key: 'skills', order: 0, visible: true, items: ['TypeScript', 'Rust'] }],
    } as unknown as CvContent;
    const out = normalizeCvContent(legacy);
    const skills = out.sections.find((s) => s.key === 'skills') as {
      key: 'skills';
      groups: { label: string; values: string[] }[];
    };
    expect(skills.groups).toEqual([{ label: 'Skills', values: ['TypeScript', 'Rust'] }]);
    expect((skills as Record<string, unknown>)['items']).toBeUndefined();
  });

  it('leaves an already-grouped skills section untouched', () => {
    const modern = {
      sections: [
        {
          key: 'skills',
          order: 0,
          visible: true,
          groups: [{ label: 'Languages', values: ['TS'] }],
        },
      ],
    } as unknown as CvContent;
    const out = normalizeCvContent(modern);
    // order shifts by 1 because personal_details is now guaranteed to be
    // prepended when the stored content lacks one — everything else on the
    // skills section (key, visible, groups) is untouched.
    expect(out.sections.find((s) => s.key === 'skills')).toEqual({
      ...modern.sections[0],
      order: 1,
    });
  });
});

describe('buildContactLine', () => {
  const base: CvPersonalDetailsSection = {
    key: 'personal_details',
    order: 0,
    visible: true,
    fullName: 'Vitalii Kasap',
    address: 'Nuremberg, Germany',
    phone: '+49 171 206 4899',
    email: 'v@icloud.com',
    website: 'vitaliikasap.com',
    linkedin: 'linkedin.com/in/vitaliikasap',
  };

  it('joins present fields with a pipe in reference order', () => {
    expect(buildContactLine(base, { includeBirthdate: false, includeMaritalStatus: false })).toBe(
      'Nuremberg, Germany | +49 171 206 4899 | v@icloud.com | vitaliikasap.com | linkedin.com/in/vitaliikasap',
    );
  });

  it('omits empty fields with no dangling separators', () => {
    expect(
      buildContactLine(
        { ...base, website: undefined, linkedin: '' },
        { includeBirthdate: false, includeMaritalStatus: false },
      ),
    ).toBe('Nuremberg, Germany | +49 171 206 4899 | v@icloud.com');
  });

  it('includes birthdate/marital only when toggled on', () => {
    const withExtra = { ...base, birthDate: '1990-01-01', maritalStatus: 'single' };
    expect(
      buildContactLine(withExtra, { includeBirthdate: true, includeMaritalStatus: true }),
    ).toContain('1990-01-01 | single');
    expect(
      buildContactLine(withExtra, { includeBirthdate: false, includeMaritalStatus: false }),
    ).not.toContain('1990-01-01');
  });
});

describe('visiblePersonalContactFields', () => {
  const base: CvPersonalDetailsSection = {
    key: 'personal_details',
    order: 0,
    visible: true,
    fullName: 'Vitalii Kasap',
    address: 'Nuremberg, Germany',
    phone: '+49 171 206 4899',
    email: 'v@icloud.com',
    website: 'vitaliikasap.com',
    linkedin: 'linkedin.com/in/vitaliikasap',
  };

  it('returns the base contact fields in reference order, matching buildContactLine', () => {
    const leaves = visiblePersonalContactFields(base, {
      includeBirthdate: false,
      includeMaritalStatus: false,
    });
    expect(leaves.map((l) => l.field)).toEqual([
      'address',
      'phone',
      'email',
      'website',
      'linkedin',
    ]);
    expect(leaves.map((l) => l.value).join(' | ')).toBe(
      buildContactLine(base, { includeBirthdate: false, includeMaritalStatus: false }),
    );
  });

  it('omits empty base fields — no leaf for a field with no content', () => {
    const leaves = visiblePersonalContactFields(
      { ...base, website: undefined, linkedin: '' },
      { includeBirthdate: false, includeMaritalStatus: false },
    );
    expect(leaves.map((l) => l.field)).toEqual(['address', 'phone', 'email']);
  });

  it('includes birthDate/maritalStatus leaves once toggled on, even when empty', () => {
    const withoutValues = visiblePersonalContactFields(base, {
      includeBirthdate: true,
      includeMaritalStatus: true,
    });
    expect(withoutValues.map((l) => l.field)).toEqual([
      'address',
      'phone',
      'email',
      'website',
      'linkedin',
      'birthDate',
      'maritalStatus',
    ]);
    expect(withoutValues.find((l) => l.field === 'birthDate')?.value).toBe('');

    const toggledOff = visiblePersonalContactFields(
      { ...base, birthDate: '1990-01-01', maritalStatus: 'single' },
      { includeBirthdate: false, includeMaritalStatus: false },
    );
    expect(toggledOff.map((l) => l.field)).not.toContain('birthDate');
    expect(toggledOff.map((l) => l.field)).not.toContain('maritalStatus');
  });
});

function parsed(over: Partial<CvParsedContent> = {}): CvParsedContent {
  return {
    personalDetails: {
      fullName: 'Vitalii Kasap',
      title: 'Senior Frontend Software Engineer',
      email: 'v@icloud.com',
      phone: null,
      address: 'Nuremberg',
      website: 'vitaliikasap.com',
      linkedin: 'linkedin.com/in/vitaliikasap',
    },
    summary: 'Senior FE engineer.',
    experience: [],
    education: [],
    skills: [],
    skillGroups: [
      { label: 'Languages', values: ['TypeScript', 'JavaScript'] },
      { label: 'Frameworks', values: ['Angular', 'React'] },
    ],
    languages: [],
    lowConfidenceNotes: [],
    ...over,
  };
}

describe('buildCvContent (enriched)', () => {
  const template = null as unknown as CvTemplate | null;

  it('maps title/website/linkedin onto personal_details', () => {
    const content = buildCvContent(parsed(), template);
    const pd = content.sections.find((s) => s.key === 'personal_details') as Record<
      string,
      unknown
    >;
    expect(pd['title']).toBe('Senior Frontend Software Engineer');
    expect(pd['website']).toBe('vitaliikasap.com');
    expect(pd['linkedin']).toBe('linkedin.com/in/vitaliikasap');
  });

  it('uses skillGroups when present', () => {
    const content = buildCvContent(parsed(), template);
    const skills = content.sections.find((s) => s.key === 'skills') as {
      groups: { label: string }[];
    };
    expect(skills.groups.map((g) => g.label)).toEqual(['Languages', 'Frameworks']);
  });

  it('wraps flat skills into one group when skillGroups is absent', () => {
    const content = buildCvContent(
      parsed({ skillGroups: undefined, skills: ['TS', 'Rust'] }),
      template,
    );
    const skills = content.sections.find((s) => s.key === 'skills') as {
      groups: { label: string; values: string[] }[];
    };
    expect(skills.groups).toEqual([{ label: 'Skills', values: ['TS', 'Rust'] }]);
  });
});

describe('parseCvSkillResponse (enriched)', () => {
  it('fills missing new personal fields with null, not undefined', () => {
    const out = parseCvSkillResponse('{"personalDetails":{"fullName":"A"}}');
    expect(out.personalDetails.title).toBeNull();
    expect(out.personalDetails.website).toBeNull();
    expect(out.personalDetails.linkedin).toBeNull();
  });

  it('reads skillGroups from the model JSON', () => {
    const out = parseCvSkillResponse('{"skillGroups":[{"label":"Data","values":["SQL"]}]}');
    expect(out.skillGroups).toEqual([{ label: 'Data', values: ['SQL'] }]);
  });
});

describe('cvContentToMd (grouped skills)', () => {
  it('renders each skill group as a labelled line', () => {
    const md = cvContentToMd(buildCvContent(parsed(), null as unknown as CvTemplate | null));
    expect(md).toContain('**Languages:** TypeScript, JavaScript');
    expect(md).toContain('**Frameworks:** Angular, React');
  });

  it('includes title, website, and linkedin in the header/contact lines', () => {
    const md = cvContentToMd(buildCvContent(parsed(), null as unknown as CvTemplate | null));
    expect(md).toContain('_Senior Frontend Software Engineer_');
    expect(md).toContain('vitaliikasap.com');
    expect(md).toContain('linkedin.com/in/vitaliikasap');
  });
});

describe('cv-generate-baseline output → content', () => {
  const sample = JSON.stringify({
    personalDetails: {
      fullName: 'Vitalii Kasap',
      title: 'Senior Frontend Software Engineer',
      email: 'v@icloud.com',
      phone: '+49 171 206 4899',
      address: 'Nuremberg, Germany',
      website: 'vitaliikasap.com',
      linkedin: 'linkedin.com/in/vitaliikasap',
    },
    summary: 'Senior FE engineer with 5+ years.',
    experience: [
      {
        company: 'Celonis',
        role: 'Senior FE Engineer',
        startDate: 'Jan 2026',
        endDate: 'Jun 2026',
        location: 'Munich',
        bullets: ['Cut bundle size by **25%**'],
      },
    ],
    education: [],
    skills: ['TypeScript', 'Angular'],
    skillGroups: [
      { label: 'Languages', values: ['TypeScript'] },
      { label: 'Frameworks', values: ['Angular'] },
    ],
    languages: [{ language: 'English', level: 'C1' }],
    lowConfidenceNotes: [],
  });

  it('parses and builds a full enriched CvContent', () => {
    const content = buildCvContent(
      parseCvSkillResponse(sample),
      null as unknown as CvTemplate | null,
    );
    const pd = content.sections.find((s) => s.key === 'personal_details') as Record<
      string,
      unknown
    >;
    const skills = content.sections.find((s) => s.key === 'skills') as {
      groups: { label: string }[];
    };
    expect(pd['title']).toBe('Senior Frontend Software Engineer');
    expect(pd['website']).toBe('vitaliikasap.com');
    expect(pd['linkedin']).toBe('linkedin.com/in/vitaliikasap');
    expect(skills.groups.map((g) => g.label)).toEqual(['Languages', 'Frameworks']);

    const parsedSample = parseCvSkillResponse(sample);
    expect(parsedSample.skills).toEqual(['TypeScript', 'Angular']);

    const experience = content.sections.find((s) => s.key === 'experience') as {
      entries: { bullets: string[] }[];
    };
    expect(experience.entries[0].bullets[0]).toContain('**25%**');
  });
});

function parsedMin(): CvParsedContent {
  return {
    personalDetails: {
      fullName: 'Vitalii Kasap',
      title: null,
      email: null,
      phone: null,
      address: null,
      website: null,
      linkedin: null,
    },
    summary: null,
    experience: [],
    education: [],
    skills: [],
    skillGroups: undefined,
    languages: [],
    lowConfidenceNotes: [],
  };
}

describe('buildCvContent personal_details guarantee', () => {
  it('forces personal_details first when the template omits it', () => {
    const template = {
      id: 1,
      sectionsJson: JSON.stringify(['summary', 'experience', 'skills']),
      includePhoto: false,
      includeBirthdate: false,
      includeMaritalStatus: false,
      isBuiltin: true,
    } as CvTemplate;
    const content = buildCvContent(parsedMin(), template);
    expect(content.sections[0].key).toBe('personal_details');
    expect(content.sections[0].order).toBe(0);
    const pd = content.sections[0] as Record<string, unknown>;
    expect(pd['fullName']).toBe('Vitalii Kasap');
    expect(content.sections.map((s) => s.key)).toEqual([
      'personal_details',
      'summary',
      'experience',
      'skills',
    ]);
  });

  it('keeps template order when personal_details is already present', () => {
    const template = {
      id: 1,
      sectionsJson: JSON.stringify(['personal_details', 'summary']),
      includePhoto: false,
      includeBirthdate: false,
      includeMaritalStatus: false,
      isBuiltin: true,
    } as CvTemplate;
    const content = buildCvContent(parsedMin(), template);
    expect(content.sections.map((s) => s.key)).toEqual(['personal_details', 'summary']);
  });
});

describe('normalizeCvContent personal_details', () => {
  it('adds an empty personal_details section when a stored CV lacks one', () => {
    const legacy = {
      sections: [{ key: 'summary', order: 0, visible: true, text: 'hi' }],
    } as unknown as CvContent;
    const out = normalizeCvContent(legacy);
    expect(out.sections.some((s) => s.key === 'personal_details')).toBe(true);
    const pd = out.sections.find((s) => s.key === 'personal_details') as Record<string, unknown>;
    expect(pd['fullName']).toBe('');
    expect(pd['order']).toBe(0);
  });
});

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

describe('repairTruncatedJson', () => {
  it('returns already-valid JSON unchanged (parseable)', () => {
    const s = '{"a":1,"b":[2,3]}';
    expect(JSON.parse(repairTruncatedJson(s)!)).toEqual({ a: 1, b: [2, 3] });
  });
  it('recovers a value truncated mid-string', () => {
    const truncated = '{"fullName":"VITALII KASAP","summary":"Senior Frontend Engineer specializ';
    const repaired = repairTruncatedJson(truncated)!;
    const obj = JSON.parse(repaired);
    expect(obj.fullName).toBe('VITALII KASAP');
    expect(typeof obj.summary).toBe('string');
  });
  it('recovers a truncated array of objects', () => {
    const truncated = '{"experience":[{"company":"A","role":"Dev"},{"company":"B","role":"Le';
    const obj = JSON.parse(repairTruncatedJson(truncated)!);
    expect(obj.experience[0]).toEqual({ company: 'A', role: 'Dev' });
    expect(Array.isArray(obj.experience)).toBe(true);
  });
  it('returns null when there is no JSON object at all', () => {
    expect(repairTruncatedJson('totally not json')).toBeNull();
  });
  it('repairTruncatedJson keeps a colon inside a truncated string value', () => {
    // string value cut off mid-word after a colon — the ":" is inside the string, not a dangling separator
    const raw = '{"summary":"Led migration: scale';
    const repaired = repairTruncatedJson(raw);
    expect(repaired).not.toBeNull();
    const obj = JSON.parse(repaired as string);
    expect(obj.summary).toBe('Led migration: scale');
  });
  it('repairTruncatedJson keeps a trailing colon truncated inside a string value', () => {
    // truncation lands exactly on the ":" while still inside the open string —
    // the dangling-separator guard must not fire here, or the ":" is dropped
    const raw = '{"summary":"Led migration:';
    const repaired = repairTruncatedJson(raw);
    expect(repaired).not.toBeNull();
    const obj = JSON.parse(repaired as string);
    expect(obj.summary).toBe('Led migration:');
  });
});

describe('parseCvSkillResponse repair fallback', () => {
  it('recovers personalDetails from a truncated response', () => {
    const truncated =
      '{"personalDetails":{"fullName":"VITALII KASAP","email":null,"phone":"+49","address":"Nuremberg"},"summary":"Senior Frontend Software Engineer (7+ years) specializ';
    const out = parseCvSkillResponse(truncated);
    expect(out.personalDetails.fullName).toBe('VITALII KASAP');
    expect(out.personalDetails.address).toBe('Nuremberg');
  });
});

describe('cv-import output → content', () => {
  it('parses the enriched import shape into a full CvContent', () => {
    const sample = JSON.stringify({
      personalDetails: {
        fullName: 'VITALII KASAP',
        title: 'Senior Frontend Software Engineer',
        email: null,
        phone: '+49 171 206 4899',
        address: 'Nuremberg, Germany',
        website: 'vitaliikasap.com',
        linkedin: 'linkedin.com/in/vitaliikasap',
      },
      summary: 'Senior Frontend Engineer with 5+ years.',
      experience: [
        {
          company: 'Celonis',
          role: 'Senior FE Engineer',
          startDate: 'Jan 2026',
          endDate: 'Jun 2026',
          location: 'Munich',
          bullets: ['Led Performance Spectrum to GA'],
        },
      ],
      education: [],
      skills: ['TypeScript'],
      skillGroups: [{ label: 'Languages', values: ['TypeScript'] }],
      languages: [{ language: 'English', level: 'C1' }],
      lowConfidenceNotes: [],
    });
    const content = buildCvContent(
      parseCvSkillResponse(sample),
      null as unknown as CvTemplate | null,
    );
    const pd = content.sections.find((s) => s.key === 'personal_details') as Record<
      string,
      unknown
    >;
    expect(pd['fullName']).toBe('VITALII KASAP');
    expect(pd['website']).toBe('vitaliikasap.com');
    expect(pd['linkedin']).toBe('linkedin.com/in/vitaliikasap');
  });
});

describe('effectiveSectionStyle', () => {
  const base: CvStyle = { ...CV_STYLE_DEFAULT }; // fontFamily Calibri, fontSizePt 11, accentColorHex #333333, fontWeight 400

  it('inherits global when no override', () => {
    expect(effectiveSectionStyle(base, 'summary')).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 11,
      fontWeight: 400,
      colorHex: '#333333',
    });
  });

  it('applies per-field override, inherits the rest', () => {
    const s: CvStyle = {
      ...base,
      sectionStyles: { experience: { fontSizePt: 12, fontWeight: 700 } },
    };
    expect(effectiveSectionStyle(s, 'experience')).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 12,
      fontWeight: 700,
      colorHex: '#333333',
    });
  });

  it('colorHex falls back to accent, or uses override', () => {
    expect(effectiveSectionStyle(base, 'skills').colorHex).toBe('#333333');
    const s: CvStyle = { ...base, sectionStyles: { skills: { colorHex: '#0a5' } } };
    expect(effectiveSectionStyle(s, 'skills').colorHex).toBe('#0a5');
  });

  it('preserves the CSS baseline when line height is absent and resolves an explicit override', () => {
    expect(effectiveSectionStyle(base, 'summary').lineHeight).toBeUndefined();
    const s: CvStyle = { ...base, sectionStyles: { summary: { lineHeight: 1.6 } } };
    expect(effectiveSectionStyle(s, 'summary').lineHeight).toBe(1.6);
  });

  it('ignores loaded line heights outside the supported 1.0–2.0 range', () => {
    const low: CvStyle = { ...base, sectionStyles: { summary: { lineHeight: 0.9 } } };
    const high: CvStyle = { ...base, sectionStyles: { summary: { lineHeight: 2.1 } } };
    const nonFinite: CvStyle = {
      ...base,
      sectionStyles: { summary: { lineHeight: Number.NaN } },
    };
    expect(effectiveSectionStyle(low, 'summary').lineHeight).toBeUndefined();
    expect(effectiveSectionStyle(high, 'summary').lineHeight).toBeUndefined();
    expect(effectiveSectionStyle(nonFinite, 'summary').lineHeight).toBeUndefined();
  });

  it('legacy style_json (no fontWeight) defaults to 400 after CV_STYLE_DEFAULT merge', () => {
    const legacy = { fontFamily: 'Arial', fontSizePt: 10, accentColorHex: '#111111' };
    const merged: CvStyle = { ...CV_STYLE_DEFAULT, ...legacy };
    expect(effectiveSectionStyle(merged, 'summary').fontWeight).toBe(400);
    expect(effectiveSectionStyle(merged, 'summary').fontFamily).toBe('Arial');
  });
});

describe('patchCvSectionStyle', () => {
  it('deep-merges title changes and recursively prunes inherited empty overrides', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: {
        summary: {
          fontFamily: 'Arial',
          colorHex: '#111111',
          title: { fontSizePt: 14, colorHex: '#222222' },
        },
      },
    };

    const changed = patchCvSectionStyle(original, 'summary', {
      fontFamily: undefined,
      title: { colorHex: undefined, fontWeight: 700 },
    });
    expect(changed.sectionStyles?.summary).toEqual({
      colorHex: '#111111',
      title: { fontSizePt: 14, fontWeight: 700 },
    });
    expect(original.sectionStyles?.summary).toEqual({
      fontFamily: 'Arial',
      colorHex: '#111111',
      title: { fontSizePt: 14, colorHex: '#222222' },
    });

    const pruned = patchCvSectionStyle(changed, 'summary', {
      colorHex: undefined,
      title: { fontSizePt: undefined, fontWeight: undefined },
    });
    expect(pruned.sectionStyles).toBeUndefined();
  });

  it('prunes an invalid line-height patch instead of persisting it', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { lineHeight: 1.6, fontFamily: 'Arial' } },
    };
    expect(patchCvSectionStyle(original, 'summary', { lineHeight: 3 }).sectionStyles).toEqual({
      summary: { fontFamily: 'Arial' },
    });
    expect(patchCvSectionStyle(original, 'summary', { colorHex: '#111111' }).sectionStyles).toEqual(
      {
        summary: { fontFamily: 'Arial', lineHeight: 1.6, colorHex: '#111111' },
      },
    );
  });

  it('resets one section without disturbing other overrides', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { lineHeight: 1.6 }, skills: { fontFamily: 'Arial' } },
    };
    expect(resetCvSectionStyle(original, 'summary').sectionStyles).toEqual({
      skills: { fontFamily: 'Arial' },
    });
    expect(
      resetCvSectionStyle(
        { ...original, sectionStyles: { summary: { lineHeight: 1.6 } } },
        'summary',
      ).sectionStyles,
    ).toBeUndefined();
  });
});

describe('patchCvElementStyle', () => {
  it('writes a new element override', () => {
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvElementStyle(original, 'summary.body', {
      fontFamily: 'Arial',
      fontSizePt: 12,
    });
    expect(changed.elementStyles).toEqual({
      'summary.body': { fontFamily: 'Arial', fontSizePt: 12 },
    });
    expect(original.elementStyles).toBeUndefined();
  });

  it('merges into an existing override and prunes inherited (undefined) fields', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: { 'summary.body': { fontFamily: 'Arial', colorHex: '#111111' } },
    };
    const originalElementStyles = original.elementStyles;
    const originalOverride = original.elementStyles!['summary.body'];
    const changed = patchCvElementStyle(original, 'summary.body', {
      fontFamily: undefined,
      fontWeight: 700,
    });
    expect(changed.elementStyles).toEqual({
      'summary.body': { colorHex: '#111111', fontWeight: 700 },
    });
    // Ref-equality immutability (T1 review minor): `original` and its nested
    // `elementStyles`/override objects must be untouched by the merge — a
    // mutating implementation would still pass the `toEqual` above (it reads
    // the mutated `original` back) but fail these reference checks.
    expect(changed).not.toBe(original);
    expect(changed.elementStyles).not.toBe(originalElementStyles);
    expect(original.elementStyles).toBe(originalElementStyles);
    expect(original.elementStyles!['summary.body']).toBe(originalOverride);
    expect(originalOverride).toEqual({ fontFamily: 'Arial', colorHex: '#111111' });
  });

  it('removes the element override once every field is pruned, and drops an emptied elementStyles map', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: { 'summary.body': { fontFamily: 'Arial' } },
    };
    const pruned = patchCvElementStyle(original, 'summary.body', { fontFamily: undefined });
    expect(pruned.elementStyles).toBeUndefined();
  });

  it('preserves sibling element overrides untouched', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: {
        'summary.body': { fontFamily: 'Arial' },
        'experience.0.bullet.0': { colorHex: '#0a5' },
      },
    };
    const changed = patchCvElementStyle(original, 'summary.body', { fontSizePt: 13 });
    expect(changed.elementStyles).toEqual({
      'summary.body': { fontFamily: 'Arial', fontSizePt: 13 },
      'experience.0.bullet.0': { colorHex: '#0a5' },
    });
    // Ref-equality (T1 review minor): the untouched sibling override object
    // itself is carried over, not just value-equal to it.
    expect(changed.elementStyles!['experience.0.bullet.0']).toBe(
      original.elementStyles!['experience.0.bullet.0'],
    );
  });

  it('prunes an invalid line-height patch instead of persisting it', () => {
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvElementStyle(original, 'summary.body', {
      fontFamily: 'Arial',
      lineHeight: 3,
    });
    expect(changed.elementStyles).toEqual({ 'summary.body': { fontFamily: 'Arial' } });
  });
});

describe('resetCvElementStyle', () => {
  it('removes only the targeted path, preserving siblings', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: {
        'summary.body': { fontFamily: 'Arial' },
        'experience.0.bullet.0': { colorHex: '#0a5' },
      },
    };
    expect(resetCvElementStyle(original, 'summary.body').elementStyles).toEqual({
      'experience.0.bullet.0': { colorHex: '#0a5' },
    });
  });

  it('drops the elementStyles map once it becomes empty', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: { 'summary.body': { fontFamily: 'Arial' } },
    };
    expect(resetCvElementStyle(original, 'summary.body').elementStyles).toBeUndefined();
  });
});

describe('patchCvDocumentBody', () => {
  it('maps colorHex to bodyColorHex (NOT accentColorHex) and applies the other root fields', () => {
    // Regression: the "Whole document" body colour scope used to write
    // accentColorHex, which body text never reads (no-accent-leak rule) — so
    // it recoloured titles/name instead of the body it was meant to target.
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvDocumentBody(original, {
      fontFamily: 'Georgia',
      fontSizePt: 12,
      fontWeight: 700,
      colorHex: '#123456',
    });
    expect(changed).toEqual({
      ...CV_STYLE_DEFAULT,
      fontFamily: 'Georgia',
      fontSizePt: 12,
      fontWeight: 700,
      bodyColorHex: '#123456',
    });
    // accentColorHex (title/rule colour) must stay untouched by a body edit.
    expect(changed.accentColorHex).toBe(CV_STYLE_DEFAULT.accentColorHex);
  });

  it('ignores lineHeight (no root field for it) and leaves other maps untouched', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { fontFamily: 'Arial' } },
      elementStyles: { 'summary.body': { colorHex: '#0a5' } },
      titleStyle: { fontSizePt: 14 },
    };
    const changed = patchCvDocumentBody(original, { fontSizePt: 13, lineHeight: 1.6 });
    expect(changed.fontSizePt).toBe(13);
    expect(changed.sectionStyles).toBe(original.sectionStyles);
    expect(changed.elementStyles).toBe(original.elementStyles);
    expect(changed.titleStyle).toBe(original.titleStyle);
    expect('lineHeight' in changed).toBe(false);
  });

  it('only applies provided keys, leaving the rest as-is', () => {
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvDocumentBody(original, { fontSizePt: 13 });
    expect(changed.fontFamily).toBe(original.fontFamily);
    expect(changed.accentColorHex).toBe(original.accentColorHex);
    expect(changed.fontWeight).toBe(original.fontWeight);
    expect(changed.fontSizePt).toBe(13);
  });
});

describe('effectiveLeafStyle', () => {
  const base: CvStyle = { ...CV_STYLE_DEFAULT };

  it('with no elementPath, returns the section resolution unchanged (colorHex undefined when un-overridden)', () => {
    expect(effectiveLeafStyle(base, 'summary', undefined)).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 11,
      fontWeight: 400,
      colorHex: undefined,
      lineHeight: undefined,
    });
  });

  it('an empty-string elementPath resolves the same as no elementPath at all (T1 review minor)', () => {
    // An empty path must fall through to the section resolution exactly like
    // `undefined` — and must NOT accidentally hit an unrelated real override
    // keyed by some other path (e.g. if a caller ever passed '' by mistake,
    // it must not silently pick up '' as a literal elementStyles key either).
    const s: CvStyle = {
      ...base,
      sectionStyles: { summary: { fontSizePt: 13 } },
      elementStyles: {
        'summary.body': { fontSizePt: 99 },
        '': { fontSizePt: 77 },
      },
    };
    expect(effectiveLeafStyle(s, 'summary', '')).toEqual(
      effectiveLeafStyle(s, 'summary', undefined),
    );
    expect(effectiveLeafStyle(s, 'summary', '').fontSizePt).toBe(13);
  });

  it('with an elementPath but no override at that path, returns the section resolution', () => {
    const s: CvStyle = { ...base, sectionStyles: { summary: { fontSizePt: 13 } } };
    expect(effectiveLeafStyle(s, 'summary', 'summary.body')).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 13,
      fontWeight: 400,
      colorHex: undefined,
      lineHeight: undefined,
    });
  });

  it('surfaces a per-leaf bottom rule with width/colour defaults when only the style is set', () => {
    const s: CvStyle = { ...base, elementStyles: { 'pd.name': { borderStyle: 'dashed' } } };
    const r = effectiveLeafStyle(s, 'personal_details', 'pd.name');
    expect(r.borderStyle).toBe('dashed');
    expect(r.ruleWidthPt).toBe(1);
    expect(r.ruleColorHex).toBe(base.accentColorHex);
  });

  it("draws no line when borderStyle is 'none' or unset — even with a stray width/colour", () => {
    const off: CvStyle = {
      ...base,
      elementStyles: {
        'pd.name': { borderStyle: 'none', ruleWidthPt: 3, ruleColorHex: '#ff0000' },
      },
    };
    const r = effectiveLeafStyle(off, 'personal_details', 'pd.name');
    expect(r.borderStyle).toBeUndefined();
    expect(r.ruleWidthPt).toBeUndefined();
    expect(r.ruleColorHex).toBeUndefined();
  });

  it('layers the element override over the section resolution', () => {
    const s: CvStyle = {
      ...base,
      sectionStyles: { summary: { fontSizePt: 13, fontFamily: 'Arial' } },
      elementStyles: { 'summary.body': { fontSizePt: 15 } },
    };
    expect(effectiveLeafStyle(s, 'summary', 'summary.body')).toEqual({
      fontFamily: 'Arial',
      fontSizePt: 15,
      fontWeight: 400,
      colorHex: undefined,
      lineHeight: undefined,
    });
  });

  it('colorHex stays undefined unless explicitly overridden at element, section, or document scope (no accent leak)', () => {
    expect(effectiveLeafStyle(base, 'summary', 'summary.body').colorHex).toBeUndefined();
    // An accent colour alone (no bodyColorHex) must never leak into the body.
    const accentOnly: CvStyle = { ...base, accentColorHex: '#1B7464' };
    expect(effectiveLeafStyle(accentOnly, 'summary', 'summary.body').colorHex).toBeUndefined();

    const sectionOverride: CvStyle = { ...base, sectionStyles: { summary: { colorHex: '#0a5' } } };
    expect(effectiveLeafStyle(sectionOverride, 'summary', 'summary.body').colorHex).toBe('#0a5');
    expect(effectiveLeafStyle(sectionOverride, 'summary', undefined).colorHex).toBe('#0a5');

    const elementOverride: CvStyle = {
      ...base,
      sectionStyles: { summary: { colorHex: '#0a5' } },
      elementStyles: { 'summary.body': { colorHex: '#123456' } },
    };
    expect(effectiveLeafStyle(elementOverride, 'summary', 'summary.body').colorHex).toBe('#123456');
  });

  it('resolves the document-wide bodyColorHex cascade layer (element > section > document > none)', () => {
    // Document bodyColorHex alone applies to every leaf with no section/
    // element override.
    const docOnly: CvStyle = { ...base, bodyColorHex: '#204060' };
    expect(effectiveLeafStyle(docOnly, 'summary', 'summary.body').colorHex).toBe('#204060');
    expect(effectiveLeafStyle(docOnly, 'skills', 'skills.0.values').colorHex).toBe('#204060');
    expect(effectiveLeafStyle(docOnly, 'summary', undefined).colorHex).toBe('#204060');

    // A section colorHex override beats the document bodyColorHex for that
    // section only; a sibling section still falls through to the document.
    const sectionBeatsDoc: CvStyle = {
      ...base,
      bodyColorHex: '#204060',
      sectionStyles: { summary: { colorHex: '#0a5' } },
    };
    expect(effectiveLeafStyle(sectionBeatsDoc, 'summary', 'summary.body').colorHex).toBe('#0a5');
    expect(effectiveLeafStyle(sectionBeatsDoc, 'skills', 'skills.0.values').colorHex).toBe(
      '#204060',
    );

    // An element colorHex override beats both the section and the document.
    const elementBeatsAll: CvStyle = {
      ...base,
      bodyColorHex: '#204060',
      sectionStyles: { summary: { colorHex: '#0a5' } },
      elementStyles: { 'summary.body': { colorHex: '#123456' } },
    };
    expect(effectiveLeafStyle(elementBeatsAll, 'summary', 'summary.body').colorHex).toBe('#123456');

    // Unset bodyColorHex (and no section/element override) never leaks the
    // accent colour into the body.
    expect(effectiveLeafStyle(base, 'summary', 'summary.body').colorHex).toBeUndefined();
  });

  it('validates lineHeight 1.0-2.0, falling back to the section value when the element override is invalid', () => {
    const s: CvStyle = {
      ...base,
      sectionStyles: { summary: { lineHeight: 1.6 } },
      elementStyles: { 'summary.body': { lineHeight: 3 } },
    };
    expect(effectiveLeafStyle(s, 'summary', 'summary.body').lineHeight).toBe(1.6);

    const validElement: CvStyle = {
      ...base,
      sectionStyles: { summary: { lineHeight: 1.6 } },
      elementStyles: { 'summary.body': { lineHeight: 1.8 } },
    };
    expect(effectiveLeafStyle(validElement, 'summary', 'summary.body').lineHeight).toBe(1.8);
  });
});

describe('resolvePageSettings', () => {
  it('resolves A4 with 4-side mm margins', () => {
    const r = resolvePageSettings({
      size: 'a4',
      margin: { top: 10, right: 15, bottom: 20, left: 25 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.widthMm).toBe(210);
    expect(r.heightMm).toBe(297);
    expect(r.margin).toEqual({ top: 10, right: 15, bottom: 20, left: 25 });
    expect(r.marginPct.left).toBeCloseTo((25 / 210) * 100, 4);
    expect(r.marginPct.top).toBeCloseTo((10 / 297) * 100, 4);
  });

  it('maps legacy preset "narrow" to 12.7mm on all sides', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolvePageSettings({ size: 'a4', margin: 'narrow' } as any);
    expect(r.margin).toEqual({ top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 });
  });

  it('maps legacy preset "wide" to 30mm and Letter dims', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = resolvePageSettings({ size: 'letter', margin: 'wide' } as any);
    expect(r.widthMm).toBe(215.9);
    expect(r.heightMm).toBe(279.4);
    expect(r.margin.top).toBe(30);
  });

  it('falls back to A4 / 20mm when page is undefined', () => {
    const r = resolvePageSettings(undefined);
    expect(r.widthMm).toBe(210);
    expect(r.margin).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
  });

  it('clamps out-of-range margins to [0,50]', () => {
    const r = resolvePageSettings({
      size: 'a4',
      margin: { top: -5, right: 80, bottom: 20, left: 20 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.margin.top).toBe(0);
    expect(r.margin.right).toBe(50);
  });
});

describe('title/body style resolution', () => {
  const base: CvStyle = {
    fontFamily: 'Calibri',
    fontSizePt: 11,
    accentColorHex: '#333333',
    fontWeight: 400,
  };

  it('title falls back to document titleStyle, then to body defaults', () => {
    const s: CvStyle = { ...base, titleStyle: { fontFamily: 'Georgia', fontSizePt: 14 } };
    const t = effectiveTitleStyle(s, 'summary');
    expect(t.fontFamily).toBe('Georgia'); // from titleStyle
    expect(t.fontSizePt).toBe(14); // from titleStyle
    expect(t.fontWeight).toBe(400); // falls back to body default
    expect(t.colorHex).toBe('#333333'); // falls back to accentColorHex
  });

  it('per-section title override beats document titleStyle', () => {
    const s: CvStyle = {
      ...base,
      titleStyle: { fontFamily: 'Georgia' },
      sectionStyles: { skills: { title: { fontFamily: 'Arial', fontSizePt: 16 } } },
    };
    const t = effectiveTitleStyle(s, 'skills');
    expect(t.fontFamily).toBe('Arial');
    expect(t.fontSizePt).toBe(16);
  });

  it('body resolution is unchanged (section body over document body)', () => {
    const s: CvStyle = { ...base, sectionStyles: { skills: { fontFamily: 'Arial' } } };
    expect(effectiveSectionStyle(s, 'skills').fontFamily).toBe('Arial');
    expect(effectiveSectionStyle(s, 'summary').fontFamily).toBe('Calibri');
  });

  it('clearSectionElementOverrides drops in-section head/field overrides, keeps bullets + siblings', () => {
    const style: CvStyle = {
      ...base,
      elementStyles: {
        'exp.0': { colorHex: '#111' },
        'exp.0.company': { colorHex: '#222' },
        'exp.0.bullet.1': { colorHex: '#333' },
        'edu.0': { colorHex: '#444' },
      },
    };
    // Heads/fields cleared for experience; the bullet and the education sibling stay.
    const heads = clearSectionElementOverrides(style, 'experience');
    expect(heads.elementStyles).toEqual({
      'exp.0.bullet.1': { colorHex: '#333' },
      'edu.0': { colorHex: '#444' },
    });
    // bullets:true clears ONLY the bullet override.
    const bullets = clearSectionElementOverrides(style, 'experience', true);
    expect(bullets.elementStyles?.['exp.0.bullet.1']).toBeUndefined();
    expect(bullets.elementStyles?.['exp.0']).toEqual({ colorHex: '#111' });
  });

  it('titleBorder resolves section over document over default solid', () => {
    expect(effectiveTitleBorder(base, 'summary')).toBe('solid');
    expect(effectiveTitleBorder({ ...base, titleBorder: 'none' }, 'summary')).toBe('none');
    expect(
      effectiveTitleBorder(
        { ...base, titleBorder: 'none', sectionStyles: { skills: { titleBorder: 'dotted' } } },
        'skills',
      ),
    ).toBe('dotted');
  });

  it('title rule width/colour resolve section over document, undefined when unset', () => {
    expect(effectiveTitleRuleWidth(base, 'summary')).toBeUndefined();
    expect(effectiveTitleRuleColor(base, 'summary')).toBeUndefined();
    const doc: CvStyle = { ...base, titleRuleWidthPt: 3, titleRuleColorHex: '#111' };
    expect(effectiveTitleRuleWidth(doc, 'summary')).toBe(3);
    expect(effectiveTitleRuleColor(doc, 'summary')).toBe('#111');
    const sectioned: CvStyle = {
      ...doc,
      sectionStyles: { skills: { titleRuleWidthPt: 1.5, titleRuleColorHex: '#abc' } },
    };
    expect(effectiveTitleRuleWidth(sectioned, 'skills')).toBe(1.5);
    expect(effectiveTitleRuleColor(sectioned, 'skills')).toBe('#abc');
    // Section without its own override falls back to the document value.
    expect(effectiveTitleRuleWidth(sectioned, 'summary')).toBe(3);
  });
});

describe('parseCvSkillResponse — content-only boundary', () => {
  it('strips unknown top-level keys (style/theme/fontFamily) from AI JSON', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        summary: 'Hi',
        style: { fontFamily: 'Comic Sans', accentColorHex: '#ff0000' },
        theme: 2,
        themeId: 9,
        fontFamily: 'Arial',
      }),
    );
    expect(res.summary).toBe('Hi');
    expect(Object.keys(res).sort()).toEqual(
      [
        'education',
        'experience',
        'languages',
        'lowConfidenceNotes',
        'personalDetails',
        'skillGroups',
        'skills',
        'summary',
      ].sort(),
    );
    expect((res as Record<string, unknown>)['style']).toBeUndefined();
    expect((res as Record<string, unknown>)['theme']).toBeUndefined();
    expect((res as Record<string, unknown>)['themeId']).toBeUndefined();
    expect((res as Record<string, unknown>)['fontFamily']).toBeUndefined();
  });

  it('strips unknown keys nested inside personalDetails', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Ada', fontFamily: 'Arial', accentColorHex: '#000' },
      }),
    );
    expect(res.personalDetails.fullName).toBe('Ada');
    expect(Object.keys(res.personalDetails).sort()).toEqual(
      [
        'address',
        'email',
        'firstName',
        'fullName',
        'lastName',
        'linkedin',
        'nameSplitConfident',
        'phone',
        'title',
        'website',
      ].sort(),
    );
    expect((res.personalDetails as Record<string, unknown>)['fontFamily']).toBeUndefined();
    expect((res.personalDetails as Record<string, unknown>)['accentColorHex']).toBeUndefined();
  });

  it('preserves all valid content fields unchanged', () => {
    const res = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: { fullName: 'Ada', email: 'a@b.c' },
        summary: 'S',
        experience: [
          { company: 'X', role: 'Y', startDate: '2020', endDate: '2021', bullets: ['b'] },
        ],
        skills: ['ts'],
        languages: [{ language: 'EN', level: 'C2' }],
      }),
    );
    expect(res.personalDetails.fullName).toBe('Ada');
    expect(res.personalDetails.email).toBe('a@b.c');
    expect(res.personalDetails.title).toBeNull();
    expect(res.summary).toBe('S');
    expect(res.experience).toHaveLength(1);
    expect(res.skills).toEqual(['ts']);
    expect(res.languages).toEqual([{ language: 'EN', level: 'C2' }]);
  });

  it('contract: a rogue style key in AI JSON never reaches a saved CvContent', () => {
    const parsed = parseCvSkillResponse(
      JSON.stringify({ summary: 'S', style: { fontFamily: 'Comic Sans' }, accentColorHex: '#f00' }),
    );
    const content = buildCvContent(parsed, null);
    const serialized = JSON.stringify(content);
    expect(serialized).not.toContain('fontFamily');
    expect(serialized).not.toContain('accentColorHex');
    expect(serialized.toLowerCase()).not.toContain('comic sans');
  });
});

describe('mergeRegeneratedSection', () => {
  const baseContent: CvContent = {
    sections: [
      { key: 'personal_details', order: 0, visible: true, fullName: 'Ada' } as never,
      { key: 'summary', order: 1, visible: true, text: 'old summary' } as never,
      { key: 'experience', order: 2, visible: true, entries: [] } as never,
    ],
  };

  it('updates only the targeted section and stamps its sourceHash', () => {
    const parsed = parseCvSkillResponse(JSON.stringify({ summary: 'new summary' }));
    const out = mergeRegeneratedSection(baseContent, 'summary', parsed, 'hash-1');
    const summary = out.sections.find((s) => s.key === 'summary') as {
      text: string;
      sourceHash: string;
    };
    expect(summary.text).toBe('new summary');
    expect(summary.sourceHash).toBe('hash-1');
  });

  it('leaves non-targeted sections untouched (content, order, visible)', () => {
    const parsed = parseCvSkillResponse(JSON.stringify({ summary: 'new summary' }));
    const out = mergeRegeneratedSection(baseContent, 'summary', parsed, 'hash-1');
    const personal = out.sections.find((s) => s.key === 'personal_details') as {
      fullName: string;
      order: number;
    };
    const exp = out.sections.find((s) => s.key === 'experience') as {
      order: number;
      visible: boolean;
    };
    expect(personal.fullName).toBe('Ada');
    expect(personal.order).toBe(0);
    expect(exp.order).toBe(2);
    expect(exp.visible).toBe(true);
  });

  it('preserves the targeted section order and visible flag', () => {
    const parsed = parseCvSkillResponse(JSON.stringify({ summary: 'x' }));
    const out = mergeRegeneratedSection(baseContent, 'summary', parsed, 'h');
    const summary = out.sections.find((s) => s.key === 'summary') as {
      order: number;
      visible: boolean;
    };
    expect(summary.order).toBe(1);
    expect(summary.visible).toBe(true);
  });
});

describe('leafPath', () => {
  // Regression (Phase D.2 review fix): the preview template used to spell
  // each leaf's path out as a raw string literal at two independent call
  // sites (`leafDraft('<path>', ...)` and `selectLeaf(..., '<path>')`),
  // risking silent drift between the transient draft key and the emitted/
  // persisted `elementPath`. `leafPath` is now the single source of truth
  // both call sites build from — asserted here against the exact strings
  // already persisted in `elementStyles` and used as draft ids.
  it('returns the canonical string for the representative leaves', () => {
    expect(leafPath('summary')).toBe('summary');
    expect(leafPath('exp', 1, 'role')).toBe('exp.1.role');
    expect(leafPath('exp', 1, 'bullet', 0)).toBe('exp.1.bullet.0');
    expect(leafPath('skills', 0, 'values')).toBe('skills.0.values');
    expect(leafPath('lang', 0, 'language')).toBe('lang.0.language');
  });

  it('also covers the pd.<field> and edu.<i>.<field> shapes', () => {
    expect(leafPath('pd', 'fullName')).toBe('pd.fullName');
    expect(leafPath('edu', 0, 'degree')).toBe('edu.0.degree');
  });
});

describe('parseCvGapResponse', () => {
  it('parses questions from valid JSON', () => {
    const raw = JSON.stringify({
      questions: [
        {
          id: 'q1',
          category: 'skill',
          question: 'Do you know Kubernetes?',
          hint: 'The job asks for it',
        },
        { id: 'q2', category: 'language', question: 'German level?', hint: null },
      ],
    });
    expect(parseCvGapResponse(raw)).toEqual([
      {
        id: 'q1',
        category: 'skill',
        question: 'Do you know Kubernetes?',
        hint: 'The job asks for it',
      },
      { id: 'q2', category: 'language', question: 'German level?', hint: null },
    ]);
  });

  it('returns [] on garbage (fail-open)', () => {
    expect(parseCvGapResponse('not json at all')).toEqual([]);
    expect(parseCvGapResponse('{"questions": "oops"}')).toEqual([]);
  });

  it('caps at 5 questions', () => {
    const q = (n: number) => ({ id: `q${n}`, category: 'other', question: `Q${n}`, hint: null });
    const raw = JSON.stringify({ questions: [q(1), q(2), q(3), q(4), q(5), q(6), q(7)] });
    expect(parseCvGapResponse(raw)).toHaveLength(5);
  });

  it('defaults a missing/unknown category to "other" and a missing hint to null', () => {
    const raw = JSON.stringify({ questions: [{ id: 'q1', question: 'X' }] });
    expect(parseCvGapResponse(raw)).toEqual([
      { id: 'q1', category: 'other', question: 'X', hint: null },
    ]);
  });
});

describe('buildAdditionalInfoBlock', () => {
  it('builds a markdown block from answered items', () => {
    const block = buildAdditionalInfoBlock([
      { id: 'q1', question: 'Kubernetes?', answer: '2 years in production' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
    expect(block).toBe(
      '## Additional information\n- Kubernetes?: 2 years in production\n- German level?: B2',
    );
  });

  it('drops empty/whitespace answers', () => {
    const block = buildAdditionalInfoBlock([
      { id: 'q1', question: 'Kubernetes?', answer: '  ' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
    expect(block).toBe('## Additional information\n- German level?: B2');
  });

  it('returns "" when nothing is answered', () => {
    expect(buildAdditionalInfoBlock([{ id: 'q1', question: 'X', answer: '' }])).toBe('');
    expect(buildAdditionalInfoBlock([])).toBe('');
  });
});

describe('withCvPhoto', () => {
  const PHOTO = 'data:image/jpeg;base64,AAAA';

  it('fills an existing photo section and makes it visible', () => {
    const content = {
      sections: [
        { key: 'photo', order: 0, visible: false } as CvSection,
        { key: 'summary', order: 1, visible: true, text: 'x' } as CvSection,
      ],
    };
    const out = withCvPhoto(content, PHOTO);
    const photo = out.sections.find((s) => s.key === 'photo') as Extract<
      CvSection,
      { key: 'photo' }
    >;
    expect(photo.visible).toBe(true);
    expect(photo.dataUri).toBe(PHOTO);
    // Untouched sections survive.
    expect(out.sections).toHaveLength(2);
  });

  it('keeps a placement the user already chose', () => {
    const content = {
      sections: [{ key: 'photo', order: 0, visible: true, placement: 'above_right' } as CvSection],
    };
    const photo = withCvPhoto(content, PHOTO).sections[0] as Extract<CvSection, { key: 'photo' }>;
    expect(photo.placement).toBe('above_right');
  });

  it('creates a photo section ahead of everything when the template seeded none', () => {
    const content = {
      sections: [{ key: 'personal_details', order: 0, visible: true, fullName: 'A' } as CvSection],
    };
    const out = withCvPhoto(content, PHOTO);
    expect(out.sections[0].key).toBe('photo');
    expect(out.sections[0].order).toBeLessThan(0);
    expect(out.sections).toHaveLength(2);
  });

  it('does not mutate the input', () => {
    const content = { sections: [{ key: 'photo', order: 0, visible: false } as CvSection] };
    withCvPhoto(content, PHOTO);
    expect((content.sections[0] as Extract<CvSection, { key: 'photo' }>).visible).toBe(false);
  });
});

describe('parseCvSkillResponse name split', () => {
  it('keeps the split the AI supplied', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: {
          fullName: 'Anna Kowalska',
          firstName: 'Anna',
          lastName: 'Kowalska',
          nameSplitConfident: true,
        },
      }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(true);
  });

  it('derives the split when the AI omitted it, and marks a clean two-token name confident', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({ personalDetails: { fullName: 'Anna Kowalska' } }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(true);
  });

  it('derives an unconfident split for a three-token name', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({ personalDetails: { fullName: 'Anna Maria Kowalska' } }),
    );
    expect(cv.personalDetails.firstName).toBe('Anna Maria');
    expect(cv.personalDetails.lastName).toBe('Kowalska');
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('reports a mononym as unconfident with no last name', () => {
    const cv = parseCvSkillResponse(JSON.stringify({ personalDetails: { fullName: 'Prince' } }));
    expect(cv.personalDetails.firstName).toBe('Prince');
    expect(cv.personalDetails.lastName).toBeNull();
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('trusts an explicit false flag even when the name looks clean', () => {
    const cv = parseCvSkillResponse(
      JSON.stringify({
        personalDetails: {
          fullName: 'Kim Minjun',
          firstName: 'Minjun',
          lastName: 'Kim',
          nameSplitConfident: false,
        },
      }),
    );
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });

  it('leaves every name field null when there is no name at all', () => {
    const cv = parseCvSkillResponse(JSON.stringify({ personalDetails: {} }));
    expect(cv.personalDetails.fullName).toBeNull();
    expect(cv.personalDetails.firstName).toBeNull();
    expect(cv.personalDetails.lastName).toBeNull();
    expect(cv.personalDetails.nameSplitConfident).toBe(false);
  });
});

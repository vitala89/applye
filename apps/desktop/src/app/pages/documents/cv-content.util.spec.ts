import type {
  CvContent,
  CvParsedContent,
  CvPersonalDetailsSection,
  CvTemplate,
} from '@applye/core';
import {
  blankEducationEntry,
  blankExperienceEntry,
  buildContactLine,
  buildCvContent,
  cvContentToMd,
  normalizeCvContent,
  parseCvSkillResponse,
  repairTruncatedJson,
} from './cv-content.util';

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

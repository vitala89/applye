import type {
  CvContent,
  CvParsedContent,
  CvPersonalDetailsSection,
  CvTemplate,
} from '@applye/core';
import {
  buildContactLine,
  buildCvContent,
  cvContentToMd,
  normalizeCvContent,
  parseCvSkillResponse,
} from './cv-content.util';

describe('normalizeCvContent', () => {
  it('migrates a legacy items[] skills section into a single group', () => {
    const legacy = {
      sections: [{ key: 'skills', order: 0, visible: true, items: ['TypeScript', 'Rust'] }],
    } as unknown as CvContent;
    const out = normalizeCvContent(legacy);
    const skills = out.sections[0] as {
      key: 'skills';
      groups: { label: string; values: string[] }[];
    };
    expect(skills.groups).toEqual([{ label: 'Skills', values: ['TypeScript', 'Rust'] }]);
    expect((out.sections[0] as Record<string, unknown>)['items']).toBeUndefined();
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
    expect(normalizeCvContent(modern).sections[0]).toEqual(modern.sections[0]);
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
});

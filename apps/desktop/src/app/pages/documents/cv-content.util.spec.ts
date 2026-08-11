import type { CvContent, CvParsedContent, CvSection, CvTemplate } from '@applye/core';
import {
  buildCvContent,
  cvContentToMd,
  mergeRegeneratedSection,
  normalizeCvContent,
  parseCvSkillResponse,
  withCvPhoto,
} from './cv-content.util';

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
    // prepended when the stored content lacks one - everything else on the
    // skills section (key, visible, groups) is untouched.
    expect(out.sections.find((s) => s.key === 'skills')).toEqual({
      ...modern.sections[0],
      order: 1,
    });
  });
});

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

import type {
  CvContent,
  CvParsedContent,
  CvPersonalDetailsSection,
  CvSection,
  CvTemplate,
} from '@applye/core';
import {
  buildContactLine,
  buildCvContent,
  cvContentToMd,
  leafPath,
  mergeRegeneratedSection,
  normalizeCvContent,
  parseCvSkillResponse,
  resolvePageSettings,
  visiblePersonalContactFields,
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

  it('omits empty base fields - no leaf for a field with no content', () => {
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
  // both call sites build from - asserted here against the exact strings
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

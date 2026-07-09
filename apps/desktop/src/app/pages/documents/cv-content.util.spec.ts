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
  effectiveSectionStyle,
  normalizeCvContent,
  parseCvSkillResponse,
  repairTruncatedJson,
  resolvePageSettings,
} from './cv-content.util';
import { CV_STYLE_DEFAULT, CvStyle } from '@applye/core';

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

  it('legacy style_json (no fontWeight) defaults to 400 after CV_STYLE_DEFAULT merge', () => {
    const legacy = { fontFamily: 'Arial', fontSizePt: 10, accentColorHex: '#111111' };
    const merged: CvStyle = { ...CV_STYLE_DEFAULT, ...legacy };
    expect(effectiveSectionStyle(merged, 'summary').fontWeight).toBe(400);
    expect(effectiveSectionStyle(merged, 'summary').fontFamily).toBe('Arial');
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

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
  effectiveTitleStyle,
  effectiveTitleBorder,
  mergeRegeneratedSection,
  normalizeCvContent,
  parseCvSkillResponse,
  patchCvSectionStyle,
  repairTruncatedJson,
  resetCvSectionStyle,
  resolvePageSettings,
  visiblePersonalContactFields,
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
      ['address', 'email', 'fullName', 'linkedin', 'phone', 'title', 'website'].sort(),
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

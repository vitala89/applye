import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CvContent, CvParsedContent, CvTemplate } from '@applye/core';
import { parseProfileMd, serializeProfileForm } from '@applye/core';
import {
  appendCompensation,
  applyContactOverrides,
  buildOnboardingCvInput,
  hasCvForInputHash,
  cvToProfileMarkdown,
  formatCompRange,
  normalizeCurrency,
  parseArchetypesSkillResponse,
  parseCompRange,
  pickCvTemplate,
  regionTagForUiLanguage,
} from './onboarding-content.util';

function template(id: number, regionTag: string): CvTemplate {
  return {
    id,
    name: `tpl-${regionTag}`,
    regionTag,
    includePhoto: false,
    includeBirthdate: false,
    includeMaritalStatus: false,
    isBuiltin: true,
  };
}

function parsedCv(overrides: Partial<CvParsedContent> = {}): CvParsedContent {
  return {
    personalDetails: {
      fullName: 'Jane Smith',
      title: 'Engineer',
      email: 'jane@x.io',
      phone: '+49 30 000',
      address: 'Berlin',
      website: null,
      linkedin: null,
    },
    summary: 'Senior engineer.',
    experience: [{ company: 'Acme', role: 'Lead', bullets: ['Shipped X'] }],
    education: [],
    skills: ['TypeScript'],
    languages: [],
    lowConfidenceNotes: [],
    ...overrides,
  };
}

describe('regionTagForUiLanguage', () => {
  it('starts a German UI on the German region templates', () => {
    expect(regionTagForUiLanguage('de')).toBe('de');
  });
  it('falls back to generic for every other UI language, including none', () => {
    expect(regionTagForUiLanguage('en')).toBe('generic');
    expect(regionTagForUiLanguage(null)).toBe('generic');
  });
});

describe('pickCvTemplate', () => {
  it('prefers an exact region match over list order', () => {
    const templates = [template(1, 'us'), template(2, 'de')];
    expect(pickCvTemplate(templates, 'de')?.id).toBe(2);
  });
  it('falls back to the first template when the region has none', () => {
    expect(pickCvTemplate([template(1, 'us')], 'de')?.id).toBe(1);
  });
  it('returns null rather than throwing when no templates are seeded', () => {
    expect(pickCvTemplate([], 'de')).toBeNull();
  });
});

describe('buildOnboardingCvInput', () => {
  const overrides = { fullName: '', email: '', phone: '', address: '' };
  const base = {
    parsed: parsedCv(),
    overrides,
    templates: [template(7, 'de')],
    regionTag: 'de',
    language: 'de' as const,
    fallbackLabel: 'Untitled CV',
  };

  it('writes an uploaded CV document carrying the region template and hash', () => {
    const input = buildOnboardingCvInput({ ...base, inputHash: 'abc123' });
    expect(input.docType).toBe('cv');
    expect(input.source).toBe('uploaded');
    expect(input.templateId).toBe(7);
    expect(input.regionTag).toBe('de');
    expect(input.language).toBe('de');
    expect(input.inputHash).toBe('abc123');
  });

  it('carries the parsed resume into the stored sections', () => {
    const input = buildOnboardingCvInput(base);
    const content = JSON.parse(input.contentJson ?? '{}') as CvContent;
    expect(content.sections.length).toBeGreaterThan(0);
    expect(input.contentJson).toContain('Shipped X');
  });

  it('lets the review step edits win over the raw parse', () => {
    const input = buildOnboardingCvInput({
      ...base,
      overrides: { fullName: 'Jane S. Smith', email: 'new@x.io', phone: '+49 30 000', address: '' },
    });
    expect(input.label).toBe('Jane S. Smith');
    expect(input.contentJson).toContain('new@x.io');
  });

  it('honours a contact field the user cleared instead of restoring the parse', () => {
    const input = buildOnboardingCvInput({
      ...base,
      overrides: { fullName: 'Jane Smith', email: 'jane@x.io', phone: '', address: '' },
    });
    // The review inputs are seeded from the parse, so blank means deleted.
    // A phone cleared for privacy must not reappear on the exported CV.
    expect(input.contentJson).not.toContain('+49 30 000');
    expect(input.contentJson).not.toContain('Berlin');
  });

  it('keeps parsed fields the review step never exposes', () => {
    const input = buildOnboardingCvInput(base);
    expect(input.contentJson).toContain('Engineer');
  });

  it('reports the region of the template it actually chose, not the one asked for', () => {
    const input = buildOnboardingCvInput({ ...base, templates: [template(3, 'us')] });
    expect(input.templateId).toBe(3);
    expect(input.regionTag).toBe('us');
  });

  it('names an unnamed CV with the fallback label instead of leaving it blank', () => {
    const input = buildOnboardingCvInput({
      ...base,
      parsed: parsedCv({
        personalDetails: {
          fullName: null,
          title: null,
          email: null,
          phone: null,
          address: null,
          website: null,
          linkedin: null,
        },
      }),
    });
    expect(input.label).toBe('Untitled CV');
  });

  it('omits the hash for a pasted resume so it never claims a file it lacks', () => {
    expect(buildOnboardingCvInput(base).inputHash).toBeUndefined();
  });
});

describe('hasCvForInputHash', () => {
  const existing = [
    { source: 'uploaded', inputHash: 'abc123' },
    { source: 'generated', inputHash: 'gen999' },
  ];
  it('skips a re-run over the same source file', () => {
    expect(hasCvForInputHash(existing, 'abc123')).toBe(true);
  });
  it('writes a CV for a file never imported before', () => {
    expect(hasCvForInputHash(existing, 'other')).toBe(false);
  });
  it('never blocks the pasted path, which carries no hash', () => {
    expect(hasCvForInputHash(existing, undefined)).toBe(false);
  });
  it('ignores generated CVs — only an uploaded twin is a duplicate', () => {
    expect(hasCvForInputHash(existing, 'gen999')).toBe(false);
  });
});

describe('region tags match the seeded templates', () => {
  // The tag lives in TS and the templates live in SQL. Without this, renaming a
  // seed would silently drop every English onboarding CV onto DE-traditional
  // (photo + birthdate + marital status) via the templates[0] fallback.
  const seeds = readFileSync(
    join(__dirname, '../../../../src-tauri/migrations/0011_documents_library.sql'),
    'utf8',
  );
  it.each([regionTagForUiLanguage('de'), regionTagForUiLanguage('en')])(
    'seeds a template for region %s',
    (regionTag) => {
      expect(seeds).toContain(`'${regionTag}'`);
    },
  );
});

describe('applyContactOverrides', () => {
  it('nulls a cleared field so both wizard artifacts drop it together', () => {
    expect(
      applyContactOverrides({ fullName: 'Jane', email: '', phone: '  ', address: 'Berlin' }),
    ).toEqual({
      fullName: 'Jane',
      email: null,
      phone: null,
      address: 'Berlin',
    });
  });
});

describe('cvToProfileMarkdown', () => {
  it('renders name, summary, experience and skills as markdown', () => {
    const md = cvToProfileMarkdown({
      personalDetails: { fullName: 'Jane Smith', email: 'jane@x.io' },
      summary: 'Senior engineer.',
      experience: [{ company: 'Acme', role: 'Lead', bullets: ['Shipped X', 'Cut latency 40%'] }],
      skills: ['TypeScript', 'Rust'],
    });
    expect(md).toContain('# Jane Smith');
    expect(md).toContain('Senior engineer.');
    expect(md).toContain('## Experience');
    expect(md).toContain('Lead — Acme');
    expect(md).toContain('- Shipped X');
    expect(md).toContain('TypeScript, Rust');
  });
  it('omits empty sections without throwing', () => {
    const md = cvToProfileMarkdown({});
    expect(typeof md).toBe('string');
  });
});

describe('cvToProfileMarkdown identity fields', () => {
  it('emits title, website and linkedin when present', () => {
    const md = cvToProfileMarkdown({
      personalDetails: {
        fullName: 'Vitalii Kasap',
        title: 'Senior Frontend Software Engineer',
        email: 'v@x.io',
        phone: '+49',
        address: 'Nuremberg',
        website: 'vitaliikasap.com',
        linkedin: 'linkedin.com/in/vitaliikasap',
      },
      summary: 'Engineer.',
      experience: [],
      skills: [],
    });
    expect(md).toContain('# Vitalii Kasap');
    expect(md).toContain('Senior Frontend Software Engineer');
    expect(md).toContain('vitaliikasap.com');
    expect(md).toContain('linkedin.com/in/vitaliikasap');
  });
});

describe('parseArchetypesSkillResponse', () => {
  it('parses archetypes and comp range from JSON', () => {
    const r = parseArchetypesSkillResponse(
      '{"archetypes":["Senior FE Engineer","Staff FE"],"compRange":"EUR 90-120K"}',
    );
    expect(r.archetypes).toEqual(['Senior FE Engineer', 'Staff FE']);
    expect(r.compRange).toBe('EUR 90-120K');
  });
  it('tolerates code fences and missing comp', () => {
    const r = parseArchetypesSkillResponse('```json\n{"archetypes":["X"]}\n```');
    expect(r.archetypes).toEqual(['X']);
    expect(r.compRange).toBeNull();
  });
  it('returns empty on garbage', () => {
    const r = parseArchetypesSkillResponse('not json');
    expect(r.archetypes).toEqual([]);
    expect(r.compRange).toBeNull();
  });
});

describe('appendCompensation', () => {
  it('appends a Compensation section the profile form can read back', () => {
    const md = appendCompensation('# Jane Smith', '80 - 95 EUR per year');
    // Heading MUST be `## Compensation`; `## Compensation Target` was the bug.
    expect(md).toBe('# Jane Smith\n\n## Compensation\n80 - 95 EUR per year');
    const form = parseProfileMd(md);
    expect(form.compMin).toBe('80');
    expect(form.compMax).toBe('95');
    expect(form.compCurrency).toBe('EUR');
    expect(form.compPeriod).toBe('year');
  });

  it('returns the markdown unchanged when the body is empty or whitespace', () => {
    expect(appendCompensation('# Jane Smith', '')).toBe('# Jane Smith');
    expect(appendCompensation('# Jane Smith', '   ')).toBe('# Jane Smith');
  });
});

describe('cvToProfileMarkdown — address', () => {
  it('lands the address in the location field even with no title to anchor it', () => {
    const md = cvToProfileMarkdown({
      personalDetails: { fullName: 'Jane Smith', email: 'jane@x.io', address: 'Lisboa, Portugal' },
    });
    expect(parseProfileMd(md).location).toBe('Lisboa, Portugal');
  });
});

/** The bug this pins: the wizard wrote a profile the profile form could not
 * read back. Assert against the reader, not against a string — a string test is
 * what let the two drift apart in the first place. */
describe('cvToProfileMarkdown → parseProfileMd round-trip', () => {
  const parsed = {
    personalDetails: {
      fullName: 'Vitalii Kasap',
      title: 'Senior Frontend Software Engineer',
      email: 'vitalii@example.com',
      phone: '+49 171 206 4899',
      address: 'Nuremberg, Germany',
      website: 'vitaliikasap.com',
      linkedin: 'linkedin.com/in/vitaliikasap',
    },
    summary: 'Engineer.',
    experience: [{ company: 'Celonis', role: 'Senior Frontend Engineer', bullets: ['Shipped X'] }],
    skills: ['TypeScript', 'Angular'],
    education: [
      { degree: 'MSc Mechanical Engineering', institution: 'Odesa National Maritime University' },
      { degree: 'Frontend Developer Certificate', institution: 'FoxmindEd' },
    ],
    languages: [
      { language: 'English', level: 'C1' },
      { language: 'German', level: '' },
    ],
  };

  it('lands every identity field in the field the user expects', () => {
    const form = parseProfileMd(cvToProfileMarkdown(parsed));
    expect(form.name).toBe('Vitalii Kasap');
    expect(form.title).toBe('Senior Frontend Software Engineer');
    expect(form.location).toBe('Nuremberg, Germany');
    expect(form.email).toBe('vitalii@example.com');
    expect(form.phone).toBe('+49 171 206 4899');
    expect(form.website).toBe('vitaliikasap.com');
    expect(form.linkedin).toBe('linkedin.com/in/vitaliikasap');
  });

  it('carries education and languages into the profile', () => {
    const form = parseProfileMd(cvToProfileMarkdown(parsed));
    expect(form.education).toContain(
      'MSc Mechanical Engineering, Odesa National Maritime University',
    );
    expect(form.education).toContain('Frontend Developer Certificate, FoxmindEd');
    // Dateless education entries must not render a "Present" tail.
    expect(form.education).not.toContain('Present');
    expect(form.languages).toEqual(['English (C1)', 'German']);
  });

  it('loses nothing when the profile form saves it straight back', () => {
    const form = parseProfileMd(cvToProfileMarkdown(parsed));
    expect(parseProfileMd(serializeProfileForm(form))).toEqual(form);
  });

  it('does not turn the title into the name when the resume yielded no name', () => {
    const md = cvToProfileMarkdown({ personalDetails: { title: 'Senior Engineer' } });
    const form = parseProfileMd(md);
    expect(form.name).toBe('');
    expect(form.title).toBe('Senior Engineer');
  });

  it('stays empty when the parse yielded nothing, so it cannot overwrite a real profile', () => {
    expect(cvToProfileMarkdown({})).toBe('');
    expect(cvToProfileMarkdown({ personalDetails: {} })).toBe('');
  });
});

describe('parseCompRange', () => {
  it('extracts currency and two numbers from a range string', () => {
    expect(parseCompRange('EUR 90-120K')).toEqual({ currency: 'EUR', min: 90, max: 120 });
  });
  it('extracts a $ symbol and numbers', () => {
    expect(parseCompRange('$140k – $190k')).toEqual({ currency: '$', min: 140, max: 190 });
  });
  it('falls back to a default range on unparseable or missing input', () => {
    expect(parseCompRange(null)).toEqual({ currency: 'USD', min: 80, max: 120 });
    expect(parseCompRange('')).toEqual({ currency: 'USD', min: 80, max: 120 });
    expect(parseCompRange('no numbers here')).toEqual({ currency: 'USD', min: 80, max: 120 });
  });
  it('uses a single number as both min and max', () => {
    expect(parseCompRange('EUR 100K')).toEqual({ currency: 'EUR', min: 100, max: 100 });
  });
});

describe('normalizeCurrency', () => {
  it('maps symbols and codes to their selectable currency code', () => {
    expect(normalizeCurrency('$')).toBe('USD');
    expect(normalizeCurrency('USD')).toBe('USD');
    expect(normalizeCurrency('€')).toBe('EUR');
    expect(normalizeCurrency('EUR')).toBe('EUR');
  });
  it('falls back to USD for a currency without a selectable option', () => {
    expect(normalizeCurrency('GBP')).toBe('USD');
    expect(normalizeCurrency('£')).toBe('USD');
  });
});

describe('formatCompRange', () => {
  it('formats a 3-letter currency code with a space', () => {
    expect(formatCompRange({ currency: 'EUR', min: 90, max: 120 })).toBe('EUR 90K – EUR 120K');
  });
  it('formats a single-character currency symbol without a space', () => {
    expect(formatCompRange({ currency: '$', min: 140, max: 190 })).toBe('$140K – $190K');
  });
});

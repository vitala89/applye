import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CvContent, CvParsedContent, CvTemplate } from '@applye/core';
import { buildOnboardingCvInput, regionTagForUiLanguage } from '@applye/application';

/**
 * Coverage for `onboarding-content.util`, which lives in `libs/application`.
 *
 * These tests sit here for historical reasons: `buildCvContent` used to live in
 * `apps/desktop`, so a spec next to the function could only have asserted
 * against a stub, and every `contentJson` assertion would have proved nothing.
 * That is no longer true - the layout function is in `libs/core` and importable
 * from anywhere. The tests are unchanged and still real; only their address is
 * now arbitrary, and moving them belongs with the rest of the file moves rather
 * than here (ADR-0005, level two, item three).
 */
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

describe('buildOnboardingCvInput', () => {
  const overrides = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    parsedFullName: '',
    nameEdited: true,
  };
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
      overrides: {
        ...overrides,
        firstName: 'Jane',
        lastName: 'S. Smith',
        email: 'new@x.io',
        phone: '+49 30 000',
        parsedFullName: 'Jane Smith',
      },
    });
    expect(input.label).toBe('Jane S. Smith');
    expect(input.contentJson).toContain('new@x.io');
  });

  it('honours a contact field the user cleared instead of restoring the parse', () => {
    const input = buildOnboardingCvInput({
      ...base,
      overrides: {
        ...overrides,
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@x.io',
      },
    });
    // The review inputs are seeded from the parse, so blank means deleted.
    // A phone cleared for privacy must not reappear on the exported CV.
    expect(input.contentJson).not.toContain('+49 30 000');
    expect(input.contentJson).not.toContain('Berlin');
  });

  it('titles the CV with the resume name when the user confirmed the split untouched', () => {
    const input = buildOnboardingCvInput({
      ...base,
      parsed: parsedCv({
        personalDetails: {
          fullName: 'Kim Minjun',
          title: null,
          email: null,
          phone: null,
          address: null,
          website: null,
          linkedin: null,
        },
      }),
      overrides: {
        ...overrides,
        firstName: 'Minjun',
        lastName: 'Kim',
        parsedFullName: 'Kim Minjun',
        nameEdited: false,
      },
    });
    expect(input.label).toBe('Kim Minjun');
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

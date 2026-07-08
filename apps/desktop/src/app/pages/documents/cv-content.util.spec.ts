import type { CvContent, CvPersonalDetailsSection } from '@applye/core';
import { buildContactLine, normalizeCvContent } from './cv-content.util';

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

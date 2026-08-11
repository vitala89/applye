import type { CvPersonalDetailsSection } from '@applye/core';
import {
  buildContactLine,
  resolvePageSettings,
  visiblePersonalContactFields,
} from './cv-page.util';

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

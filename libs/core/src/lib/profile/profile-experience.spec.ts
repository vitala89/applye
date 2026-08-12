import {
  EMPTY_EXPERIENCE_ENTRY,
  parseExperienceEntries,
  serializeExperienceEntries,
} from './profile-experience';

describe('experience entries', () => {
  it('round-trips a full entry', () => {
    const md = [
      '### Senior Engineer - Acme',
      'Berlin · 2020 - 2023',
      '- Shipped the thing',
      '- Led the team',
    ].join('\n');
    const entries = parseExperienceEntries(md);
    expect(entries).toEqual([
      {
        role: 'Senior Engineer',
        company: 'Acme',
        location: 'Berlin',
        startDate: '2020',
        endDate: '2023',
        bullets: ['Shipped the thing', 'Led the team'],
      },
    ]);
    expect(parseExperienceEntries(serializeExperienceEntries(entries))).toEqual(entries);
  });

  it('treats an empty end date as ongoing', () => {
    const entry = { ...EMPTY_EXPERIENCE_ENTRY, role: 'Dev', company: 'Now', startDate: '2024' };
    const md = serializeExperienceEntries([entry]);
    expect(md).toContain('2024 - Present');
    // "Present" round-trips back to an empty endDate.
    expect(parseExperienceEntries(md)[0].endDate).toBe('');
  });

  it('keeps a legacy free-text block as a single bullet entry', () => {
    const entries = parseExperienceEntries('Did lots of things at various places.');
    expect(entries).toHaveLength(1);
    expect(entries[0].role).toBe('');
    expect(entries[0].bullets).toEqual(['Did lots of things at various places.']);
  });

  it('parses a header with no company separator', () => {
    const entries = parseExperienceEntries('### Freelance Consultant\n- Client work');
    expect(entries[0]).toMatchObject({ role: 'Freelance Consultant', company: '' });
  });

  it('drops fully blank entries on serialize', () => {
    expect(serializeExperienceEntries([{ ...EMPTY_EXPERIENCE_ENTRY }])).toBe('');
  });

  it('returns [] for empty input', () => {
    expect(parseExperienceEntries('')).toEqual([]);
  });

  it('round-trips ISO year-month dates', () => {
    const entries = [
      {
        role: 'Dev',
        company: 'Acme',
        location: 'Berlin',
        startDate: '2020-01',
        endDate: '2023-05',
        bullets: ['x'],
      },
    ];
    expect(parseExperienceEntries(serializeExperienceEntries(entries))).toEqual(entries);
  });

  it('keeps a digit-bearing location as location, not a date', () => {
    const entries = parseExperienceEntries('### Dev - Acme\nBerlin 10115 · 2020 - 2023\n- x');
    expect(entries[0].location).toBe('Berlin 10115');
    expect(entries[0].startDate).toBe('2020');
    expect(entries[0].endDate).toBe('2023');
  });

  it('preserves multiple location tokens on the meta line (lossless round-trip)', () => {
    const entries = [
      {
        role: 'Dev',
        company: 'Acme',
        location: 'Berlin · Germany',
        startDate: '2020',
        endDate: '2023',
        bullets: ['x'],
      },
    ];
    expect(parseExperienceEntries(serializeExperienceEntries(entries))).toEqual(entries);
  });

  it('keeps a postal code containing a year substring as location', () => {
    const entries = parseExperienceEntries('### Dev - Acme\nHamburg 20095 · 2020 - 2023\n- x');
    expect(entries[0].location).toBe('Hamburg 20095');
    expect(entries[0].startDate).toBe('2020');
    expect(entries[0].endDate).toBe('2023');
  });
});

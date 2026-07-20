import {
  ProfileForm,
  EMPTY_FORM,
  parseProfileMd,
  serializeProfileForm,
  profileCompleteness,
  missingFields,
  parseScoringJson,
  parseEducationEntries,
  serializeEducationEntries,
  parseExperienceEntries,
  serializeExperienceEntries,
  EMPTY_EXPERIENCE_ENTRY,
  parseLanguageEntries,
  serializeLanguageEntries,
  EMPTY_LANGUAGE_ENTRY,
  parseCompensation,
  serializeCompensation,
  EMPTY_COMPENSATION,
} from './profile-markdown';

const fullForm: ProfileForm = {
  name: 'Vitalii Kasap',
  title: 'Senior Frontend Engineer',
  location: 'Germany',
  email: 'vitalii@example.com',
  phone: '+49 171 206 4899',
  website: 'vitaliikasap.com',
  linkedin: 'linkedin.com/in/vitaliikasap',
  experienceText: 'Led frontend for a 2M DAU platform.\nCut bundle size 40%.',
  skills: ['React', 'TypeScript', 'Angular'],
  education: 'BSc Computer Science',
  languages: ['English', 'German'],
  compMin: '',
  compMax: '',
  compCurrency: '',
  compPeriod: '',
  notes: '',
  other: '',
};

const blankContact = { location: '', email: '', phone: '', website: '', linkedin: '' };

describe('education entries', () => {
  it('serializes a full entry as "- Title, Institution (start - end)"', () => {
    expect(
      serializeEducationEntries([
        { title: 'BSc Computer Science', institution: 'MIT', startDate: '2015', endDate: '2019' },
      ]),
    ).toBe('- BSc Computer Science, MIT (2015 - 2019)');
  });

  it('renders an empty end date as "Present"', () => {
    expect(
      serializeEducationEntries([
        { title: 'MSc AI', institution: 'TUM', startDate: '2020', endDate: '' },
      ]),
    ).toBe('- MSc AI, TUM (2020 - Present)');
  });

  it('drops fully blank entries', () => {
    expect(
      serializeEducationEntries([{ title: '', institution: '', startDate: '', endDate: '' }]),
    ).toBe('');
  });

  it('round-trips structured entries through serialize→parse', () => {
    const entries = [
      { title: 'BSc Computer Science', institution: 'MIT', startDate: '2015', endDate: '2019' },
      { title: 'AWS Solutions Architect', institution: 'AWS', startDate: '2022', endDate: '' },
    ];
    expect(parseEducationEntries(serializeEducationEntries(entries))).toEqual(entries);
  });

  it('parses a legacy free-text line into a title-only entry', () => {
    expect(parseEducationEntries('BSc Computer Science')).toEqual([
      { title: 'BSc Computer Science', institution: '', startDate: '', endDate: '' },
    ]);
  });

  it('treats a trailing "Present" in the range as an open end', () => {
    expect(parseEducationEntries('- MSc AI, TUM (2020 - Present)')).toEqual([
      { title: 'MSc AI', institution: 'TUM', startDate: '2020', endDate: '' },
    ]);
  });
});

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

describe('profile-markdown', () => {
  it('round-trips a full form through serialize→parse', () => {
    expect(parseProfileMd(serializeProfileForm(fullForm))).toEqual(fullForm);
  });

  it('returns EMPTY_FORM for empty input', () => {
    expect(parseProfileMd('')).toEqual(EMPTY_FORM);
    expect(parseProfileMd('   \n  ')).toEqual(EMPTY_FORM);
  });

  it('parses legacy freeform (name only, no headers) without losing text', () => {
    const form = parseProfileMd('Vitalii Kasap\nSenior Frontend Engineer · Germany');
    expect(form.name).toBe('Vitalii Kasap');
    expect(form.title).toBe('Senior Frontend Engineer');
    expect(form.location).toBe('Germany');
  });

  it('preserves unknown sections in other and re-appends on serialize', () => {
    const md = '# Jane\n\n## Skills\nGo\n\n## Awards\nBest dev 2025';
    const form = parseProfileMd(md);
    expect(form.skills).toEqual(['Go']);
    expect(form.other).toContain('## Awards');
    expect(serializeProfileForm(form)).toContain('## Awards');
    expect(serializeProfileForm(form)).toContain('Best dev 2025');
  });

  it('computes completeness from filled fields', () => {
    expect(profileCompleteness(EMPTY_FORM)).toBe(0);
    expect(profileCompleteness(fullForm)).toBe(100);
    const half = { ...EMPTY_FORM, title: 'Dev', location: 'EU', skills: ['Go'] };
    expect(profileCompleteness(half)).toBe(50);
  });

  it('lists missing field keys', () => {
    expect(missingFields(fullForm)).toEqual([]);
    expect(missingFields(EMPTY_FORM)).toEqual([
      'title',
      'location',
      'experience',
      'skills',
      'education',
      'languages',
    ]);
  });

  it('parses scoringJson wrapped in a ```json fence', () => {
    const raw = '```json\n{ "seniority": "senior", "skills": ["React"] }\n```';
    expect(parseScoringJson(raw)).toEqual({ seniority: 'senior', skills: ['React'] });
  });

  it('returns null for malformed or empty scoringJson', () => {
    expect(parseScoringJson('not json')).toBeNull();
    expect(parseScoringJson(null)).toBeNull();
    expect(parseScoringJson(undefined)).toBeNull();
  });

  it('returns null for a top-level JSON array (not a ScoringProfile object)', () => {
    expect(parseScoringJson('[1,2,3]')).toBeNull();
    expect(parseScoringJson('```json\n["a","b"]\n```')).toBeNull();
  });

  it('keeps a bare middot inside the title (only the spaced middot splits location)', () => {
    const form = parseProfileMd('# Jane\nFull·Stack Engineer · Berlin');
    expect(form.title).toBe('Full·Stack Engineer');
    expect(form.location).toBe('Berlin');
  });

  describe('contact block', () => {
    it('round-trips every contact field through the ## Contact section', () => {
      const md = serializeProfileForm(fullForm);
      expect(md).toContain('## Contact');
      expect(md).toContain('- Phone: +49 171 206 4899');
      expect(parseProfileMd(md)).toEqual(fullForm);
    });

    it('omits the Contact section entirely when no contact is set', () => {
      const md = serializeProfileForm({ ...fullForm, ...blankContact });
      expect(md).not.toContain('## Contact');
    });

    it('recovers a legacy middot contact line instead of reading it as the title', () => {
      // The exact shape onboarding used to write, and the exact bug: the phone
      // showed up in "Current role" and website/LinkedIn were lost on save.
      const form = parseProfileMd(
        '# Vitalii Kasap\n' +
          'vitalii@example.com · +49 171 206 4899 · Nuremberg, Germany · ' +
          'vitaliikasap.com · linkedin.com/in/vitaliikasap',
      );
      expect(form.title).toBe('');
      expect(form.email).toBe('vitalii@example.com');
      expect(form.phone).toBe('+49 171 206 4899');
      expect(form.location).toBe('Nuremberg, Germany');
      expect(form.website).toBe('vitaliikasap.com');
      expect(form.linkedin).toBe('linkedin.com/in/vitaliikasap');
    });

    it('reads a legacy italicised title line as the title', () => {
      const form = parseProfileMd('# Vitalii Kasap\n_Senior Frontend Engineer_\n+49 171 206 4899');
      expect(form.title).toBe('Senior Frontend Engineer');
      expect(form.phone).toBe('+49 171 206 4899');
    });

    it('does not mistake a plain "Title · Location" line for a contact line', () => {
      const form = parseProfileMd('# Jane\nSenior Engineer · St. Gallen, Switzerland');
      expect(form.title).toBe('Senior Engineer');
      expect(form.location).toBe('St. Gallen, Switzerland');
      expect(form.phone).toBe('');
      expect(form.website).toBe('');
    });

    it('survives a save round-trip without dropping contacts (the reported data loss)', () => {
      const legacy = '# Vitalii Kasap\nvitalii@example.com · vitaliikasap.com';
      const saved = serializeProfileForm(parseProfileMd(legacy));
      expect(saved).toContain('vitalii@example.com');
      expect(saved).toContain('vitaliikasap.com');
    });
  });

  describe('the name slot', () => {
    it('holds the name line open when the name is empty, so the title stays the title', () => {
      const md = serializeProfileForm({ ...EMPTY_FORM, title: 'Dev', location: 'EU' });
      const form = parseProfileMd(md);
      expect(form.name).toBe('');
      expect(form.title).toBe('Dev');
    });

    it('does not read a legacy contact-first line as the name', () => {
      const form = parseProfileMd('vitalii@example.com · +49 171 206 4899');
      expect(form.name).toBe('');
      expect(form.email).toBe('vitalii@example.com');
      expect(form.phone).toBe('+49 171 206 4899');
    });
  });

  describe('nothing lands on the floor', () => {
    it('splits a mixed "Title · Location · Phone" line across all three fields', () => {
      const form = parseProfileMd('# Vitalii Kasap\nSenior Engineer · Berlin · +49 171 2064899');
      expect(form.title).toBe('Senior Engineer');
      expect(form.location).toBe('Berlin');
      expect(form.phone).toBe('+49 171 2064899');
    });

    it('keeps a second website instead of discarding it', () => {
      const form = parseProfileMd('# Jane\ngithub.com/jane · myportfolio.dev');
      expect(form.website).toBe('github.com/jane');
      expect(form.notes).toContain('myportfolio.dev');
      expect(serializeProfileForm(form)).toContain('myportfolio.dev');
    });

    it('keeps contact lines it has no slot for', () => {
      const md =
        '# Jane\n\n## Contact\n- Email: j@x.io\n- GitHub: github.com/jane\n- Xing: xing.com/x';
      const form = parseProfileMd(md);
      expect(form.email).toBe('j@x.io');
      expect(form.notes).toContain('- GitHub: github.com/jane');
      const saved = serializeProfileForm(form);
      expect(saved).toContain('github.com/jane');
      expect(saved).toContain('xing.com/x');
    });

    it('keeps an unclassified header line under ## Notes', () => {
      const form = parseProfileMd('# Jane\nSenior Engineer · Berlin\n> Open to relocation');
      expect(form.notes).toBe('> Open to relocation');
      expect(serializeProfileForm(form)).toContain('## Notes\n> Open to relocation');
    });

    it('lets the title be cleared even when notes exist', () => {
      const form = { ...EMPTY_FORM, name: 'Jane', notes: '> Open to relocation' };
      expect(parseProfileMd(serializeProfileForm(form)).title).toBe('');
    });
  });

  describe('titles that look like URLs', () => {
    it.each([
      ['Growth Lead @ acme.io', 'Growth Lead @ acme.io'],
      ['Senior Data Scientist, M.Sc', 'Senior Data Scientist, M.Sc'],
    ])('reads %s as a title, not a website', (line, title) => {
      const form = parseProfileMd(`# Jane\n${line} · Berlin`);
      expect(form.title).toBe(title);
      expect(form.website).toBe('');
    });
  });

  /** Every data-loss bug in this file has been one instance of this invariant.
   * Assert the invariant, not just the instances. */
  describe('invariant: a save never deletes text', () => {
    const words = (md: string) =>
      md
        .split(/\s+/)
        .map((w) => w.replace(/^[_*#]+/, '').replace(/[_*]+$/, ''))
        .filter((w) => w && w !== '·' && w !== '-');

    it.each([
      [
        'legacy onboarding shape',
        '# Vitalii Kasap\n_Senior Engineer_\nv@x.io · +49 171 2064899 · Nuremberg, Germany · vitaliikasap.com · linkedin.com/in/vk',
      ],
      ['mixed header line', '# Jane\nSenior Engineer · Berlin · +49 171 2064899 · jane@x.io'],
      [
        'tagline and unknown section',
        '# Jane\nDev · Berlin\n> Open to relocation\n\n## Awards\nBest dev 2025',
      ],
      [
        'hand-written contact block',
        '# Jane\nDev\n\n## Contact\n- Email: j@x.io\n- GitHub: github.com/jane\nring me after 6pm',
      ],
      ['nameless profile', '#\nDev · Berlin'],
      ['duplicate slots', '# Jane\ngithub.com/jane · myportfolio.dev · a@x.io · b@x.io'],
    ])('%s survives parse → serialize intact', (_label, md) => {
      const saved = serializeProfileForm(parseProfileMd(md));
      for (const w of words(md)) expect(saved).toContain(w);
    });

    it.each([
      [
        'legacy onboarding shape',
        '# Vitalii Kasap\n_Senior Engineer_\nv@x.io · Nuremberg, Germany · vitaliikasap.com',
      ],
      ['mixed header line', '# Jane\nSenior Engineer · Berlin · +49 171 2064899'],
      [
        'tagline and unknown section',
        '# Jane\nDev · Berlin\n> Open to relocation\n\n## Awards\nBest dev 2025',
      ],
      [
        'hand-written contact block',
        '# Jane\nDev\n\n## Contact\n- Email: j@x.io\n- GitHub: github.com/jane',
      ],
    ])('%s reaches a fixed point after one save', (_label, md) => {
      const once = parseProfileMd(md);
      expect(parseProfileMd(serializeProfileForm(once))).toEqual(once);
    });
  });

  describe('language entries', () => {
    it('has an empty entry constant', () => {
      expect(EMPTY_LANGUAGE_ENTRY).toEqual({ language: '', level: '' });
    });

    it('parses "Language (Level)" items', () => {
      expect(parseLanguageEntries(['English (C1)', 'German (B2)'])).toEqual([
        { language: 'English', level: 'C1' },
        { language: 'German', level: 'B2' },
      ]);
    });

    it('parses a bare language with no level', () => {
      expect(parseLanguageEntries(['English'])).toEqual([{ language: 'English', level: '' }]);
    });

    it('round-trips', () => {
      const entries = [
        { language: 'English', level: 'Native' },
        { language: 'Spanish', level: '' },
      ];
      expect(parseLanguageEntries(serializeLanguageEntries(entries))).toEqual(entries);
    });

    it('serializes level only when present and drops blank rows', () => {
      expect(
        serializeLanguageEntries([
          { language: 'French', level: 'A2' },
          { language: 'Polish', level: '' },
          { language: '', level: 'C1' },
        ]),
      ).toEqual(['French (A2)', 'Polish']);
    });
  });

  describe('compensation', () => {
    it('round-trips a full compensation line', () => {
      const c = { min: '85000', max: '110000', currency: 'EUR', period: 'year' };
      expect(serializeCompensation(c)).toBe('85000 - 110000 EUR per year');
      expect(parseCompensation(serializeCompensation(c))).toEqual(c);
    });

    it('parses a min-only value', () => {
      expect(parseCompensation('90000 USD per year')).toEqual({
        min: '90000',
        max: '',
        currency: 'USD',
        period: 'year',
      });
    });

    it('parses numbers without a currency or period', () => {
      expect(parseCompensation('85000 - 110000')).toEqual({
        min: '85000',
        max: '110000',
        currency: '',
        period: '',
      });
    });

    it('parses currency symbols and month period', () => {
      expect(parseCompensation('5000 EUR per month')).toEqual({
        min: '5000',
        max: '',
        currency: 'EUR',
        period: 'month',
      });
    });

    it('serializes partial values without stray separators', () => {
      expect(serializeCompensation({ min: '80000', max: '', currency: 'EUR', period: '' })).toBe(
        '80000 EUR',
      );
      expect(serializeCompensation({ min: '', max: '', currency: 'USD', period: 'year' })).toBe(
        'USD per year',
      );
    });

    it('serializes fully-empty compensation to an empty string', () => {
      expect(serializeCompensation({ ...EMPTY_COMPENSATION })).toBe('');
    });

    it('does not treat "pa" inside an ordinary word as a period', () => {
      expect(parseCompensation('85000 EUR, negotiable for the right company').period).toBe('');
      expect(parseCompensation('90000 USD compare offers').period).toBe('');
    });

    it('still detects a standalone p.a. / p.m. abbreviation', () => {
      expect(parseCompensation('85000 EUR p.a.').period).toBe('year');
      expect(parseCompensation('5000 EUR pm').period).toBe('month');
    });
  });

  describe('compensation in profile markdown', () => {
    it('round-trips a Compensation section through parse/serialize', () => {
      const md = '# Jane\n\n## Compensation\n85000 - 110000 EUR per year\n';
      const form = parseProfileMd(md);
      expect(form.compMin).toBe('85000');
      expect(form.compMax).toBe('110000');
      expect(form.compCurrency).toBe('EUR');
      expect(form.compPeriod).toBe('year');
      expect(serializeProfileForm(form)).toContain('## Compensation\n85000 - 110000 EUR per year');
    });

    it('omits the Compensation section when unset', () => {
      const form = parseProfileMd('# Jane\n');
      expect(serializeProfileForm(form)).not.toContain('## Compensation');
    });
  });
});

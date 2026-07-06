import {
  appendCompensation,
  cvToProfileMarkdown,
  formatCompRange,
  parseArchetypesSkillResponse,
  parseCompRange,
} from './onboarding-content.util';

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
  it('appends a Compensation Target section when the range is non-empty', () => {
    const md = appendCompensation('# Jane Smith', 'EUR 90-120K');
    expect(md).toBe('# Jane Smith\n\n## Compensation Target\nEUR 90-120K');
  });

  it('returns the markdown unchanged when the range is empty or whitespace', () => {
    expect(appendCompensation('# Jane Smith', '')).toBe('# Jane Smith');
    expect(appendCompensation('# Jane Smith', '   ')).toBe('# Jane Smith');
  });
});

describe('cvToProfileMarkdown — address', () => {
  it('includes address in the contact line when present', () => {
    const md = cvToProfileMarkdown({
      personalDetails: { fullName: 'Jane Smith', email: 'jane@x.io', address: 'Lisboa, Portugal' },
    });
    expect(md).toContain('jane@x.io · Lisboa, Portugal');
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

describe('formatCompRange', () => {
  it('formats a 3-letter currency code with a space', () => {
    expect(formatCompRange({ currency: 'EUR', min: 90, max: 120 })).toBe('EUR 90K – EUR 120K');
  });
  it('formats a single-character currency symbol without a space', () => {
    expect(formatCompRange({ currency: '$', min: 140, max: 190 })).toBe('$140K – $190K');
  });
});

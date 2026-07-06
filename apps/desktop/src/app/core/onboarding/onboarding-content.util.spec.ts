import { cvToProfileMarkdown, parseArchetypesSkillResponse } from './onboarding-content.util';

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

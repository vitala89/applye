import { cvToProfileMarkdown } from './onboarding-content.util';

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

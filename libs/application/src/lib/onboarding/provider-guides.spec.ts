import { guideForProvider, PROVIDER_GUIDES } from './provider-guides';

describe('provider-guides', () => {
  it('returns a specific guide for claude with a console url and steps', () => {
    const g = guideForProvider('claude');
    expect(g.provider).toBe('claude');
    expect(g.consoleUrl).toMatch(/^https:\/\//);
    expect(g.stepKeys.length).toBeGreaterThan(0);
  });
  it('has guides for the v1 providers', () => {
    for (const p of ['claude', 'openai', 'deepseek'] as const) {
      expect(PROVIDER_GUIDES[p]).toBeDefined();
    }
  });
  it('falls back to a generic guide for a provider without a specific one', () => {
    const g = guideForProvider('gemini');
    expect(g.consoleUrl).toMatch(/^https:\/\//);
    expect(g.stepKeys.length).toBeGreaterThan(0);
  });
});

import {
  apiModelsFor,
  apiModelsToRestore,
  providerModelDefaults,
  resolveApiModels,
} from './api-models';

describe('api-models', () => {
  describe('apiModelsFor', () => {
    it('returns the catalogue for a provider API mode can serve', () => {
      expect(apiModelsFor('claude')).toContain('claude-opus-4-8');
      expect(apiModelsFor('deepseek')).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash']);
    });

    it('returns an empty list for a provider API mode cannot serve', () => {
      expect(apiModelsFor('openai')).toEqual([]);
      expect(apiModelsFor(null)).toEqual([]);
      expect(apiModelsFor(undefined)).toEqual([]);
      expect(apiModelsFor('nonsense')).toEqual([]);
    });

    it('lists the quality model first', () => {
      for (const provider of ['claude', 'deepseek'] as const) {
        expect(apiModelsFor(provider)[0]).toBe(providerModelDefaults(provider)?.default);
      }
    });
  });

  describe('providerModelDefaults', () => {
    it('pairs a quality and an economy model that are both in the catalogue', () => {
      for (const provider of ['claude', 'deepseek'] as const) {
        const d = providerModelDefaults(provider);
        expect(d).toBeDefined();
        expect(apiModelsFor(provider)).toContain(d?.default);
        expect(apiModelsFor(provider)).toContain(d?.economy);
      }
    });

    it('is undefined for a provider with no catalogue', () => {
      expect(providerModelDefaults('openai')).toBeUndefined();
    });
  });

  describe('apiModelsToRestore', () => {
    const claude = providerModelDefaults('claude');
    const known = apiModelsFor('claude');

    it('fixes a blank field - what CLI mode leaves behind', () => {
      expect(apiModelsToRestore({ defaultModel: '', economyModel: '' }, claude, known)).toEqual({
        defaultModel: 'claude-opus-4-8',
        economyModel: 'claude-haiku-4-5',
      });
    });

    it("fixes a field holding another provider's id", () => {
      expect(
        apiModelsToRestore(
          { defaultModel: 'deepseek-v4-pro', economyModel: 'deepseek-v4-flash' },
          claude,
          known,
        ),
      ).toEqual({ defaultModel: 'claude-opus-4-8', economyModel: 'claude-haiku-4-5' });
    });

    it('keeps a valid non-default pick', () => {
      expect(
        apiModelsToRestore(
          { defaultModel: 'claude-sonnet-4-6', economyModel: 'claude-haiku-4-5' },
          claude,
          known,
        ),
      ).toEqual({});
    });

    it('fixes only the field that is wrong', () => {
      expect(
        apiModelsToRestore({ defaultModel: 'claude-sonnet-4-6', economyModel: '' }, claude, known),
      ).toEqual({ economyModel: 'claude-haiku-4-5' });
    });

    it('does nothing without defaults to restore to', () => {
      expect(apiModelsToRestore({ defaultModel: '', economyModel: '' }, undefined, [])).toEqual({});
    });

    it('handles a missing settings row', () => {
      expect(apiModelsToRestore(null, claude, known)).toEqual({
        defaultModel: 'claude-opus-4-8',
        economyModel: 'claude-haiku-4-5',
      });
    });
  });

  describe('resolveApiModels', () => {
    it('always returns both fields filled', () => {
      const resolved = resolveApiModels('deepseek', { defaultModel: '', economyModel: '' });
      expect(resolved).toEqual({
        defaultModel: 'deepseek-v4-pro',
        economyModel: 'deepseek-v4-flash',
      });
    });

    it('remaps a Claude pair onto DeepSeek - the onboarding bug', () => {
      expect(
        resolveApiModels('deepseek', {
          defaultModel: 'claude-opus-4-8',
          economyModel: 'claude-haiku-4-5',
        }),
      ).toEqual({ defaultModel: 'deepseek-v4-pro', economyModel: 'deepseek-v4-flash' });
    });

    it('keeps a valid pick for the same provider', () => {
      expect(
        resolveApiModels('claude', {
          defaultModel: 'claude-sonnet-4-6',
          economyModel: 'claude-haiku-4-5',
        }),
      ).toEqual({ defaultModel: 'claude-sonnet-4-6', economyModel: 'claude-haiku-4-5' });
    });

    it('falls back to the defaults with nothing stored', () => {
      expect(resolveApiModels('claude')).toEqual({
        defaultModel: 'claude-opus-4-8',
        economyModel: 'claude-haiku-4-5',
      });
    });

    it('is null for a provider API mode cannot serve', () => {
      expect(resolveApiModels('openai', { defaultModel: '', economyModel: '' })).toBeNull();
    });

    it('never returns an empty model, whatever it is given', () => {
      const cases = [
        { defaultModel: '', economyModel: 'claude-haiku-4-5' },
        { defaultModel: 'claude-opus-4-8', economyModel: '' },
        { defaultModel: undefined, economyModel: undefined },
      ];
      for (const c of cases) {
        const resolved = resolveApiModels('claude', c);
        expect(resolved?.defaultModel).toBeTruthy();
        expect(resolved?.economyModel).toBeTruthy();
      }
    });
  });
});

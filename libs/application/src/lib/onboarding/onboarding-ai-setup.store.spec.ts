import { TestBed } from '@angular/core/testing';
import { AiService, DbService, KeysService } from '@applye/data';
import { OnboardingAiKeyStore } from './onboarding-ai-key.store';
import { OnboardingAiSetupStore } from './onboarding-ai-setup.store';
import { OnboardingCliBridgeStore } from './onboarding-cli-bridge.store';

describe('OnboardingAiSetupStore', () => {
  let store: OnboardingAiSetupStore;
  let aiKey: OnboardingAiKeyStore;
  let getSettings: jest.Mock;
  let updateSettings: jest.Mock;

  beforeEach(() => {
    getSettings = jest.fn().mockResolvedValue({ aiMode: 'api', provider: 'claude' });
    updateSettings = jest.fn().mockResolvedValue({});

    TestBed.configureTestingModule({
      providers: [
        OnboardingAiKeyStore,
        OnboardingAiSetupStore,
        OnboardingCliBridgeStore,
        { provide: DbService, useValue: { getSettings, updateSettings } },
        { provide: AiService, useValue: { probeClis: jest.fn().mockResolvedValue([]) } },
        { provide: KeysService, useValue: { hasProviderKey: jest.fn().mockResolvedValue(false) } },
      ],
    });
    store = TestBed.inject(OnboardingAiSetupStore);
    aiKey = TestBed.inject(OnboardingAiKeyStore);
  });

  describe('dispatch', () => {
    /// The step's choices only reach the settings row on finish, so a dispatch
    /// that consulted settings sent every in-wizard call to the pre-onboarding
    /// defaults - a DeepSeek user was routed to Claude, which had no key, and
    /// got "Couldn't parse that resume" for it.
    it('answers from the wizard’s own state, never from the settings row', () => {
      aiKey.provider.set('deepseek');
      aiKey.economyModel.set('deepseek-v4-flash');

      expect(store.dispatch()).toEqual({
        mode: 'api',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      });
      expect(getSettings).not.toHaveBeenCalled();
    });

    /// The stored ids are API ids; `codex --model claude-haiku-4-5` is a
    /// guaranteed failure, so CLI mode sends none and lets the CLI choose.
    it('sends no model in CLI mode', async () => {
      aiKey.economyModel.set('claude-haiku-4-5');

      await store.chooseMode('cli');

      expect(store.dispatch().model).toBe('');
    });
  });

  describe('chooseMode', () => {
    it('moves a provider the target mode cannot serve', async () => {
      aiKey.provider.set('deepseek');

      await store.chooseMode('cli');

      // DeepSeek has no CLI, so staying on it would strand the user on a
      // combination that can only fail at call time.
      expect(aiKey.provider()).toBe('claude');
    });

    it('leaves a provider the target mode can serve alone', async () => {
      aiKey.provider.set('openai');
      await store.chooseMode('cli');

      expect(aiKey.provider()).toBe('openai');
    });
  });

  describe('what reaches the settings row', () => {
    it('writes the model pair alongside the provider in API mode', async () => {
      aiKey.provider.set('deepseek');
      aiKey.qualityModel.set('deepseek-v4-pro');
      aiKey.economyModel.set('deepseek-v4-flash');

      await store.persistChoice();

      expect(updateSettings).toHaveBeenCalledWith({
        aiMode: 'api',
        provider: 'deepseek',
        defaultModel: 'deepseek-v4-pro',
        economyModel: 'deepseek-v4-flash',
      });
    });

    /// Half a pair is worse than none: it points the app at one provider's
    /// model id while the other field still holds the previous one's.
    it('writes neither model when only one is set', async () => {
      aiKey.qualityModel.set('claude-opus-4-8');
      aiKey.economyModel.set('');

      await store.persistChoice();

      expect(updateSettings).toHaveBeenCalledWith({ aiMode: 'api', provider: 'claude' });
    });

    it('blanks the model ids on finish in CLI mode', async () => {
      aiKey.qualityModel.set('claude-opus-4-8');
      aiKey.economyModel.set('claude-haiku-4-5');
      await store.chooseMode('cli');
      updateSettings.mockClear();

      await store.markSeen();

      expect(updateSettings).toHaveBeenCalledWith({
        onboardingSeen: true,
        aiMode: 'cli',
        provider: 'claude',
        defaultModel: '',
        economyModel: '',
      });
    });

    /// Fail open: a settings write that throws must never trap the user inside
    /// the wizard with no way out.
    it('swallows a refused write rather than blocking the wizard', async () => {
      updateSettings.mockRejectedValue(new Error('locked'));

      await expect(store.markSeen()).resolves.toBeUndefined();
    });
  });

  describe('seedFromSettings', () => {
    it('opens the step on the provider the user already has', async () => {
      getSettings.mockResolvedValue({ aiMode: 'api', provider: 'deepseek' });

      await store.seedFromSettings();

      expect(aiKey.provider()).toBe('deepseek');
    });

    /// The read is async and the step is interactive from the first frame, so
    /// a fast click has to win over the seed rather than be overwritten by it.
    it('leaves a choice the user already made alone', async () => {
      getSettings.mockResolvedValue({ aiMode: 'cli', provider: 'openai' });
      aiKey.touched.set(true);

      await store.seedFromSettings();

      expect(store.mode()).toBe('api');
      expect(aiKey.provider()).toBe('claude');
    });

    it('keeps the defaults when there is no settings row to read', async () => {
      getSettings.mockRejectedValue(new Error('no tauri runtime'));

      await store.seedFromSettings();

      expect(store.mode()).toBe('api');
    });
  });
});

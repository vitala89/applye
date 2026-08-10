import { TestBed } from '@angular/core/testing';
import { KeysService } from '@applye/data';
import { OnboardingAiKeyStore } from './onboarding-ai-key.store';

describe('OnboardingAiKeyStore', () => {
  let hasProviderKey: jest.Mock;
  let setProviderKey: jest.Mock;
  let service: OnboardingAiKeyStore;

  beforeEach(() => {
    hasProviderKey = jest.fn().mockResolvedValue(false);
    setProviderKey = jest.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        OnboardingAiKeyStore,
        { provide: KeysService, useValue: { hasProviderKey, setProviderKey } },
      ],
    });
    service = TestBed.inject(OnboardingAiKeyStore);
  });

  /// The keyring lookup is async and the user can switch provider while it is
  /// in flight. Without the guard, the answer for the provider they left lands
  /// on the one they are now looking at - so a provider with no key can show as
  /// connected, and the Continue button unlocks on a key that is not there.
  describe('a keyring answer that arrives after the user moved on', () => {
    it('does not land on the provider they switched to', async () => {
      let resolveClaude: (has: boolean) => void = () => undefined;
      hasProviderKey.mockImplementation((provider: string) =>
        provider === 'claude'
          ? new Promise<boolean>((resolve) => {
              resolveClaude = resolve;
            })
          : Promise.resolve(false),
      );

      const pending = service.refreshKeyStored(); // asks about 'claude'
      service.provider.set('deepseek'); // the user moves on
      resolveClaude(true); // claude's answer arrives late
      await pending;

      expect(service.keyStored()).toBe(false);
    });

    it('lands normally when the provider did not change', async () => {
      hasProviderKey.mockResolvedValue(true);

      await service.refreshKeyStored();

      expect(service.keyStored()).toBe(true);
    });
  });

  describe('saving a key', () => {
    it('rejects something too short to be a key without touching the keyring', async () => {
      service.keyInput.set('sk-tiny');

      await service.saveKey();

      expect(setProviderKey).not.toHaveBeenCalled();
      expect(service.keyStatus()).toBe('invalid');
    });

    it('leaves a stored key reported as present when the write throws', async () => {
      service.keyStored.set(true);
      setProviderKey.mockRejectedValue(new Error('keyring locked'));
      service.keyInput.set('sk-0123456789abcdef');

      await service.saveKey();

      expect(service.keyStored()).toBe(true);
      expect(service.keySaveError()).toBe(true);
      expect(service.keyStatus()).toBe('idle');
    });
  });
});

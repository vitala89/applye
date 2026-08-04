import { TestBed } from '@angular/core/testing';
import { AiService, KeysService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { OnboardingAiKeyService } from './onboarding-ai-key.service';
import { OnboardingCliBridgeService } from './onboarding-cli-bridge.service';

describe('OnboardingCliBridgeService', () => {
  let probeClis: jest.Mock;
  let installCli: jest.Mock;
  let service: OnboardingCliBridgeService;

  beforeEach(() => {
    probeClis = jest.fn().mockResolvedValue([]);
    installCli = jest.fn().mockResolvedValue({ ok: true });

    TestBed.configureTestingModule({
      providers: [
        OnboardingAiKeyService,
        OnboardingCliBridgeService,
        { provide: AiService, useValue: { probeClis, installCli } },
        { provide: KeysService, useValue: { hasProviderKey: jest.fn().mockResolvedValue(false) } },
        TranslateService,
      ],
    });
    service = TestBed.inject(OnboardingCliBridgeService);
  });

  /// The probe is a Tauri command. In a browser - the dev server, the web
  /// build, a test - it does not exist, and an unhandled rejection here would
  /// take the whole wizard down on step one.
  it('reads a failed probe as "none found" rather than propagating', async () => {
    probeClis.mockRejectedValue(new Error('not a tauri runtime'));

    await service.refreshProbe();

    expect(service.statuses()).toEqual([]);
    expect(service.probing()).toBe(false);
  });

  it('clears the probing flag even when the probe throws', async () => {
    probeClis.mockRejectedValue(new Error('boom'));
    await service.refreshProbe();
    expect(service.probing()).toBe(false);
  });

  describe('installing a CLI', () => {
    /// Installing runs npm against the user's machine. A second click while
    /// one is in flight would run it twice concurrently.
    it('refuses a second install while one is running', async () => {
      let finish: (r: { ok: boolean }) => void = () => undefined;
      installCli.mockImplementation(() => new Promise((resolve) => (finish = resolve)));

      const first = service.install('claude');
      await service.install('openai');

      expect(installCli).toHaveBeenCalledTimes(1);
      expect(installCli).toHaveBeenCalledWith('claude');

      finish({ ok: true });
      await first;
    });

    it('re-probes after a successful install, so the row stops lying', async () => {
      await service.install('claude');

      expect(probeClis).toHaveBeenCalled();
      expect(service.installError()).toBeNull();
    });

    it('surfaces a refused install instead of a silent no-op', async () => {
      installCli.mockResolvedValue({ ok: false, message: 'npm not found', needsNode: true });

      await service.install('claude');

      expect(service.installError()).toEqual({ message: 'npm not found', needsNode: true });
      expect(service.installing()).toBeNull();
    });

    it('reports a thrown install as an error the user can read', async () => {
      installCli.mockRejectedValue(new Error('EACCES'));

      await service.install('claude');

      expect(service.installError()?.message).toContain('EACCES');
      expect(service.installing()).toBeNull();
    });
  });

  describe('the setup card for the selected CLI', () => {
    /// "Runs" is not "signed in": the probe only proves the binary executes,
    /// so a working CLI still gets the sign-in command rather than nothing.
    it('still shows the sign-in command when the CLI already works', () => {
      service.statuses.set([{ provider: 'claude', installed: true, working: true } as never]);

      const setup = service.selectedSetup();

      expect(setup?.working).toBe(true);
      expect(setup?.signInCommand).toBe('claude');
      expect(setup?.steps).toEqual([]);
    });

    it('offers repair rather than install when the CLI is present but broken', () => {
      service.statuses.set([{ provider: 'claude', installed: true, working: false } as never]);

      const setup = service.selectedSetup();

      expect(setup?.working).toBe(false);
      // The repair copy, not the first-install copy.
      expect(setup?.steps[0].text).toContain('Reinstall');
      expect(setup?.steps[0].command).toBe('npm install -g @anthropic-ai/claude-code');
    });

    it('has nothing to say about a provider with no CLI at all', () => {
      TestBed.inject(OnboardingAiKeyService).provider.set('deepseek');

      expect(service.selectedSetup()).toBeNull();
    });
  });

  it('reports the selected CLI as working only when its own row says so', () => {
    service.statuses.set([{ provider: 'openai', installed: true, working: true } as never]);

    // The selected provider is still `claude`, which has no row.
    expect(service.selectedWorks()).toBe(false);

    TestBed.inject(OnboardingAiKeyService).provider.set('openai');
    expect(service.selectedWorks()).toBe(true);
  });
});

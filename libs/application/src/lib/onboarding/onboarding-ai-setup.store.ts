import { Injectable, computed, inject, signal } from '@angular/core';
import type { AiMode, AiProvider } from '@applye/core';
import { ProfileSettingsGateway } from '@applye/data';
import { OnboardingAiKeyStore } from './onboarding-ai-key.store';
import { OnboardingCliBridgeStore } from './onboarding-cli-bridge.store';
import { ONBOARDING_CLI_PROVIDERS } from './onboarding-cli.util';
import type { OnboardingAiDispatch } from './onboarding-resume.store';

/**
 * The AI-setup step as a whole: which of the two ways to reach a model the user
 * picked, and everything that follows from that choice.
 *
 * Its two halves already had stores - `OnboardingAiKeyStore` for the key flow,
 * `OnboardingCliBridgeStore` for the local CLIs - but the mode that decides
 * between them, the settings the step writes, and the dispatch every other
 * wizard store calls through had nowhere to live except the page. This is that
 * place. It injects both halves rather than duplicating their state (ADR-0005,
 * amendment fourteen).
 */
@Injectable()
export class OnboardingAiSetupStore {
  private readonly db = inject(ProfileSettingsGateway);
  private readonly aiKey = inject(OnboardingAiKeyStore);
  private readonly cli = inject(OnboardingCliBridgeStore);

  /**
   * API key or CLI bridge. Onboarding offered only the key flow while CLI mode
   * was unimplemented; now that it works, a user who already pays for Claude
   * Code or Codex should never be asked to buy API credit on top.
   */
  readonly mode = signal<AiMode>('api');
  readonly isCliMode = computed(() => this.mode() === 'cli');

  /** Providers that API mode can actually dispatch to. `ai/api.rs` handles
   * `claude` and `deepseek` and answers anything else with "not supported in
   * API mode yet", so offering OpenAI here sent the user to buy a key that
   * every later action would reject. OpenAI is reachable, but through Codex in
   * CLI mode - see `ONBOARDING_CLI_PROVIDERS`. */
  readonly v1Providers: readonly AiProvider[] = ['claude', 'deepseek'];

  /** Connected means a stored key in API mode, and a CLI that actually runs in
   * CLI mode - where there is no key to store at all. True for a key this run
   * saved AND one an earlier run left in the keyring. */
  readonly connected = computed(() =>
    this.isCliMode() ? this.cli.selectedWorks() : this.aiKey.keyStored(),
  );

  async chooseMode(mode: AiMode): Promise<void> {
    if (this.mode() === mode) return;
    this.aiKey.touched.set(true);
    this.mode.set(mode);
    this.cli.installError.set(null);
    if (mode === 'cli') {
      // DeepSeek has no CLI, so a user arriving from the key flow with it
      // selected would land on a provider this mode cannot serve.
      if (!ONBOARDING_CLI_PROVIDERS.includes(this.aiKey.provider())) {
        this.aiKey.provider.set('claude');
      }
      await this.cli.refreshProbe();
      return;
    }
    // Back to API mode. A provider API mode cannot serve has to move, and the
    // model pair has to be valid either way - CLI mode is allowed to leave it
    // blank, and a blank model is not a valid API request.
    if (!this.v1Providers.includes(this.aiKey.provider())) {
      this.aiKey.provider.set('claude');
    }
    this.aiKey.reconcileModels();
  }

  /**
   * Opens the AI step on what the user already has rather than on the hardcoded
   * defaults: a re-run that showed "Claude" while the settings row said DeepSeek
   * would silently move them back on Finish.
   *
   * The model pair is reconciled rather than trusted. A row written before this
   * step existed can hold another provider's model id, or the empty string a
   * CLI-mode run leaves behind, and neither is a valid API request.
   */
  async seedFromSettings(): Promise<void> {
    try {
      const settings = await this.db.getSettings();
      // The read is async and the step is interactive from the first frame, so
      // a fast click must win over the seed rather than be overwritten by it.
      if (this.aiKey.touched()) return;
      if (settings.aiMode === 'cli' || settings.aiMode === 'api') {
        this.mode.set(settings.aiMode);
      }
      const provider = settings.provider;
      const allowed = this.isCliMode() ? ONBOARDING_CLI_PROVIDERS : this.v1Providers;
      if (provider && allowed.includes(provider) && provider !== this.aiKey.provider()) {
        this.aiKey.provider.set(provider);
        // The constructor already asked about the provider it opened on; a
        // different one has to be asked about too, or Ready reports "not
        // connected" for a provider that does have a key.
        void this.aiKey.refreshKeyStored();
      }
      this.aiKey.qualityModel.set(settings.defaultModel ?? '');
      this.aiKey.economyModel.set(settings.economyModel ?? '');
      if (this.isCliMode()) {
        await this.cli.refreshProbe();
        return;
      }
      this.aiKey.reconcileModels();
    } catch {
      // No settings row yet, or no Tauri runtime - the defaults above stand.
      this.aiKey.reconcileModels();
    }
  }

  /**
   * Which provider the wizard's own AI calls must go to.
   *
   * The AI-setup step's choices only reach the settings row when the wizard
   * finishes, so reading `aiMode`/`provider` back from settings here dispatched
   * every in-wizard call to the pre-onboarding defaults (`api` + `claude`).
   * A user who picked DeepSeek, or CLI mode, was sent to a provider with no key
   * and got only "Couldn't parse that resume" for it. This store's own state is
   * the truth for the duration of the wizard - which is exactly why it must not
   * inject `SettingsStore` and read the row back.
   *
   * The model follows the same rule as `markSeen()`: the stored ids are API ids
   * (`claude-haiku-4-5`) that no CLI accepts, so CLI mode sends none and lets
   * the CLI pick its own default.
   *
   * In API mode the model comes from the wizard's own economy pick, not from
   * `settings.economyModel`. Reading it back from settings was the same class of
   * bug as reading the provider back: the settings row still holds the previous
   * provider's model id, or the empty string a CLI-mode run left behind, and
   * either one is rejected by the provider the user just chose.
   */
  dispatch(): OnboardingAiDispatch {
    return {
      mode: this.mode(),
      provider: this.aiKey.provider(),
      model: this.isCliMode() ? '' : this.aiKey.economyModel(),
    };
  }

  /** The mode and provider chosen on the AI-setup step must be persisted, not
   * just held in wizard state: every AI call outside the wizard reads them back
   * from settings. Without this the wizard was a no-op for anyone who did not
   * pick the default - choosing OpenAI or DeepSeek and saving that key still
   * left `provider = 'claude'`, so every task went to Claude, which had no key.
   *
   * The model ids are deliberately left alone until the wizard finishes: a user
   * who tries CLI mode and switches back to API within the same run would
   * otherwise be left with the blanked ids and no model to call.
   *
   * Written through `ProfileSettingsGateway` rather than `SettingsStore`, whose `persist()`
   * answers `false` until something has called `load()` - which the wizard, an
   * overlay over whatever route is behind it, never does. */
  async persistChoice(): Promise<void> {
    try {
      await this.db.updateSettings({
        aiMode: this.mode(),
        provider: this.aiKey.provider(),
        // The model ids travel with the provider. Writing one without the other
        // is what left DeepSeek users pointed at a Claude model id.
        ...this.apiModelPatch(),
      });
    } catch {
      // fail open - never trap the user in onboarding
    }
  }

  async markSeen(): Promise<void> {
    try {
      await this.db.updateSettings({
        onboardingSeen: true,
        aiMode: this.mode(),
        provider: this.aiKey.provider(),
        // In CLI mode the stored model ids are API ids (`claude-opus-4-8`),
        // which a CLI does not accept - `codex --model claude-opus-4-8` is a
        // guaranteed failure. Blank them so the CLI picks its own default; the
        // user can choose a CLI model name later in Settings.
        //
        // In API mode the opposite is required: the pair chosen on the AI step
        // has to land in the settings row, or the rest of the app keeps calling
        // the previous provider's model.
        ...(this.isCliMode() ? { defaultModel: '', economyModel: '' } : this.apiModelPatch()),
      });
    } catch {
      // fail open - never trap the user in onboarding
    }
  }

  /** The model fields to persist alongside the provider, or nothing in CLI mode,
   * where a blank pair is the correct value ("let the CLI choose"). */
  private apiModelPatch(): { defaultModel: string; economyModel: string } | Record<string, never> {
    if (this.isCliMode()) return {};
    const quality = this.aiKey.qualityModel();
    const economy = this.aiKey.economyModel();
    if (!quality || !economy) return {};
    return { defaultModel: quality, economyModel: economy };
  }
}

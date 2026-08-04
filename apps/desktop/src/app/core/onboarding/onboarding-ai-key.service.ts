import { Injectable, computed, inject, signal } from '@angular/core';
import { AiProvider, apiModelsFor, resolveApiModels } from '@applye/core';
import { KeysService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { guideForProvider } from './provider-guides';

/** Feedback for the key INPUT only - never a claim about the keyring. Whether a
 * key exists is `keyStored`, which a failed paste must not disturb. Neither
 * means the provider accepted the key: nothing here calls the API. */
export type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid';

/**
 * The API-key half of the onboarding AI step: which provider is selected, the
 * key the user is typing, whether one is already in the keyring, and the model
 * pair that gets persisted alongside the provider.
 *
 * It lives outside the wizard component because the card that edits this state
 * is its own component, while the wizard's own logic still reads the result -
 * `keyPresent` gates the Continue button and the Ready step's summary, and
 * `apiModelPatch()` writes the model ids into settings. Passing the state down
 * and eventing every change back up would have split the save flow across the
 * boundary; the card mutates through this service instead, and the wizard reads
 * the same signals.
 */
@Injectable()
export class OnboardingAiKeyService {
  private readonly keys = inject(KeysService);
  private readonly t = inject(TranslateService).t;

  readonly provider = signal<AiProvider>('claude');
  readonly guide = computed(() => guideForProvider(this.provider()));

  readonly keyInput = signal('');
  readonly keyStatus = signal<KeyStatus>('idle');
  /** Whether the selected provider has a key in the OS keyring - from the
   * keyring itself, so it survives a re-run and an input the user fumbles. */
  readonly keyStored = signal(false);
  readonly keySaveError = signal(false);

  /**
   * The quality and economy model ids for API mode.
   *
   * These exist because the wizard's own AI calls need a model the chosen
   * provider accepts, and nothing else in the wizard supplied one. The step
   * persisted `provider` but never the model ids, so picking DeepSeek left the
   * Claude defaults in the settings row - or, after a CLI-mode run blanked them,
   * an empty string - and every wizard call came back as
   * `The supported API model names are deepseek-v4-pro or deepseek-v4-flash,
   * but you passed .`
   *
   * Seeded from the stored settings so a re-run shows what the user already has,
   * and reconciled against the selected provider's catalogue so a stale or blank
   * value can never survive into a request.
   */
  readonly qualityModel = signal('');
  readonly economyModel = signal('');

  /** Set once the user changes anything on the AI step, so the async seed from
   * settings can tell "still showing defaults" from "the user has chosen". */
  readonly touched = signal(false);

  /** Models offered for the selected provider. Empty in CLI mode, where the
   * model string is free text the CLI interprets. */
  readonly providerModels = computed(() => apiModelsFor(this.provider()));

  readonly providerSteps = computed(() =>
    this.guide().stepKeys.map((key, i) => ({ n: i + 1, text: this.t()(key) })),
  );

  /** Selecting a provider clears the previous one's key state: a status or an
   * error left behind would describe a provider the user is no longer on. */
  selectProvider(id: AiProvider): void {
    this.touched.set(true);
    this.provider.set(id);
    this.keyStatus.set('idle');
    this.keyStored.set(false);
    this.keySaveError.set(false);
    this.reconcileModels();
    void this.refreshKeyStored();
  }

  /** Puts the model pair back on the selected provider's catalogue. A value
   * that is blank, or belongs to the provider the user just switched away from,
   * is replaced by that provider's default; a valid non-default pick is kept. */
  reconcileModels(): void {
    const models = resolveApiModels(this.provider(), {
      defaultModel: this.qualityModel(),
      economyModel: this.economyModel(),
    });
    if (!models) return;
    this.qualityModel.set(models.defaultModel);
    this.economyModel.set(models.economyModel);
  }

  setQualityModel(model: string): void {
    this.touched.set(true);
    this.qualityModel.set(model);
  }

  setEconomyModel(model: string): void {
    this.touched.set(true);
    this.economyModel.set(model);
  }

  /** A key saved by an earlier run lives in the keyring, not in this service,
   * so without this a re-run shows "not connected" on the Ready step for a
   * provider that is in fact connected. */
  async refreshKeyStored(): Promise<void> {
    const provider = this.provider();
    try {
      const has = await this.keys.hasProviderKey(provider);
      // A provider switch mid-await must not land its answer on the new one.
      if (this.provider() !== provider) return;
      this.keyStored.set(has);
    } catch {
      // Keyring unreadable - leave it as "no key" and let the user paste one.
    }
  }

  async openConsole(): Promise<void> {
    await openUrl(this.guide().consoleUrl);
  }

  async openVideo(): Promise<void> {
    const url = this.guide().helpVideoUrl;
    if (url) await openUrl(url);
  }

  /** Lightweight format sanity-check (length + provider prefix hint) before
   * touching the keyring - this is NOT a live validation against the
   * provider's API (no such check exists), just a copy-paste sanity guard.
   * The button and status copy say "save", never "valid", for that reason. */
  async saveKey(): Promise<void> {
    const key = this.keyInput().trim();
    if (!key) return;
    const prefix = this.guide().keyPrefix;
    const looksValid = key.length >= 15 && (!prefix || key.toLowerCase().startsWith('sk'));
    if (!looksValid) {
      this.keyStatus.set('invalid');
      return;
    }
    this.keyStatus.set('checking');
    this.keySaveError.set(false);
    try {
      await this.keys.setProviderKey(this.provider(), key);
      const saved = await this.keys.hasProviderKey(this.provider());
      this.keyStatus.set(saved ? 'valid' : 'invalid');
      this.keyStored.set(saved);
    } catch {
      // A write that fails leaves whatever was already in the keyring intact,
      // so `keyStored` is deliberately untouched here - reporting "no key" for
      // a provider that still has a working one is the worse lie.
      this.keyStatus.set('idle');
      this.keySaveError.set(true);
    }
  }
}

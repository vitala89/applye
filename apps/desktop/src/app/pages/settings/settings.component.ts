import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, Moon, Send, Sun, LucideAngularModule } from 'lucide-angular';
import {
  CliBridgeStore,
  ConnectionTestStore,
  GeoTargetStore,
  ProviderKeyStore,
  SettingsStore,
  CLI_PROVIDERS,
  hasApi,
  hasCli,
  apiModelsToRestore,
} from '@applye/application';
import {
  type GeoScopeKey,
  type LocalMarket,
  LANGUAGE_NATIVE_NAMES,
  type Settings,
  type SupportedLanguage,
  apiModelsFor,
  providerModelDefaults,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { AboutUpdateComponent } from './about-update.component';
import { HealthCheckPanelComponent } from '../../core/health-check-panel.component';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ThemeService, Theme } from '../../core/theme.service';
import { ToastService } from '@applye/application';
import { SettingsAiProviderComponent } from './settings-ai-provider/settings-ai-provider.component';
import { SettingsApiKeyComponent } from './settings-api-key/settings-api-key.component';
import { SettingsCliStatusComponent } from './settings-cli-status/settings-cli-status.component';
import { SettingsDangerZoneComponent } from './settings-danger-zone/settings-danger-zone.component';
import { SettingsGeoTargetComponent } from './settings-geo-target/settings-geo-target.component';

const LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

// Vendor (company) the API key talks to, per provider. Used in the privacy
// note: every cloud provider sends job + profile text off-device, so the note
// is shown for all of them, not just DeepSeek. DeepSeek additionally carries a
// jurisdiction warning (China-based) on top of this shared disclosure.
const PROVIDER_VENDORS: Record<string, string> = {
  claude: 'Anthropic',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  gemini: 'Google',
};

/**
 * Settings renders and delegates. Five stores hold what used to be this class:
 * the settings row, the provider key, the CLI bridge, the geo target and the
 * connection test.
 *
 * What stays here is what does not belong below a layer boundary - the theme,
 * the locale, every toast, and the reload after a factory reset - plus the
 * decisions that pair two stores: which provider is valid in which mode, and
 * which model pair to restore when it changes.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    HealthCheckPanelComponent,
    AboutUpdateComponent,
    SettingsAiProviderComponent,
    SettingsApiKeyComponent,
    SettingsCliStatusComponent,
    SettingsDangerZoneComponent,
    SettingsGeoTargetComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsStore, ProviderKeyStore, CliBridgeStore, GeoTargetStore, ConnectionTestStore],
})
export class SettingsComponent implements OnInit {
  protected readonly store = inject(SettingsStore);
  protected readonly key = inject(ProviderKeyStore);
  protected readonly cli = inject(CliBridgeStore);
  protected readonly geo = inject(GeoTargetStore);
  protected readonly test = inject(ConnectionTestStore);

  private readonly i18n = inject(TranslateService);
  protected readonly onboarding = inject(OnboardingService);
  private readonly theme_ = inject(ThemeService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { save: Check, send: Send, sun: Sun, moon: Moon };

  protected readonly languages = LANGUAGES;
  protected readonly cliProviders = CLI_PROVIDERS;

  /** Endonym for a language code, shown in the UI/document language pickers. */
  protected nativeLang(l: SupportedLanguage): string {
    return LANGUAGE_NATIVE_NAMES[l];
  }

  // --- Appearance ---
  protected readonly theme = this.theme_.theme;
  protected setTheme(next: Theme): void {
    if (this.theme() !== next) this.theme_.toggle();
  }

  async ngOnInit(): Promise<void> {
    const s = await this.store.load();
    if (!s) {
      this.toast.error(this.store.error());
      return;
    }
    this.i18n.setLocale(s.uiLanguage);
    await this.key.refresh(s.provider);
    if (s.aiMode === 'cli') {
      this.cli.syncCustomFlags(s);
      await this.cli.probe();
    }
  }

  /**
   * Records a field, and re-applies the locale for the one field that has a
   * visible side effect. The store deliberately does not translate, so this
   * pairing lives here rather than under `libs/`.
   */
  protected patch<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.store.patch(key, value);
    if (key === 'uiLanguage') this.i18n.setLocale(value as SupportedLanguage);
  }

  protected isCliMode(): boolean {
    return this.store.record()?.aiMode === 'cli';
  }

  /** Model list for the currently selected provider. API mode only - in CLI
   * mode the model string is free text passed straight to the CLI. Falls back
   * to the Claude catalogue for a provider API mode cannot serve, which is what
   * the dropdown needs to stay non-empty. */
  protected get models(): readonly string[] {
    const provider = this.store.record()?.provider;
    return apiModelsFor(provider).length ? apiModelsFor(provider) : apiModelsFor('claude');
  }

  /** Vendor name shown in the privacy note (e.g. "Anthropic"). Falls back to
   * the raw provider id for any provider not in the map. */
  protected vendorName(): string {
    const p = this.store.record()?.provider ?? '';
    return PROVIDER_VENDORS[p] ?? p;
  }

  /** Test connection needs a stored key in API mode, and in CLI mode a CLI that
   * actually runs. */
  protected canTest(): boolean {
    return this.isCliMode() ? this.cli.works(this.store.record()?.provider) : this.key.stored();
  }

  protected modelSelectValue(stored: string): string {
    return this.cli.selectValue(stored, this.store.record()?.provider);
  }

  protected cliModels(): string[] {
    return this.cli.models(this.store.record()?.provider);
  }

  // --- AI mode and provider ---

  /**
   * Switching mode changes what a valid provider is: DeepSeek has no CLI, and
   * Codex/Gemini have no API path yet, so a stale pick would leave the user on
   * a combination that can only fail at call time.
   */
  protected async onModeChange(mode: Settings['aiMode']): Promise<void> {
    const s = this.store.record();
    if (!s || s.aiMode === mode) return;
    this.patch('aiMode', mode);
    if (mode === 'cli') {
      if (!hasCli(s.provider)) await this.onProviderChange('claude');
      await this.cli.probe();
      return;
    }
    // Back to API mode. A CLI-less provider has to move, but the models need
    // restoring either way: switching to CLI blanks them ("let the CLI pick"),
    // and an empty model is not a valid API request - it would be sent to the
    // provider verbatim and rejected.
    if (!hasApi(s.provider)) {
      await this.onProviderChange('claude');
      return;
    }
    this.restoreApiModels(s.provider);
  }

  protected async onProviderChange(provider: Settings['provider']): Promise<void> {
    this.patch('provider', provider);
    if (this.isCliMode()) {
      // CLI mode has no fixed model catalogue: an API model id would be
      // rejected by the CLI, so blank it and let the CLI choose its default.
      // The user can still type a CLI alias such as "sonnet".
      this.patch('defaultModel', '');
      this.patch('economyModel', '');
      this.cli.clearCustomFlags();
      return;
    }
    // Reset model picks to the new provider's defaults when the current ones
    // do not belong to it (e.g. switching claude <-> deepseek).
    const d = providerModelDefaults(provider);
    const s = this.store.record();
    if (d && s && !this.models.includes(s.defaultModel)) {
      this.patch('defaultModel', d.default);
      this.patch('economyModel', d.economy);
    }
    if (!(await this.key.refresh(provider))) this.toast.error(this.key.error());
  }

  /** Puts back this provider's default model pair when the stored ones are
   * blank or belong to a different provider. */
  private restoreApiModels(provider: string): void {
    const patch = apiModelsToRestore(
      this.store.record(),
      providerModelDefaults(provider),
      this.models,
    );
    if (patch.defaultModel !== undefined) this.patch('defaultModel', patch.defaultModel);
    if (patch.economyModel !== undefined) this.patch('economyModel', patch.economyModel);
  }

  protected onCliModelSelect(field: 'defaultModel' | 'economyModel', choice: string): void {
    const model = this.cli.chooseModel(field, choice);
    if (model !== null) this.patch(field, model);
  }

  protected async installCli(provider: Parameters<CliBridgeStore['install']>[0]): Promise<void> {
    const outcome = await this.cli.install(provider);
    if (outcome === 'busy') return;
    if (outcome === 'installed') this.toast.success('settings.cli_installed');
    else this.toast.error(this.cli.error());
  }

  protected refreshCliProbe(): Promise<void> {
    return this.cli.probe();
  }

  // --- Saving ---

  protected async save(): Promise<void> {
    if (await this.store.save()) this.toast.success('settings.saved');
    else this.toast.error(this.store.error());
  }

  protected async saveKey(): Promise<void> {
    const s = this.store.record();
    if (!s) return;
    const ok = await this.key.save(s.provider);
    if (ok === null) return;
    if (ok) this.toast.success('settings.key_stored');
    else this.toast.error(this.key.error());
  }

  protected async removeKey(): Promise<void> {
    const s = this.store.record();
    if (!s) return;
    const ok = await this.key.remove(s.provider);
    if (ok === null) return;
    if (ok) this.toast.success('settings.key_removed');
    else this.toast.error(this.key.error());
  }

  // --- Job search geo target. Every toggle persists immediately. ---

  protected async toggleGeoScope(key: GeoScopeKey): Promise<void> {
    if (!(await this.geo.toggleScope(key))) this.toast.error(this.geo.error());
  }

  protected async setGeoWorldwide(): Promise<void> {
    const ok = await this.geo.setWorldwide();
    if (ok === false) this.toast.error(this.geo.error());
  }

  protected async toggleMarket(market: LocalMarket): Promise<void> {
    if (!(await this.geo.toggleMarket(market))) this.toast.error(this.geo.error());
  }

  protected async applyMarketPlan(): Promise<void> {
    const ok = await this.geo.applyPlan();
    if (ok === null) return;
    if (ok) this.toast.success(this.t()('settings.saved'));
    else this.toast.error(this.geo.error());
  }

  protected dismissMarketPlan(): void {
    this.geo.dismissPlan();
  }

  // --- Test connection ---

  protected async testConnection(): Promise<void> {
    const s = this.store.record();
    if (!s) return;
    if ((await this.test.run(s)) === false) this.toast.error(this.test.error());
  }

  // --- Danger zone ---

  /**
   * The wipe is the store's; dropping every component's in-memory state is not.
   * A full reload is the cleanest way to do that, and the onboarding gate takes
   * over from the reset database.
   */
  protected async resetAllData(): Promise<void> {
    if (await this.store.resetAllData()) window.location.reload();
    else this.toast.error(this.store.error());
  }
}

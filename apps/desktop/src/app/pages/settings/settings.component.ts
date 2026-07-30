import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Check,
  KeyRound,
  LoaderCircle,
  Moon,
  RefreshCw,
  Send,
  Sun,
  Trash2,
  TriangleAlert,
  LucideAngularModule,
} from 'lucide-angular';
import { getVersion } from '@tauri-apps/api/app';
import { AiService, CliStatus, DbService, KeysService } from '@applye/data';
import {
  AiProvider,
  encodeGeoScopes,
  GEO_SCOPE_KEYS,
  GeoScopeKey,
  encodeLocalMarkets,
  LANGUAGE_NATIVE_NAMES,
  LOCAL_MARKETS,
  LocalMarket,
  MarketSourcePlan,
  parseGeoScopes,
  parseLocalMarkets,
  Settings,
  SupportedLanguage,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { HealthCheckPanelComponent } from '../../core/health-check-panel.component';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ThemeService, Theme } from '../../core/theme.service';
import { ToastService } from '../../core/toast/toast.service';
import { CLI_MODEL_CUSTOM, apiModelsToRestore, cliModelSelectValue } from './cli-models.util';
import {
  GeoTarget,
  toggleMarket as toggleMarketIn,
  toggleRegion,
  worldwide,
} from './geo-target.util';

const LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

// Current Claude model IDs (Anthropic). Verified against the model catalogue.
const CLAUDE_MODELS = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

// Current DeepSeek model IDs. Verified against api-docs.deepseek.com (2026-06):
// v4-pro for quality, v4-flash for the economy tier. OpenAI-compatible API.
const DEEPSEEK_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash'];

// Per-provider default (quality) and economy model picks.
const PROVIDER_DEFAULTS: Record<string, { default: string; economy: string }> = {
  claude: { default: 'claude-opus-4-8', economy: 'claude-haiku-4-5' },
  deepseek: { default: 'deepseek-v4-pro', economy: 'deepseek-v4-flash' },
};

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

// CLI bridge mode: which local CLI each provider id maps to. `openai` is Codex
// because the app's provider ids predate the CLI bridge; the Rust adapter
// accepts both `openai` and `codex` for the same reason.
// Gemini CLI is deliberately absent: Google stopped it serving personal
// accounts on 2026-06-18 (see ai/cli.rs). It is still a valid API-mode
// provider, so the id itself stays in AiProvider.
const CLI_PROVIDERS: { id: AiProvider; label: string; command: string }[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'openai', label: 'Codex CLI', command: 'codex' },
];

// Model choices offered per CLI, so a user does not have to know the spelling.
// Aliases are preferred over full model IDs wherever a CLI publishes them:
// vendors rotate the IDs, and an alias keeps working across a model refresh.
//
// An empty value means "omit --model entirely and let the CLI choose", which is
// the right default rather than a cop-out - the CLI is already signed in and
// knows which models the user's subscription actually covers, and Applye does
// not.
//
// IMPORTANT: which models a CLI will accept depends on the user's *plan*, not
// just on what the vendor publishes. Codex on a ChatGPT account rejects
// `gpt-5.6` and `gpt-5.3-codex` outright ("not supported when using Codex with
// a ChatGPT account") even though both are in the public model list - and a
// ChatGPT-account user is exactly who CLI bridge mode exists for. So this list
// holds only names confirmed to work on a subscription, and the default stays
// "let the CLI choose", which is the only option that is right for every plan.
//
// Tested live 2026-07-23 by invoking each CLI: codex accepted gpt-5.5, gpt-5.4
// and gpt-5.4-mini on a ChatGPT account and refused gpt-5.6 / gpt-5.3-codex;
// claude accepted the `sonnet` alias.
const CLI_MODELS: Record<string, string[]> = {
  claude: ['sonnet', 'opus', 'haiku'],
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
};

/**
 * Phase 2 Settings - the first screen that touches AI. Wires the existing
 * db_get/update_settings + the OS-keychain commands, and proves the end-to-end
 * AI round-trip via "Test connection". Styled strictly with libs/ui tokens.
 *
 * NOTE: the economy/quality toggle is local UI state; there is no persisted
 * tier field in the Phase 1 settings schema.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, HealthCheckPanelComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly keys = inject(KeysService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  protected readonly onboarding = inject(OnboardingService);
  private readonly theme_ = inject(ThemeService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    stored: Check,
    save: Check,
    saveKey: KeyRound,
    replace: RefreshCw,
    remove: Trash2,
    send: Send,
    missing: TriangleAlert,
    sun: Sun,
    moon: Moon,
    loader: LoaderCircle,
  };

  readonly languages = LANGUAGES;

  /** Endonym for a language code, shown in the UI/document language pickers. */
  nativeLang(l: SupportedLanguage): string {
    return LANGUAGE_NATIVE_NAMES[l];
  }

  // --- Appearance ---
  readonly theme = this.theme_.theme;
  setTheme(next: Theme): void {
    if (this.theme() !== next) this.theme_.toggle();
  }

  // --- About ---
  readonly appVersion = signal<string | null>(null);

  // --- Danger zone ---
  readonly confirmingReset = signal(false);
  readonly resetting = signal(false);

  /** Model list for the currently selected provider. API mode only - in CLI
   * mode the model string is free text passed straight to the CLI. */
  get models(): string[] {
    return this.settings()?.provider === 'deepseek' ? DEEPSEEK_MODELS : CLAUDE_MODELS;
  }

  // --- CLI bridge mode ---
  readonly cliProviders = CLI_PROVIDERS;
  readonly cliStatuses = signal<CliStatus[]>([]);
  readonly cliProbing = signal(false);

  isCliMode(): boolean {
    return this.settings()?.aiMode === 'cli';
  }

  /** Status row for the provider currently selected, if it has been probed. */
  private currentCliStatus(): CliStatus | undefined {
    const provider = this.settings()?.provider;
    return this.cliStatuses().find((c) => c.provider === provider);
  }

  /** Test connection needs a stored key in API mode, and in CLI mode a CLI that
   * actually **runs** - being present on the path is not enough, since a broken
   * npm wrapper is present and still fails on the first call. */
  canTest(): boolean {
    return this.isCliMode() ? (this.currentCliStatus()?.working ?? false) : this.keyStored();
  }

  /** Provider currently installing, so only that row shows progress. */
  readonly installingCli = signal<AiProvider | null>(null);

  /**
   * Installs or repairs a CLI with npm. The package name is chosen in Rust
   * from a fixed list keyed on the provider id - it is never sent from here,
   * so no input can make Applye install something else.
   */
  async installCli(provider: AiProvider): Promise<void> {
    if (this.installingCli()) return;
    this.installingCli.set(provider);
    try {
      const result = await this.ai.installCli(provider);
      if (result.ok) {
        await this.refreshCliProbe();
        this.toast.success('settings.cli_installed');
      } else {
        this.toast.error(result.message);
      }
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.installingCli.set(null);
    }
  }

  // --- CLI model pickers ---
  protected readonly CLI_MODEL_CUSTOM = CLI_MODEL_CUSTOM;

  /** Known model names for the selected CLI. Empty for a CLI that publishes no
   * readable list - the dropdown then offers the default and a custom field. */
  cliModels(): string[] {
    return CLI_MODELS[this.settings()?.provider ?? ''] ?? [];
  }

  /** Which of the two model fields are currently in free-text mode. */
  readonly customModel = signal<{ defaultModel: boolean; economyModel: boolean }>({
    defaultModel: false,
    economyModel: false,
  });

  /**
   * What the dropdown should show for a stored value: the value itself when it
   * is one of the known names, "custom" when it is a name typed by hand, and
   * the empty option when nothing is set. Deriving this rather than storing it
   * means a settings row written before the picker existed - or by hand - still
   * shows up correctly.
   */
  modelSelectValue(stored: string): string {
    return cliModelSelectValue(stored, this.cliModels());
  }

  /** Opens the free-text field for any stored model that is not a known name,
   * so an existing hand-typed value stays visible and editable. */
  private syncCustomModelFlags(): void {
    const s = this.settings();
    const known = this.cliModels();
    const isCustom = (v: string) => !!v && !known.includes(v);
    this.customModel.set({
      defaultModel: isCustom(s?.defaultModel ?? ''),
      economyModel: isCustom(s?.economyModel ?? ''),
    });
  }

  onCliModelSelect(field: 'defaultModel' | 'economyModel', choice: string): void {
    if (choice === CLI_MODEL_CUSTOM) {
      this.customModel.update((c) => ({ ...c, [field]: true }));
      return;
    }
    this.customModel.update((c) => ({ ...c, [field]: false }));
    this.patch(field, choice);
  }

  async refreshCliProbe(): Promise<void> {
    this.cliProbing.set(true);
    try {
      this.cliStatuses.set(await this.ai.probeClis());
    } catch (e) {
      // Outside a Tauri runtime (web preview) the command does not exist; an
      // empty list simply reads as "none found" rather than breaking Settings.
      this.cliStatuses.set([]);
      console.warn('cli_probe failed', e);
    } finally {
      this.cliProbing.set(false);
    }
  }

  /**
   * Switching mode changes what a valid provider is: DeepSeek has no CLI, and
   * Codex/Gemini have no API path yet, so a stale pick would leave the user on
   * a combination that can only fail at call time.
   */
  async onModeChange(mode: Settings['aiMode']): Promise<void> {
    const s = this.settings();
    if (!s || s.aiMode === mode) return;
    this.patch('aiMode', mode);
    if (mode === 'cli') {
      if (!CLI_PROVIDERS.some((c) => c.id === s.provider)) {
        await this.onProviderChange('claude');
      }
      await this.refreshCliProbe();
      return;
    }
    // Back to API mode. A CLI-less provider has to move, but the models need
    // restoring either way: switching to CLI blanks them ("let the CLI pick"),
    // and an empty model is not a valid API request - it would be sent to the
    // provider verbatim and rejected.
    if (s.provider !== 'claude' && s.provider !== 'deepseek') {
      await this.onProviderChange('claude');
      return;
    }
    this.restoreApiModels(s.provider);
  }

  /** Puts back this provider's default model pair when the stored ones are
   * blank or belong to a different provider. */
  private restoreApiModels(provider: string): void {
    const patch = apiModelsToRestore(this.settings(), PROVIDER_DEFAULTS[provider], this.models);
    if (patch.defaultModel !== undefined) this.patch('defaultModel', patch.defaultModel);
    if (patch.economyModel !== undefined) this.patch('economyModel', patch.economyModel);
  }

  /** Vendor name shown in the privacy note (e.g. "Anthropic"). Falls back to
   * the raw provider id for any provider not in the map. */
  vendorName(): string {
    const p = this.settings()?.provider ?? '';
    return PROVIDER_VENDORS[p] ?? p;
  }
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly settings = signal<Settings | null>(null);

  readonly apiKeyInput = signal('');
  readonly keyStored = signal(false);
  readonly keyBusy = signal(false);

  readonly tier = signal<'economy' | 'quality'>('economy');

  readonly testing = signal(false);
  readonly testReply = signal<string | null>(null);
  readonly testTokens = signal<{ in: number; out: number; cached: number } | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const s = await this.db.getSettings();
      this.settings.set(s);
      this.i18n.setLocale(s.uiLanguage);
      this.keyStored.set(await this.keys.hasProviderKey(s.provider));
      if (s.aiMode === 'cli') {
        this.syncCustomModelFlags();
        await this.refreshCliProbe();
      }
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.loading.set(false);
    }
    // Best-effort: outside a Tauri runtime (web preview) getVersion throws;
    // the About row simply hides its version chip.
    try {
      this.appVersion.set(await getVersion());
    } catch {
      this.appVersion.set(null);
    }
  }

  patch<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const s = this.settings();
    if (s) this.settings.set({ ...s, [key]: value });
    if (key === 'uiLanguage') this.i18n.setLocale(value as SupportedLanguage);
  }

  // --- Job search geo target ---
  //
  // One question ("where do you want to work?") answered in exactly one of two
  // mutually exclusive modes:
  //
  //   regions  - geoScope holds continent keys, or is empty, which renders as
  //              Worldwide (no restriction at all).
  //   markets  - market holds country codes, and geoScope is cleared so the
  //              regions take no part in the scan.
  //
  // Picking either side clears the other, so the pair can never both be set
  // and the scan engine's "market first, else geoScope" read is unambiguous.
  // Clearing the last market falls back to Worldwide, exactly as clearing the
  // last region already did.
  //
  // Auto-saves immediately on every toggle (like Discover's own source
  // toggles) instead of waiting for the page's explicit Save button - this
  // setting drives live Discover scan behavior, so a choice here must take
  // effect right away even if the user never touches Save.
  readonly geoScopeKeys = GEO_SCOPE_KEYS;
  readonly localMarkets = LOCAL_MARKETS;

  readonly geoScopeSelected = computed<ReadonlySet<GeoScopeKey>>(
    () => new Set(parseGeoScopes(this.settings()?.geoScope)),
  );

  readonly marketsSelected = computed<ReadonlySet<LocalMarket>>(
    () => new Set(parseLocalMarkets(this.settings()?.market)),
  );

  /** True while local markets own the search, so the region row is inert. */
  readonly marketModeActive = computed(() => this.marketsSelected().size > 0);

  geoScopeChecked(key: GeoScopeKey): boolean {
    return !this.marketModeActive() && this.geoScopeSelected().has(key);
  }

  geoWorldwideChecked(): boolean {
    return !this.marketModeActive() && this.geoScopeSelected().size === 0;
  }

  marketChecked(market: LocalMarket): boolean {
    return this.marketsSelected().has(market);
  }

  /** Pending source changes for the market just picked, awaiting confirmation. */
  protected readonly marketPlan = signal<MarketSourcePlan | null>(null);
  protected readonly applyingPlan = signal(false);

  /** Both halves as the pure state machine in geo-target.util sees them. */
  private readonly geoTarget = computed<GeoTarget>(() => ({
    scopes: [...this.geoScopeSelected()],
    markets: [...this.marketsSelected()],
  }));

  /** Picking a region switches back to region mode, dropping every market.
   * The pending confirmation belongs to the market that opened it and must
   * not survive leaving market mode, so it is cleared before the new scope
   * is persisted. */
  async toggleGeoScope(key: GeoScopeKey): Promise<void> {
    this.marketPlan.set(null);
    await this.persistGeoTarget(toggleRegion(this.geoTarget(), key));
  }

  async setGeoWorldwide(): Promise<void> {
    this.marketPlan.set(null);
    if (this.geoWorldwideChecked()) return;
    await this.persistGeoTarget(worldwide());
  }

  /** Picking a market switches to market mode, dropping the region scope. */
  async toggleMarket(market: LocalMarket): Promise<void> {
    const next = toggleMarketIn(this.geoTarget(), market);
    // Only offer to change sources if the market actually persisted. A rolled
    // back save must never lead to enabling sources for a market the settings
    // row does not hold - that would send requests on the user's behalf for a
    // market they are not on.
    if (await this.persistGeoTarget(next)) {
      await this.offerMarketSources(next.markets);
    }
  }

  /** Offers to switch built-in sources to match the market. Never writes by
   * itself: a built-in source reaching the network is always the user's
   * explicit choice, so this only prepares what the confirmation will show. */
  private async offerMarketSources(markets: LocalMarket[]): Promise<void> {
    if (!markets.length) {
      this.marketPlan.set(null);
      return;
    }
    try {
      const plan = await this.db.marketSourcePlan(markets);
      const empty = !plan.toEnable.length && !plan.toDisable.length;
      this.marketPlan.set(empty ? null : plan);
    } catch (e) {
      console.error('settings: market source plan failed', e);
      this.marketPlan.set(null);
    }
  }

  async applyMarketPlan(): Promise<void> {
    const plan = this.marketPlan();
    if (!plan || this.applyingPlan()) return;
    this.applyingPlan.set(true);
    try {
      await this.db.applyMarketSourcePlan(
        plan.toEnable.map((s) => s.id),
        plan.toDisable.map((s) => s.id),
      );
      this.marketPlan.set(null);
      this.toast.success(this.t()('settings.saved'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.applyingPlan.set(false);
    }
  }

  dismissMarketPlan(): void {
    this.marketPlan.set(null);
  }

  /** Writes both halves in one call - they change together or not at all.
   * Returns whether the save actually persisted, so callers can avoid acting
   * on a change that was rolled back. */
  private async persistGeoTarget(next: GeoTarget): Promise<boolean> {
    const prev = this.settings();
    if (!prev) return false;
    const geoScope = encodeGeoScopes(next.scopes);
    const market = encodeLocalMarkets(next.markets);
    this.settings.set({ ...prev, geoScope, market }); // optimistic
    try {
      await this.db.updateSettings({ geoScope, market });
      return true;
    } catch (e) {
      console.error('settings: geo target save failed', e);
      this.settings.set(prev); // rollback
      this.toast.error(String(e));
      return false;
    }
  }

  async onProviderChange(provider: Settings['provider']): Promise<void> {
    this.patch('provider', provider);
    if (this.isCliMode()) {
      // CLI mode has no fixed model catalogue: an API model id would be
      // rejected by the CLI, so blank it and let the CLI choose its default.
      // The user can still type a CLI alias such as "sonnet".
      this.patch('defaultModel', '');
      this.patch('economyModel', '');
      this.customModel.set({ defaultModel: false, economyModel: false });
      return;
    }
    // Reset model picks to the new provider's defaults when the current ones
    // do not belong to it (e.g. switching claude <-> deepseek).
    const d = PROVIDER_DEFAULTS[provider];
    const s = this.settings();
    if (d && s && !this.models.includes(s.defaultModel)) {
      this.patch('defaultModel', d.default);
      this.patch('economyModel', d.economy);
    }
    this.keyStored.set(await this.keys.hasProviderKey(provider));
  }

  async save(): Promise<void> {
    const s = this.settings();
    if (!s) return;
    this.saving.set(true);
    try {
      this.settings.set(await this.db.updateSettings(s));
      this.toast.success('settings.saved');
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.saving.set(false);
    }
  }

  async saveKey(): Promise<void> {
    const s = this.settings();
    const key = this.apiKeyInput().trim();
    if (!s || !key) return;
    this.keyBusy.set(true);
    try {
      await this.keys.setProviderKey(s.provider, key);
      this.apiKeyInput.set('');
      this.keyStored.set(true);
      this.toast.success('settings.key_stored');
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.keyBusy.set(false);
    }
  }

  async removeKey(): Promise<void> {
    const s = this.settings();
    if (!s) return;
    this.keyBusy.set(true);
    try {
      await this.keys.deleteProviderKey(s.provider);
      this.keyStored.set(false);
      this.toast.success('settings.key_removed');
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.keyBusy.set(false);
    }
  }

  async testConnection(): Promise<void> {
    const s = this.settings();
    if (!s) return;
    this.testing.set(true);
    this.testReply.set(null);
    this.testTokens.set(null);
    try {
      const model = this.tier() === 'quality' ? s.defaultModel : s.economyModel;
      const rendered = await this.ai.renderSkill('ping', {
        message: 'Reply OK if you can read this.',
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: s.defaultDocLanguage,
      });
      this.testReply.set(res.text);
      this.testTokens.set({
        in: res.tokensInput,
        out: res.tokensOutput,
        cached: res.cachedTokens,
      });
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.testing.set(false);
    }
  }

  /**
   * Factory reset: wipe the database, clear every provider key from the OS
   * keychain, then hard-reload so the app boots into a clean state. On reload
   * the shell gate sees `onboardingSeen = false` and re-opens onboarding.
   */
  async resetAllData(): Promise<void> {
    if (this.resetting()) return;
    this.resetting.set(true);
    try {
      await this.db.resetAllData();
      // Keychain keys live outside the DB - clear each provider we support.
      // A provider with no stored key throws; swallow per-key so one miss
      // doesn't abort the rest.
      const providers: AiProvider[] = ['claude', 'deepseek', 'openai', 'gemini', 'codex'];
      await Promise.all(
        providers.map((p) => this.keys.deleteProviderKey(p).catch(() => undefined)),
      );
      // Full reload is the cleanest way to drop every component's in-memory
      // state; the onboarding gate takes over from the reset DB.
      window.location.reload();
    } catch (e) {
      this.toast.error(String(e));
      this.resetting.set(false);
      this.confirmingReset.set(false);
    }
  }
}

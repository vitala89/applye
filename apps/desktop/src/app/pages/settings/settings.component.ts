import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
 * Phase 2 Settings — the first screen that touches AI. Wires the existing
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
  template: `
    @if (loading()) {
      <div class="state-loading-text">{{ t()('common.loading') }}</div>
    } @else if (settings(); as s) {
      <div class="settings">
        <header class="head">
          <button class="btn btn--primary btn--md" [disabled]="saving()" (click)="save()">
            <lucide-icon [img]="icons.save" [size]="16" aria-hidden="true" />
            {{ saving() ? t()('settings.saving') : t()('settings.save_btn') }}
          </button>
        </header>

        <!-- AI provider + models -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.section_ai') }}</h3>

          <label class="field">
            <span class="cap">Mode</span>
            <select
              [ngModel]="s.aiMode"
              (ngModelChange)="onModeChange($event)"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="api">API (direct)</option>
              <option value="cli">CLI bridge (use a CLI you already pay for)</option>
            </select>
          </label>

          @if (isCliMode()) {
            <label class="field">
              <span class="cap">Provider</span>
              <select
                [ngModel]="s.provider"
                (ngModelChange)="onProviderChange($event)"
                [ngModelOptions]="{ standalone: true }"
              >
                @for (c of cliProviders; track c.id) {
                  <option [value]="c.id">{{ c.label }} ({{ c.command }})</option>
                }
              </select>
            </label>
          } @else {
            <label class="field">
              <span class="cap">Provider</span>
              <select
                [ngModel]="s.provider"
                (ngModelChange)="onProviderChange($event)"
                [ngModelOptions]="{ standalone: true }"
              >
                <option value="claude">Claude (Anthropic)</option>
                <option value="deepseek">DeepSeek</option>
                <option value="openai" disabled>OpenAI (coming soon)</option>
                <option value="gemini" disabled>Gemini (coming soon)</option>
              </select>
            </label>
          }

          @if (isCliMode()) {
            <div class="cli-status">
              @if (cliProbing()) {
                <p class="muted">Looking for installed CLIs…</p>
              } @else {
                @for (c of cliStatuses(); track c.provider) {
                  <p
                    class="cli-status__row"
                    [class.cli-status__row--missing]="!c.installed"
                    [class.cli-status__row--broken]="c.installed && !c.working"
                  >
                    <lucide-icon
                      [img]="c.working ? icons.stored : icons.missing"
                      [size]="14"
                      aria-hidden="true"
                    />
                    <strong>{{ c.label }}</strong>
                    @if (c.working) {
                      <span class="cli-status__version">{{ c.version }}</span>
                      <span class="cli-status__path">{{ c.path }}</span>
                    } @else if (c.installed) {
                      <!-- Found on the path but it will not run. The npm
                           wrappers spawn a platform binary that a partial
                           install can leave missing, so this state looks
                           healthy to a file check and fails on first use. -->
                      <span class="cli-status__broken">
                        {{ t()('settings.cli_found_but_broken') }}
                      </span>
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        [disabled]="installingCli() !== null"
                        (click)="installCli(c.provider)"
                      >
                        {{
                          installingCli() === c.provider
                            ? t()('settings.cli_installing')
                            : t()('settings.cli_repair_btn')
                        }}
                      </button>
                      @if (c.error) {
                        <span class="cli-status__error">{{ c.error }}</span>
                      }
                    } @else {
                      <span
                        >{{ t()('settings.cli_not_found') }} <code>{{ c.command }}</code></span
                      >
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        [disabled]="installingCli() !== null"
                        (click)="installCli(c.provider)"
                      >
                        {{
                          installingCli() === c.provider
                            ? t()('settings.cli_installing')
                            : t()('settings.cli_install_btn')
                        }}
                      </button>
                    }
                  </p>
                }
              }
              <button class="btn btn--ghost btn--sm" type="button" (click)="refreshCliProbe()">
                <lucide-icon [img]="icons.replace" [size]="14" aria-hidden="true" />
                Re-check
              </button>
            </div>

            <p class="disclosure" role="note">
              <strong>Privacy note:</strong>
              In CLI bridge mode Applye stores no API key. It runs the CLI you already installed and
              signed in to yourself, as a one-shot process with a fixed argument list (never a
              shell), in a scratch folder rather than your own files. The prompt still reaches that
              vendor's servers through their CLI — the difference is that the account, the billing
              and the sign-in stay entirely yours. AI is always opt-in: nothing runs until you
              trigger an action.
            </p>
          } @else if (s.provider) {
            <p class="disclosure" role="note">
              <strong>Privacy note:</strong>
              @if (s.provider === 'deepseek') {
                DeepSeek is a China-based cloud provider, so your data is processed under Chinese
                jurisdiction; if you would rather avoid that, choose a different provider.
              }
              In API mode the job description and your profile text are sent to {{ vendorName() }}'s
              servers to be processed, the same as any cloud API. Your API key is stored in the OS
              keychain and never written to the local database or logs. AI is always opt-in: nothing
              is sent until you trigger an action.
            </p>
          }

          <div class="row">
            @if (isCliMode()) {
              <label class="field">
                <span class="cap">{{ t()('settings.quality_model_label') }}</span>
                <select
                  [ngModel]="modelSelectValue(s.defaultModel)"
                  (ngModelChange)="onCliModelSelect('defaultModel', $event)"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="">{{ t()('settings.cli_model_default') }}</option>
                  @for (m of cliModels(); track m) {
                    <option [value]="m">{{ m }}</option>
                  }
                  <option [value]="CLI_MODEL_CUSTOM">
                    {{ t()('settings.cli_model_custom') }}
                  </option>
                </select>
                @if (customModel().defaultModel) {
                  <input
                    type="text"
                    [ngModel]="s.defaultModel"
                    (ngModelChange)="patch('defaultModel', $event)"
                    [ngModelOptions]="{ standalone: true }"
                    [placeholder]="t()('settings.cli_model_custom_placeholder')"
                  />
                }
              </label>
              <label class="field">
                <span class="cap">{{ t()('settings.economy_model_label') }}</span>
                <select
                  [ngModel]="modelSelectValue(s.economyModel)"
                  (ngModelChange)="onCliModelSelect('economyModel', $event)"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option value="">{{ t()('settings.cli_model_default') }}</option>
                  @for (m of cliModels(); track m) {
                    <option [value]="m">{{ m }}</option>
                  }
                  <option [value]="CLI_MODEL_CUSTOM">
                    {{ t()('settings.cli_model_custom') }}
                  </option>
                </select>
                @if (customModel().economyModel) {
                  <input
                    type="text"
                    [ngModel]="s.economyModel"
                    (ngModelChange)="patch('economyModel', $event)"
                    [ngModelOptions]="{ standalone: true }"
                    [placeholder]="t()('settings.cli_model_custom_placeholder')"
                  />
                }
              </label>
            } @else {
              <label class="field">
                <span class="cap">{{ t()('settings.quality_model_label') }}</span>
                <select
                  [ngModel]="s.defaultModel"
                  (ngModelChange)="patch('defaultModel', $event)"
                  [ngModelOptions]="{ standalone: true }"
                >
                  @for (m of models; track m) {
                    <option [value]="m">{{ m }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span class="cap">{{ t()('settings.economy_model_label') }}</span>
                <select
                  [ngModel]="s.economyModel"
                  (ngModelChange)="patch('economyModel', $event)"
                  [ngModelOptions]="{ standalone: true }"
                >
                  @for (m of models; track m) {
                    <option [value]="m">{{ m }}</option>
                  }
                </select>
              </label>
            }
          </div>
          @if (isCliMode()) {
            <p class="hint">{{ t()('settings.cli_model_hint') }}</p>
          }

          <div class="field">
            <span class="cap">{{ t()('settings.test_tier_label') }}</span>
            <div class="toggle" role="group">
              <button
                type="button"
                class="seg"
                [class.seg--on]="tier() === 'economy'"
                (click)="tier.set('economy')"
              >
                {{ t()('settings.tier_economy') }}
              </button>
              <button
                type="button"
                class="seg"
                [class.seg--on]="tier() === 'quality'"
                (click)="tier.set('quality')"
              >
                {{ t()('settings.tier_quality') }}
              </button>
            </div>
            <p class="hint">{{ t()('settings.test_tier_hint') }}</p>
          </div>
        </section>

        <!-- API key (keychain). CLI bridge mode never stores one. -->
        @if (!isCliMode()) {
          <section class="section">
            <h3 class="eyebrow">{{ t()('settings.section_key') }}</h3>
            <p class="muted">
              @if (keyStored()) {
                <strong
                  ><lucide-icon [img]="icons.stored" [size]="14" aria-hidden="true" /> Stored in
                  your OS keychain.</strong
                >
                You don't need to re-enter it — the field stays empty because the key is never read
                back to the app. Type a new one only to replace it.
              } @else {
                Saved to your OS keychain, never written to disk or logs, and sent only to the
                chosen provider.
              }
            </p>
            <div class="row">
              <label class="field grow">
                <span class="cap">{{ s.provider }} {{ t()('settings.api_key_label') }}</span>
                <input
                  type="password"
                  [ngModel]="apiKeyInput()"
                  (ngModelChange)="apiKeyInput.set($event)"
                  [ngModelOptions]="{ standalone: true }"
                  [placeholder]="keyStored() ? '•••••••••• (stored — type to replace)' : 'sk-ant-…'"
                  autocomplete="off"
                />
              </label>
              <div class="field actions">
                <button
                  class="btn btn--secondary btn--md"
                  [disabled]="keyBusy() || !apiKeyInput().trim()"
                  (click)="saveKey()"
                >
                  <lucide-icon
                    [img]="keyStored() ? icons.replace : icons.saveKey"
                    [size]="16"
                    aria-hidden="true"
                  />
                  {{ keyStored() ? t()('settings.replace_key_btn') : t()('settings.save_key_btn') }}
                </button>
                @if (keyStored()) {
                  <button
                    class="btn btn--danger btn--md"
                    [disabled]="keyBusy()"
                    (click)="removeKey()"
                  >
                    <lucide-icon [img]="icons.remove" [size]="16" aria-hidden="true" />
                    {{ t()('settings.remove_key_btn') }}
                  </button>
                }
              </div>
            </div>
          </section>
        }

        <!-- Appearance -->
        <section class="section">
          <h3 class="eyebrow">Appearance</h3>
          <div class="field">
            <span class="cap">Theme</span>
            <div class="toggle" role="group" aria-label="Theme">
              <button
                type="button"
                class="seg"
                [class.seg--on]="theme() === 'light'"
                [attr.aria-pressed]="theme() === 'light'"
                (click)="setTheme('light')"
              >
                <lucide-icon [img]="icons.sun" [size]="14" aria-hidden="true" /> Light
              </button>
              <button
                type="button"
                class="seg"
                [class.seg--on]="theme() === 'dark'"
                [attr.aria-pressed]="theme() === 'dark'"
                (click)="setTheme('dark')"
              >
                <lucide-icon [img]="icons.moon" [size]="14" aria-hidden="true" /> Dark
              </button>
            </div>
            <p class="hint">Applies instantly across the app.</p>
          </div>
        </section>

        <!-- Languages -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.section_lang') }}</h3>
          <div class="row">
            <label class="field">
              <span class="cap">{{ t()('settings.ui_lang_label') }}</span>
              <select
                [ngModel]="s.uiLanguage"
                (ngModelChange)="patch('uiLanguage', $event)"
                [ngModelOptions]="{ standalone: true }"
              >
                @for (l of languages; track l) {
                  <option [value]="l">{{ nativeLang(l) }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span class="cap">{{ t()('settings.doc_lang_label') }}</span>
              <select
                [ngModel]="s.defaultDocLanguage"
                (ngModelChange)="patch('defaultDocLanguage', $event)"
                [ngModelOptions]="{ standalone: true }"
              >
                @for (l of languages; track l) {
                  <option [value]="l">{{ nativeLang(l) }}</option>
                }
              </select>
            </label>
          </div>
        </section>

        <!-- Job search geo target: regions OR local markets, never both.
             Whichever row the user touches becomes the active mode and clears
             the other; the inactive row stays clickable so switching back is
             one click, but is muted and says so. -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.jobsearch_section') }}</h3>
          <div class="field grow">
            <span class="cap">{{ t()('settings.geo_scope_label') }}</span>
            <div class="geo-chips" [class.geo-chips--muted]="marketModeActive()">
              <label class="geo-chip" [class.geo-chip--on]="geoWorldwideChecked()">
                <input
                  type="checkbox"
                  [checked]="geoWorldwideChecked()"
                  (change)="setGeoWorldwide()"
                />
                {{ t()('settings.geo_worldwide') }}
              </label>
              @for (key of geoScopeKeys; track key) {
                <label class="geo-chip" [class.geo-chip--on]="geoScopeChecked(key)">
                  <input
                    type="checkbox"
                    [checked]="geoScopeChecked(key)"
                    (change)="toggleGeoScope(key)"
                  />
                  {{ t()('discover.region_' + key) }}
                </label>
              }
            </div>
            <p class="hint">
              {{
                marketModeActive()
                  ? t()('settings.geo_scope_hint_muted')
                  : t()('settings.geo_scope_hint')
              }}
            </p>
          </div>
          <div class="field grow">
            <span class="cap">{{ t()('settings.local_market_label') }}</span>
            <div class="geo-chips">
              @for (market of localMarkets; track market) {
                <label class="geo-chip" [class.geo-chip--on]="marketChecked(market)">
                  <input
                    type="checkbox"
                    [checked]="marketChecked(market)"
                    (change)="toggleMarket(market)"
                  />
                  {{ t()('settings.local_market_' + market) }}
                </label>
              }
            </div>
            <p class="hint">{{ t()('settings.local_market_hint') }}</p>
            @if (marketPlan(); as plan) {
              <div
                class="confirm"
                role="alertdialog"
                [attr.aria-label]="t()('settings.market_sources_title')"
              >
                <p class="confirm__q">{{ t()('settings.market_sources_title') }}</p>
                @if (plan.toEnable.length) {
                  <p class="market-plan__label">{{ t()('settings.market_sources_enable') }}</p>
                  <ul class="market-plan__list">
                    @for (s of plan.toEnable; track s.id) {
                      <li>
                        {{ s.name }} <span class="market-plan__host">{{ s.host }}</span>
                      </li>
                    }
                  </ul>
                }
                @if (plan.toDisable.length) {
                  <p class="market-plan__label">{{ t()('settings.market_sources_disable') }}</p>
                  <ul class="market-plan__list">
                    @for (s of plan.toDisable; track s.id) {
                      <li>
                        {{ s.name }} <span class="market-plan__host">{{ s.host }}</span>
                      </li>
                    }
                  </ul>
                }
                <p class="hint">{{ t()('settings.market_sources_note') }}</p>
                <div class="confirm__actions">
                  <button
                    class="btn btn--primary btn--md"
                    type="button"
                    [disabled]="applyingPlan()"
                    (click)="applyMarketPlan()"
                  >
                    {{ t()('settings.market_sources_apply') }}
                  </button>
                  <button
                    class="btn btn--secondary btn--md"
                    type="button"
                    [disabled]="applyingPlan()"
                    (click)="dismissMarketPlan()"
                  >
                    {{ t()('actions.cancel') }}
                  </button>
                </div>
              </div>
            }
          </div>
        </section>

        <!-- Follow-up reminders -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.followup_section') }}</h3>
          <p class="muted">{{ t()('settings.followup_hint') }}</p>
          <div class="row">
            <label class="field">
              <span class="cap">{{ t()('settings.followup_apply_label') }}</span>
              <input
                type="number"
                min="1"
                [ngModel]="s.followupDaysAfterApply"
                (ngModelChange)="patch('followupDaysAfterApply', $event)"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>
            <label class="field">
              <span class="cap">{{ t()('settings.followup_interview_label') }}</span>
              <input
                type="number"
                min="1"
                [ngModel]="s.followupDaysAfterInterview"
                (ngModelChange)="patch('followupDaysAfterInterview', $event)"
                [ngModelOptions]="{ standalone: true }"
              />
            </label>
          </div>
        </section>

        <!-- Health check (Phase 6.7) -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('health.section') }}</h3>
          <p class="muted">{{ t()('health.section_hint') }}</p>
          <app-health-check-panel />
        </section>

        <!-- Onboarding -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.section_onboarding') }}</h3>
          <button
            class="btn btn--secondary btn--md"
            type="button"
            (click)="onboarding.requestOpen()"
          >
            {{ t()('onboarding.rerun') }}
          </button>
        </section>

        <!-- Test connection -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.test_section') }}</h3>
          <button
            class="btn btn--primary btn--md"
            [disabled]="testing() || !canTest()"
            (click)="testConnection()"
          >
            <lucide-icon [img]="icons.send" [size]="16" aria-hidden="true" />
            {{ testing() ? t()('settings.testing') : t()('settings.test_prompt_btn') }}
          </button>
          @if (!canTest()) {
            @if (isCliMode()) {
              <p class="muted">Install the selected CLI and sign in to it, then re-check above.</p>
            } @else {
              <p class="muted">{{ t()('settings.store_key_first') }}</p>
            }
          }
          @if (testReply(); as reply) {
            <div class="reply">
              <p class="reply__text">{{ reply }}</p>
              @if (testTokens(); as t) {
                <p class="reply__tokens">
                  in {{ t.in }} · out {{ t.out }} · cached {{ t.cached }} tokens
                </p>
              }
            </div>
          }
        </section>

        <!-- Danger zone: delete all data -->
        <section class="section section--danger">
          <h3 class="eyebrow eyebrow--danger">Data</h3>
          <p class="muted">
            Everything Applye stores lives on this device. Deleting your data removes every job,
            application, document, note and cache, clears your saved API keys, and starts you over
            at onboarding. This cannot be undone.
          </p>
          @if (!confirmingReset()) {
            <button
              class="btn btn--danger btn--md danger-btn"
              type="button"
              (click)="confirmingReset.set(true)"
            >
              <lucide-icon [img]="icons.remove" [size]="16" aria-hidden="true" />
              Delete all data
            </button>
          } @else {
            <div class="confirm" role="alertdialog" aria-label="Confirm delete all data">
              <p class="confirm__q">Delete everything and start over? This cannot be undone.</p>
              <div class="confirm__actions">
                <button
                  class="btn btn--danger-solid btn--md"
                  type="button"
                  [disabled]="resetting()"
                  (click)="resetAllData()"
                >
                  @if (resetting()) {
                    <lucide-icon [img]="icons.loader" [size]="16" class="spin" aria-hidden="true" />
                    Deleting…
                  } @else {
                    <lucide-icon [img]="icons.remove" [size]="16" aria-hidden="true" />
                    Yes, delete everything
                  }
                </button>
                <button
                  class="btn btn--secondary btn--md"
                  type="button"
                  [disabled]="resetting()"
                  (click)="confirmingReset.set(false)"
                >
                  Cancel
                </button>
              </div>
            </div>
          }
        </section>

        <!-- About -->
        <section class="section section--about">
          <h3 class="eyebrow">About</h3>
          <div class="about">
            <span class="about__name">Applye</span>
            @if (appVersion()) {
              <span class="about__version">v{{ appVersion() }}</span>
            }
          </div>
          <p class="muted">Private, local-first job search. Your data never leaves this device.</p>
        </section>
      </div>
    }
  `,
  styles: [
    `
      .settings {
        max-width: var(--content-max);
        display: flex;
        flex-direction: column;
        gap: var(--space-7);
        color: var(--text-primary);
        /* The shell's scroll container clips flush at the last section; give the
           page its own breathing room so the final card never kisses the edge. */
        padding-bottom: var(--space-8);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }
      .eyebrow {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
        margin: 0 0 var(--space-4);
      }
      .section {
        background: var(--surface-1);
        border: var(--border-width) solid var(--border-subtle);
        border-radius: var(--radius-card);
        padding: var(--space-6);
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }
      .row {
        display: flex;
        gap: var(--space-5);
        flex-wrap: wrap;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-width: 220px;
      }
      .field.grow {
        flex: 1;
      }
      .field.actions {
        flex-direction: row;
        align-items: flex-end;
        gap: var(--space-3);
        min-width: 0;
      }
      .cap {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .disclosure {
        font-size: var(--text-sm);
        line-height: var(--leading-relaxed);
        color: var(--text-secondary);
        background: var(--warning-tint);
        border: var(--border-width) solid color-mix(in srgb, var(--warning) 30%, transparent);
        border-radius: var(--radius-input);
        padding: var(--space-4) var(--space-5);
        margin: 0;
      }
      .disclosure strong {
        color: var(--text-primary);
      }
      .cli-status {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .cli-status__row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin: 0;
      }
      .cli-status__row strong {
        color: var(--text-primary);
      }
      .cli-status__row--missing {
        color: var(--text-tertiary);
      }
      /* Present but unrunnable is a louder problem than absent: the user
         believes this CLI is installed, and nothing else on screen disagrees. */
      .cli-status__row--broken {
        flex-wrap: wrap;
        color: var(--warning);
      }
      .cli-status__broken code {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
      }
      .cli-status__error {
        flex-basis: 100%;
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
        word-break: break-all;
      }
      .cli-status__version {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .cli-status__path {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        word-break: break-all;
      }
      input,
      select {
        font-family: var(--font-sans);
        font-size: var(--text-body);
        color: var(--text-primary);
        background: var(--surface-sunken);
        border: var(--border-width) solid var(--border-default);
        border-radius: var(--radius-input);
        padding: var(--space-3) var(--space-4);
        transition:
          border-color var(--dur-fast) var(--ease-standard),
          background var(--dur-fast) var(--ease-standard);
      }
      input::placeholder {
        color: var(--text-tertiary);
      }
      select {
        appearance: none;
        cursor: pointer;
        padding-right: var(--space-8);
        background-image:
          linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%),
          linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%);
        background-position:
          calc(100% - var(--space-4) - 5px) center,
          calc(100% - var(--space-4)) center;
        background-size: 5px 5px;
        background-repeat: no-repeat;
      }
      select:disabled {
        background-image: none;
      }
      input:hover:not(:disabled),
      select:hover:not(:disabled) {
        border-color: var(--border-strong, var(--text-tertiary));
      }
      input:focus-visible,
      select:focus-visible {
        outline: none;
        border-color: var(--accent);
        background: var(--surface-1);
      }
      /* .section is a stretch-aligned flex column, so a .btn dropped straight
         into one spans the full card width - which no button in this layout
         ever wants. Fixed for the class rather than per-button: "Re-run
         onboarding" had this bug precisely because it lacked the one-off
         override that "Send a test prompt" carried. */
      .section > .btn {
        align-self: flex-start;
      }
      .toggle {
        display: inline-flex;
        border: var(--border-width) solid var(--border-default);
        border-radius: var(--radius-input);
        overflow: hidden;
        width: fit-content;
      }
      .seg {
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        background: transparent;
        border: none;
        padding: var(--space-3) var(--space-5);
        cursor: pointer;
      }
      .seg--on {
        background: var(--accent-tint);
        color: var(--text-accent);
      }
      .hint {
        margin: var(--space-2) 0 0;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .geo-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .geo-chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        background: var(--surface-sunken);
        border: var(--border-width) solid var(--border-default);
        border-radius: var(--radius-badge);
        padding: var(--space-2) var(--space-3);
        cursor: pointer;
        transition:
          background var(--dur-fast) var(--ease-standard),
          border-color var(--dur-fast) var(--ease-standard),
          color var(--dur-fast) var(--ease-standard);
      }
      .geo-chip:hover {
        border-color: var(--border-strong);
      }
      /* The checkbox inside is what actually takes focus, so the ring has to
         be drawn by the label around it. */
      .geo-chip:has(:focus-visible) {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .geo-chip input {
        margin: 0;
        padding: 0;
        accent-color: var(--accent);
      }
      .geo-chip--on {
        background: var(--accent-tint);
        border-color: var(--accent);
        color: var(--text-accent);
      }
      /* The row that is not the active geo mode. Muted rather than disabled:
         clicking a chip here is how the user switches back, so it must stay
         reachable by mouse and keyboard. The hint below it says as much. */
      .geo-chips--muted .geo-chip {
        opacity: 0.45;
      }
      .geo-chips--muted .geo-chip:hover,
      .geo-chips--muted .geo-chip:has(:focus-visible) {
        opacity: 1;
      }
      .market-plan__label {
        margin: var(--space-4) 0 var(--space-2);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .market-plan__list {
        margin: 0;
        padding-left: var(--space-5);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .market-plan__host {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
      }
      .reply {
        margin-top: var(--space-4);
        background: var(--surface-sunken);
        border: var(--border-width) solid var(--border-subtle);
        border-radius: var(--radius-input);
        padding: var(--space-5);
      }
      .reply__text {
        margin: 0 0 var(--space-3);
        color: var(--text-primary);
      }
      .reply__tokens {
        margin: 0;
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .muted {
        color: var(--text-secondary);
        font-size: var(--text-sm);
        margin: 0;
        line-height: var(--leading-relaxed);
        max-width: 64ch;
      }
      .seg lucide-icon {
        display: inline-flex;
        vertical-align: -2px;
        margin-right: var(--space-1);
      }

      /* Danger zone */
      .section--danger {
        border-color: color-mix(in srgb, var(--danger) 32%, transparent);
        background: color-mix(in srgb, var(--danger-tint) 45%, var(--surface-1));
      }
      .eyebrow--danger {
        color: var(--danger);
      }
      .danger-btn {
        align-self: flex-start;
      }
      .confirm {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-5);
        background: var(--danger-tint);
        border: var(--border-width) solid color-mix(in srgb, var(--danger) 40%, transparent);
        border-radius: var(--radius-input);
      }
      .confirm__q {
        margin: 0;
        color: var(--text-primary);
        font-size: var(--text-body);
        font-weight: var(--weight-medium);
      }
      .confirm__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
      }
      /* Solid, high-commitment destructive button — the confirm step earns the
         weight the resting "Delete all data" trigger deliberately withholds. */
      .btn--danger-solid {
        background: var(--danger);
        color: var(--white, #fff);
        border: none;
      }
      .btn--danger-solid:hover:not(:disabled) {
        background: color-mix(in srgb, var(--danger) 84%, black);
      }
      .spin {
        animation: settings-spin 0.7s linear infinite;
      }
      @keyframes settings-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .spin {
          animation: none;
        }
      }

      /* About */
      .about {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
      }
      .about__name {
        font-weight: var(--weight-semibold);
        color: var(--text-primary);
      }
      .about__version {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        padding: 2px var(--space-2);
        border: var(--border-width) solid var(--border-subtle);
        border-radius: var(--radius-input);
      }
    `,
  ],
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
      // Keychain keys live outside the DB — clear each provider we support.
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

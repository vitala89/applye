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
  LANGUAGE_NATIVE_NAMES,
  parseGeoScopes,
  Settings,
  SupportedLanguage,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { HealthCheckPanelComponent } from '../../core/health-check-panel.component';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ThemeService, Theme } from '../../core/theme.service';
import { ToastService } from '../../core/toast/toast.service';

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
const CLI_PROVIDERS: { id: AiProvider; label: string; command: string }[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'openai', label: 'Codex CLI', command: 'codex' },
  { id: 'gemini', label: 'Gemini CLI', command: 'gemini' },
];

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
                  <p class="cli-status__row" [class.cli-status__row--missing]="!c.installed">
                    <lucide-icon
                      [img]="c.installed ? icons.stored : icons.missing"
                      [size]="14"
                      aria-hidden="true"
                    />
                    <strong>{{ c.label }}</strong>
                    @if (c.installed) {
                      <span class="cli-status__path">{{ c.path }}</span>
                    } @else {
                      <span
                        >not found — install <code>{{ c.command }}</code> and sign in to it</span
                      >
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
                <input
                  type="text"
                  [ngModel]="s.defaultModel"
                  (ngModelChange)="patch('defaultModel', $event)"
                  [ngModelOptions]="{ standalone: true }"
                  placeholder="leave empty for the CLI's own default"
                />
              </label>
              <label class="field">
                <span class="cap">{{ t()('settings.economy_model_label') }}</span>
                <input
                  type="text"
                  [ngModel]="s.economyModel"
                  (ngModelChange)="patch('economyModel', $event)"
                  [ngModelOptions]="{ standalone: true }"
                  placeholder="leave empty for the CLI's own default"
                />
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
            <p class="hint">
              Model names are passed straight through to the CLI, so use whatever that CLI accepts
              (for example <code>sonnet</code> or <code>opus</code> for Claude Code). Leave a field
              empty and Applye omits the flag entirely, letting the CLI pick.
            </p>
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

        <!-- Job search scope (drives the Discover scan's geo filter) -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.jobsearch_section') }}</h3>
          <div class="field grow">
            <span class="cap">{{ t()('settings.geo_scope_label') }}</span>
            <div class="geo-chips">
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
            <p class="hint">{{ t()('settings.geo_scope_hint') }}</p>
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
            class="btn btn--primary btn--md test-btn"
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
      .test-btn {
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
        border-color: var(--border-strong, var(--text-tertiary));
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

  /** Test connection needs a stored key in API mode, an installed CLI in CLI mode. */
  canTest(): boolean {
    return this.isCliMode() ? (this.currentCliStatus()?.installed ?? false) : this.keyStored();
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
    } else if (s.provider !== 'claude' && s.provider !== 'deepseek') {
      await this.onProviderChange('claude');
    }
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
      if (s.aiMode === 'cli') await this.refreshCliProbe();
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

  // --- Job search geo scope ---
  // Auto-saves immediately on every toggle (like Discover's own source
  // toggles) instead of waiting for the page's explicit Save button - this
  // setting drives live Discover scan behavior, so a choice here must take
  // effect right away even if the user never touches Save.
  readonly geoScopeKeys = GEO_SCOPE_KEYS;

  readonly geoScopeSelected = computed<ReadonlySet<GeoScopeKey>>(
    () => new Set(parseGeoScopes(this.settings()?.geoScope)),
  );

  geoScopeChecked(key: GeoScopeKey): boolean {
    return this.geoScopeSelected().has(key);
  }

  geoWorldwideChecked(): boolean {
    return this.geoScopeSelected().size === 0;
  }

  async toggleGeoScope(key: GeoScopeKey): Promise<void> {
    const next = new Set(this.geoScopeSelected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    await this.persistGeoScopes([...next]);
  }

  async setGeoWorldwide(): Promise<void> {
    if (this.geoWorldwideChecked()) return;
    await this.persistGeoScopes([]);
  }

  private async persistGeoScopes(next: GeoScopeKey[]): Promise<void> {
    const prev = this.settings();
    if (!prev) return;
    const geoScope = encodeGeoScopes(next);
    this.settings.set({ ...prev, geoScope }); // optimistic
    try {
      await this.db.updateSettings({ geoScope });
    } catch (e) {
      console.error('settings: geo scope save failed', e);
      this.settings.set(prev); // rollback
      this.toast.error(String(e));
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

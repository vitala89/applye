import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, LucideAngularModule } from 'lucide-angular';
import { AiService, DbService, KeysService } from '@applye/data';
import { Settings, SupportedLanguage } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { HealthCheckPanelComponent } from '../../core/health-check-panel.component';

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

/**
 * Phase 2 Settings — the first screen that touches AI. Wires the existing
 * db_get/update_settings + the OS-keychain commands, and proves the end-to-end
 * AI round-trip via "Test connection". Styled strictly with libs/ui tokens.
 *
 * NOTE: strings are inline for now (the i18n lib isn't wired into the app yet —
 * tracked as a follow-up). The economy/quality toggle is local UI state; there
 * is no persisted tier field in the Phase 1 settings schema.
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
          <h2>{{ t()('settings.title') }}</h2>
          <button class="btn" [disabled]="saving()" (click)="save()">
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
              (ngModelChange)="patch('aiMode', $event)"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="api">API (direct)</option>
              <option value="cli" disabled>CLI bridge (coming soon)</option>
            </select>
          </label>

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

          @if (s.provider === 'deepseek') {
            <p class="disclosure" role="note">
              <strong>Privacy note:</strong> DeepSeek is a China-based cloud provider. In API mode
              the job description and your profile text are sent to DeepSeek's servers to be
              processed, the same as any cloud API. Your API key is stored in the OS keychain and
              never written to the local database or logs. If you would rather keep everything on
              device, use a different provider. AI is always opt-in: nothing is sent until you
              trigger an action.
            </p>
          }

          <div class="row">
            <label class="field">
              <span class="cap">Quality model</span>
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
              <span class="cap">Economy model</span>
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
          </div>

          <div class="field">
            <span class="cap">Test tier</span>
            <div class="toggle">
              <button
                class="seg"
                [class.seg--on]="tier() === 'economy'"
                (click)="tier.set('economy')"
              >
                Economy
              </button>
              <button
                class="seg"
                [class.seg--on]="tier() === 'quality'"
                (click)="tier.set('quality')"
              >
                Quality
              </button>
            </div>
          </div>
        </section>

        <!-- API key (keychain) -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('settings.section_key') }}</h3>
          <p class="muted">
            @if (keyStored()) {
              <strong
                ><lucide-icon [img]="icons.stored" [size]="14" aria-hidden="true" /> Stored in your
                OS keychain.</strong
              >
              You don't need to re-enter it — the field stays empty because the key is never read
              back to the app. Type a new one only to replace it.
            } @else {
              Saved to your OS keychain, never written to disk or logs, and sent only to the chosen
              provider.
            }
          </p>
          <div class="row">
            <label class="field grow">
              <span class="cap">{{ s.provider }} API key</span>
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
                class="btn"
                [disabled]="keyBusy() || !apiKeyInput().trim()"
                (click)="saveKey()"
              >
                {{ keyStored() ? 'Replace' : 'Save key' }}
              </button>
              @if (keyStored()) {
                <button class="btn btn--ghost" [disabled]="keyBusy()" (click)="removeKey()">
                  Remove
                </button>
              }
            </div>
          </div>
        </section>

        <!-- Languages + export -->
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
                  <option [value]="l">{{ l }}</option>
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
                  <option [value]="l">{{ l }}</option>
                }
              </select>
            </label>
          </div>
          <label class="field">
            <span class="cap">Export directory</span>
            <input
              [ngModel]="s.exportDir"
              (ngModelChange)="patch('exportDir', $event)"
              [ngModelOptions]="{ standalone: true }"
              placeholder="~/Documents/Applye"
            />
          </label>
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

        <!-- Test connection -->
        <section class="section">
          <h3 class="eyebrow">Test connection</h3>
          <button class="btn" [disabled]="testing() || !keyStored()" (click)="testConnection()">
            {{ testing() ? 'Testing…' : 'Send a test prompt' }}
          </button>
          @if (!keyStored()) {
            <p class="muted">Store an API key first.</p>
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

        @if (status()) {
          <p class="status">{{ status() }}</p>
        }
      </div>
    } @else {
      <p class="status">{{ status() }}</p>
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
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      h2 {
        font-family: var(--font-brand);
        font-size: var(--text-h2);
        margin: 0;
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
      input,
      select {
        font-family: var(--font-sans);
        font-size: var(--text-body);
        color: var(--text-primary);
        background: var(--surface-sunken);
        border: var(--border-width) solid var(--border-default);
        border-radius: var(--radius-input);
        padding: var(--space-3) var(--space-4);
      }
      input::placeholder {
        color: var(--text-tertiary);
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
      .btn {
        font-family: var(--font-sans);
        font-size: var(--text-body);
        font-weight: var(--weight-semibold);
        color: var(--accent-fg);
        background: var(--accent);
        border: none;
        border-radius: var(--radius-card);
        padding: var(--space-3) var(--space-5);
        cursor: pointer;
      }
      .btn:hover:not(:disabled) {
        background: var(--accent-hover);
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn--ghost {
        background: transparent;
        color: var(--text-secondary);
        border: var(--border-width) solid var(--border-default);
      }
      .btn--ghost:hover:not(:disabled) {
        background: var(--surface-hover);
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
      }
      .status {
        font-size: var(--text-sm);
        color: var(--text-accent);
      }
    `,
  ],
})
export class SettingsComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly keys = inject(KeysService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { stored: Check };

  readonly languages = LANGUAGES;

  /** Model list for the currently selected provider. */
  get models(): string[] {
    return this.settings()?.provider === 'deepseek' ? DEEPSEEK_MODELS : CLAUDE_MODELS;
  }
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly status = signal('');
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
    } catch (e) {
      this.status.set(`Load failed: ${String(e)}`);
    } finally {
      this.loading.set(false);
    }
  }

  patch<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const s = this.settings();
    if (s) this.settings.set({ ...s, [key]: value });
    if (key === 'uiLanguage') this.i18n.setLocale(value as SupportedLanguage);
  }

  async onProviderChange(provider: Settings['provider']): Promise<void> {
    this.patch('provider', provider);
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
    this.status.set('');
    try {
      this.settings.set(await this.db.updateSettings(s));
      this.status.set('Settings saved.');
    } catch (e) {
      this.status.set(`Save failed: ${String(e)}`);
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
      this.status.set('API key stored in your OS keychain.');
    } catch (e) {
      this.status.set(`Key store failed: ${String(e)}`);
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
      this.status.set('API key removed from keychain.');
    } catch (e) {
      this.status.set(`Key remove failed: ${String(e)}`);
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
    this.status.set('');
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
      this.status.set(`Test failed: ${String(e)}`);
    } finally {
      this.testing.set(false);
    }
  }
}

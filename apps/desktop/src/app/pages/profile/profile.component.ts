import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiService, DbService } from '@applye/data';
import { Profile, Settings } from '@applye/core';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (loading()) {
      <div class="state-loading-text" [attr.aria-label]="t()('common.loading')">
        {{ t()('common.loading') }}
      </div>
    } @else {
      <div class="profile">
        <!-- Header -->
        <header class="profile__head">
          <div>
            <h2>{{ t()('profile.title') }}</h2>
            <p class="muted">{{ t()('profile.subtitle') }}</p>
          </div>
          <div class="profile__head-actions">
            <button class="btn" [disabled]="saving() || !dirty()" (click)="save()">
              {{
                saving()
                  ? t()('profile.saving')
                  : dirty()
                    ? t()('profile.save_btn')
                    : t()('profile.saved_status')
              }}
            </button>
            @if (saveStatus()) {
              <span class="status" [class.status--error]="saveError()">{{ saveStatus() }}</span>
            }
          </div>
        </header>

        <!-- Editor -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('profile.section_markdown') }}</h3>
          <div class="editor-hint">
            <span># Name · Title · Location</span>
            <span>## Experience · Skills · Education · Languages</span>
          </div>
          <textarea
            class="editor"
            [ngModel]="fullMd()"
            (ngModelChange)="fullMd.set($event)"
            spellcheck="false"
            placeholder="# Jane Doe&#10;Senior Frontend Engineer · Berlin&#10;&#10;## Experience&#10;…"
          ></textarea>
          @if (dirty()) {
            <p class="unsaved-hint">{{ t()('profile.unsaved') }}</p>
          }
        </section>

        <!-- AI Tools -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('profile.section_ai_tools') }}</h3>
          <p class="muted">{{ t()('profile.ai_hint') }}</p>

          <div class="ai-tools">
            <div class="tool-card">
              <div class="tool-card__body">
                <p class="tool-card__title">{{ t()('profile.scoring_title') }}</p>
                <p class="tool-card__desc">{{ t()('profile.scoring_desc') }}</p>
              </div>
              <div class="tool-card__foot">
                <button
                  class="btn"
                  [disabled]="scoring() || !fullMd().trim()"
                  (click)="generateScoringProfile()"
                >
                  {{
                    scoring()
                      ? t()('profile.generating')
                      : profile()?.scoringJson
                        ? t()('profile.regenerate')
                        : t()('profile.generate')
                  }}
                </button>
                @if (scoreStatus()) {
                  <span class="status" [class.status--error]="scoreError()">{{
                    scoreStatus()
                  }}</span>
                }
              </div>
              @if (profile()?.scoringJson) {
                <pre class="output-block">{{ profile()?.scoringJson }}</pre>
              }
            </div>

            <div class="tool-card">
              <div class="tool-card__body">
                <p class="tool-card__title">{{ t()('profile.pitch_title') }}</p>
                <p class="tool-card__desc">{{ t()('profile.pitch_desc') }}</p>
              </div>
              <div class="tool-card__foot">
                <button
                  class="btn"
                  [disabled]="pitching() || !fullMd().trim()"
                  (click)="generatePitch()"
                >
                  {{
                    pitching()
                      ? t()('profile.generating')
                      : profile()?.pitchMd
                        ? t()('profile.regenerate')
                        : t()('profile.generate')
                  }}
                </button>
                @if (pitchStatus()) {
                  <span class="status" [class.status--error]="pitchError()">{{
                    pitchStatus()
                  }}</span>
                }
              </div>
              @if (profile()?.pitchMd) {
                <div class="output-block output-block--prose">{{ profile()?.pitchMd }}</div>
              }
            </div>
          </div>
        </section>
      </div>
    }
  `,
  styles: [
    `
      .profile {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        max-width: 880px;
      }

      .profile__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-4);
      }
      .profile__head h2 {
        font-family: var(--font-brand);
        font-size: var(--text-xl);
        color: var(--text-primary);
        margin-bottom: var(--space-1);
      }
      .profile__head-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-shrink: 0;
        padding-top: var(--space-1);
      }

      .section {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .eyebrow {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
      }

      .editor-hint {
        display: flex;
        gap: var(--space-4);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
        opacity: 0.6;
      }
      .editor {
        width: 100%;
        min-height: 400px;
        padding: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        line-height: 1.65;
        color: var(--text-primary);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        resize: vertical;
      }
      .editor:focus {
        outline: none;
        border-color: var(--indigo-500, #6366f1);
      }
      .unsaved-hint {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        margin: 0;
      }

      .ai-tools {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .tool-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--surface-1);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
      }
      .tool-card__body {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .tool-card__title {
        font-weight: var(--weight-medium);
        color: var(--text-primary);
        font-size: var(--text-sm);
        margin: 0;
      }
      .tool-card__desc {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0;
      }
      .tool-card__foot {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .output-block {
        margin: 0;
        padding: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        line-height: 1.6;
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .output-block--prose {
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        line-height: 1.7;
        white-space: pre-line;
      }

      .muted {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0;
      }
      .status {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .status--error {
        color: var(--danger);
      }

      .btn {
        padding: var(--space-2) var(--space-4);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-input);
        cursor: pointer;
        white-space: nowrap;
      }
      .btn:hover:not(:disabled) {
        background: var(--surface-4, var(--surface-3));
        filter: brightness(1.1);
      }
      .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    `,
  ],
})
export class ProfileComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly fullMd = signal('');
  readonly profile = signal<Profile | null>(null);
  readonly settings = signal<Settings | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly scoring = signal(false);
  readonly pitching = signal(false);

  readonly saveStatus = signal('');
  readonly saveError = signal(false);
  readonly scoreStatus = signal('');
  readonly scoreError = signal(false);
  readonly pitchStatus = signal('');
  readonly pitchError = signal(false);

  readonly dirty = computed(() => this.fullMd() !== (this.profile()?.fullMd ?? ''));

  async ngOnInit(): Promise<void> {
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
      this.fullMd.set(p?.fullMd ?? '');
      if (p?.updatedAt) {
        this.saveStatus.set(`Last saved ${p.updatedAt}`);
      }
    } catch (e) {
      this.saveStatus.set(`Load failed: ${String(e)}`);
      this.saveError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saveStatus.set('');
    this.saveError.set(false);
    try {
      const p = this.profile();
      const saved = await this.db.upsertProfile({
        fullMd: this.fullMd(),
        scoringJson: p?.scoringJson,
        scoringHash: p?.scoringHash,
        pitchMd: p?.pitchMd,
      });
      this.profile.set(saved);
      this.saveStatus.set(`Saved ${saved.updatedAt ?? 'now'}`);
    } catch (e) {
      this.saveStatus.set(`Save failed: ${String(e)}`);
      this.saveError.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  async generateScoringProfile(): Promise<void> {
    const md = this.fullMd().trim();
    if (!md) {
      this.scoreStatus.set('Profile is empty — add content first.');
      return;
    }
    const p = this.profile();
    const s = this.settings();
    if (!s) return;

    const hash = await this.db.hashText(md);
    if (hash === p?.scoringHash && p?.scoringJson) {
      this.scoreStatus.set('Profile unchanged — using cached scoring profile (0 tokens).');
      return;
    }

    this.scoring.set(true);
    this.scoreStatus.set('');
    this.scoreError.set(false);
    try {
      const rendered = await this.ai.renderSkill('profile-compress', { profile_md: md });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: 'en',
      });
      const saved = await this.db.upsertProfile({
        fullMd: this.fullMd(),
        scoringJson: res.text,
        scoringHash: hash,
        pitchMd: p?.pitchMd,
      });
      this.profile.set(saved);
      this.scoreStatus.set(`Generated — ${res.tokensInput} in / ${res.tokensOutput} out`);
    } catch (e) {
      this.scoreStatus.set(`Failed: ${String(e)}`);
      this.scoreError.set(true);
    } finally {
      this.scoring.set(false);
    }
  }

  async generatePitch(): Promise<void> {
    const md = this.fullMd().trim();
    if (!md) {
      this.pitchStatus.set('Profile is empty — add content first.');
      return;
    }
    const p = this.profile();
    const s = this.settings();
    if (!s) return;

    const hash = await this.db.hashText(md);
    if (hash === p?.scoringHash && p?.pitchMd) {
      this.pitchStatus.set('Profile unchanged — using cached pitch (0 tokens).');
      return;
    }

    this.pitching.set(true);
    this.pitchStatus.set('');
    this.pitchError.set(false);
    try {
      const lang = s.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('pitch', {
        profile_md: md,
        duration: '60s',
        language: lang,
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });
      const saved = await this.db.upsertProfile({
        fullMd: this.fullMd(),
        scoringJson: p?.scoringJson,
        scoringHash: p?.scoringHash,
        pitchMd: res.text,
      });
      this.profile.set(saved);
      this.pitchStatus.set(`Generated — ${res.tokensInput} in / ${res.tokensOutput} out`);
    } catch (e) {
      this.pitchStatus.set(`Failed: ${String(e)}`);
      this.pitchError.set(true);
    } finally {
      this.pitching.set(false);
    }
  }
}

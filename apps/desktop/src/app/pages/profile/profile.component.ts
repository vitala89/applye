import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from '@applye/ui';
import { AiService, DbService } from '@applye/data';
import {
  Profile,
  Settings,
  ProfileForm,
  ProfileFieldKey,
  EMPTY_FORM,
  parseProfileMd,
  serializeProfileForm,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '../../core/toast/toast.service';
import { ScoringSummaryComponent } from './scoring-summary.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, ButtonDirective, ScoringSummaryComponent],
  template: `
    @if (loading()) {
      <div class="state-loading-text" [attr.aria-label]="t()('common.loading')">
        {{ t()('common.loading') }}
      </div>
    } @else {
      <div class="profile">
        <!-- Header -->
        <header class="profile__head">
          <p class="muted">
            {{ t()('profile.subtitle') }}
            <span
              class="info info--below"
              tabindex="0"
              [attr.aria-label]="t()('profile.info_aria')"
            >
              <svg class="info__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.3" />
                <circle cx="8" cy="4.6" r="0.9" fill="currentColor" />
                <path
                  d="M8 7.2v4.6"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                />
              </svg>
              <span class="info__tip" role="tooltip">{{ t()('profile.info_profile') }}</span>
            </span>
          </p>
          <div class="profile__head-actions">
            <button appButton variant="secondary" size="md" (click)="onboarding.requestOpen()">
              {{ t()('onboarding.rerun') }}
            </button>
            <button
              appButton
              variant="primary"
              size="md"
              [disabled]="saving() || !dirty()"
              (click)="save()"
            >
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

        <!-- Target roles (archetypes) -->
        <section class="section">
          <h3 class="eyebrow-row">
            <span class="eyebrow">{{ t()('profile.section_archetypes') }}</span>
            <span
              class="info info--below"
              tabindex="0"
              [attr.aria-label]="t()('profile.info_aria')"
            >
              <svg class="info__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.3" />
                <circle cx="8" cy="4.6" r="0.9" fill="currentColor" />
                <path
                  d="M8 7.2v4.6"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                />
              </svg>
              <span class="info__tip" role="tooltip">{{ t()('profile.info_archetypes') }}</span>
            </span>
          </h3>
          <p class="muted">{{ t()('profile.archetypes_hint') }}</p>
          @if (archetypes().length === 0) {
            <p class="status status--warn">{{ t()('profile.archetypes_empty_warning') }}</p>
          }
          @if (archetypes().length > 0) {
            <div class="archetype-list">
              @for (a of archetypes(); track $index) {
                <div class="archetype-row">
                  <input
                    class="archetype-input"
                    type="text"
                    [ngModel]="a"
                    (ngModelChange)="updateArchetype($index, $event)"
                    [placeholder]="t()('profile.archetype_placeholder')"
                  />
                  <button
                    class="btn-icon"
                    type="button"
                    (click)="removeArchetype($index)"
                    [attr.aria-label]="t()('profile.remove_archetype')"
                  >
                    ×
                  </button>
                </div>
              }
            </div>
          }
          @if (archetypes().length < 5) {
            <button appButton variant="secondary" size="sm" type="button" (click)="addArchetype()">
              {{ t()('profile.add_archetype') }}
            </button>
          }
        </section>

        <!-- Editor -->
        <section class="section">
          <div class="editor-head">
            <h3 class="eyebrow">{{ t()('profile.section_markdown') }}</h3>
            <div class="mode-toggle" role="tablist">
              <button
                type="button"
                class="mode-btn"
                [class.mode-btn--on]="!rawMode()"
                (click)="rawMode() && toggleRawMode()"
              >
                {{ t()('profile.mode_form') }}
              </button>
              <button
                type="button"
                class="mode-btn"
                [class.mode-btn--on]="rawMode()"
                (click)="!rawMode() && toggleRawMode()"
              >
                {{ t()('profile.mode_raw') }}
              </button>
            </div>
          </div>

          @if (!rawMode()) {
            <div class="form-cards">
              <div class="form-card">
                <div class="field">
                  <label class="field__label" for="field-name">{{
                    t()('profile.field_name')
                  }}</label>
                  <input
                    id="field-name"
                    class="field__input"
                    type="text"
                    [ngModel]="form().name"
                    (ngModelChange)="updateField('name', $event)"
                  />
                </div>
                <div class="field-row">
                  <div class="field">
                    <label class="field__label" for="field-title">{{
                      t()('profile.field_title')
                    }}</label>
                    <input
                      id="field-title"
                      class="field__input"
                      type="text"
                      [ngModel]="form().title"
                      (ngModelChange)="updateField('title', $event)"
                    />
                  </div>
                  <div class="field">
                    <label class="field__label" for="field-location">{{
                      t()('profile.field_location')
                    }}</label>
                    <input
                      id="field-location"
                      class="field__input"
                      type="text"
                      [ngModel]="form().location"
                      (ngModelChange)="updateField('location', $event)"
                    />
                  </div>
                </div>
              </div>

              <div class="form-card">
                <div class="field">
                  <label class="field__label" for="field-experience">{{
                    t()('profile.field_experience')
                  }}</label>
                  <textarea
                    id="field-experience"
                    class="field__input field__input--area"
                    [ngModel]="form().experienceText"
                    (ngModelChange)="updateField('experienceText', $event)"
                  ></textarea>
                </div>
              </div>

              <div class="form-card">
                <div class="field">
                  <label class="field__label" for="field-skills">{{
                    t()('profile.field_skills')
                  }}</label>
                  <input
                    id="field-skills"
                    class="field__input"
                    type="text"
                    [ngModel]="form().skills.join(', ')"
                    (ngModelChange)="updateSkills($event)"
                    [placeholder]="t()('profile.skills_hint')"
                  />
                </div>
                <div class="field">
                  <label class="field__label" for="field-education">{{
                    t()('profile.field_education')
                  }}</label>
                  <input
                    id="field-education"
                    class="field__input"
                    type="text"
                    [ngModel]="form().education"
                    (ngModelChange)="updateField('education', $event)"
                  />
                </div>
                <div class="field">
                  <label class="field__label" for="field-languages">{{
                    t()('profile.field_languages')
                  }}</label>
                  <input
                    id="field-languages"
                    class="field__input"
                    type="text"
                    [ngModel]="form().languages.join(', ')"
                    (ngModelChange)="updateLanguages($event)"
                    [placeholder]="t()('profile.languages_hint')"
                  />
                </div>
              </div>
            </div>
          } @else {
            <div class="editor-panel">
              <div class="scaffold">
                <span class="scaffold__label">{{ t()('profile.scaffold_label') }}</span>
                <span class="scaffold__line"># Name · Title · Location</span>
                <span class="scaffold__line">## Experience · Skills · Education · Languages</span>
              </div>
              <textarea
                class="editor"
                [ngModel]="fullMd()"
                (ngModelChange)="fullMd.set($event)"
                spellcheck="false"
              ></textarea>
            </div>
          }
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
              <div
                class="tool-card__head"
                role="button"
                tabindex="0"
                [attr.aria-expanded]="scoringOpen()"
                (click)="toggleScoring()"
                (keydown.enter)="toggleScoring()"
                (keydown.space)="toggleScoring(); $event.preventDefault()"
              >
                <div class="tool-card__body">
                  <p class="tool-card__title">
                    {{ t()('profile.scoring_card_title') }}
                    <span
                      class="info info--below"
                      tabindex="0"
                      (click)="$event.stopPropagation()"
                      (keydown)="$event.stopPropagation()"
                      [attr.aria-label]="t()('profile.info_aria')"
                    >
                      <svg
                        class="info__glyph"
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <circle
                          cx="8"
                          cy="8"
                          r="7"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.3"
                        />
                        <circle cx="8" cy="4.6" r="0.9" fill="currentColor" />
                        <path
                          d="M8 7.2v4.6"
                          stroke="currentColor"
                          stroke-width="1.3"
                          stroke-linecap="round"
                        />
                      </svg>
                      <span class="info__tip" role="tooltip">{{
                        t()('profile.info_scoring')
                      }}</span>
                    </span>
                  </p>
                  <p class="tool-card__desc">{{ t()('profile.scoring_desc') }}</p>
                </div>
                <span class="chevron" [class.chevron--open]="scoringOpen()" aria-hidden="true"
                  >›</span
                >
              </div>
              @if (scoringOpen()) {
                <div class="tool-card__foot">
                  <button
                    appButton
                    variant="secondary"
                    size="sm"
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
                  @if (scoringCached()) {
                    <span class="chip">{{ t()('profile.cached_chip') }}</span>
                  }
                  @if (scoreStatus()) {
                    <span class="status" [class.status--error]="scoreError()">{{
                      scoreStatus()
                    }}</span>
                  }
                </div>
                @if (profile()?.scoringJson) {
                  <app-scoring-summary
                    [scoringJson]="profile()?.scoringJson ?? null"
                    [form]="form()"
                    (addField)="focusField($event)"
                  />
                }
              }
            </div>

            <div class="tool-card">
              <div class="tool-card__body">
                <p class="tool-card__title">{{ t()('profile.pitch_title') }}</p>
                <p class="tool-card__desc">{{ t()('profile.pitch_desc') }}</p>
              </div>
              <div class="tool-card__foot">
                <button
                  appButton
                  variant="secondary"
                  size="sm"
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
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
      }
      .profile__head-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-shrink: 0;
      }

      .section {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .eyebrow,
      .eyebrow-row {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .eyebrow-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin: 0;
      }

      /* Info-icon tooltip: hover/focus reveals plain-language help. */
      .info {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.05rem;
        height: 1.05rem;
        flex-shrink: 0;
        text-transform: none;
        letter-spacing: 0;
        color: var(--text-tertiary);
        border-radius: var(--radius-full);
        cursor: help;
      }
      .info__glyph {
        width: 100%;
        height: 100%;
        display: block;
      }
      .info:hover,
      .info:focus {
        color: var(--text-secondary);
      }
      .info__tip {
        position: absolute;
        bottom: calc(100% + var(--space-2));
        left: 0;
        z-index: 20;
        width: max-content;
        max-width: 280px;
        padding: var(--space-3);
        font-size: var(--text-xs);
        font-weight: var(--weight-regular);
        font-style: normal;
        line-height: 1.5;
        color: var(--text-primary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-md);
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.12s ease;
        pointer-events: none;
      }
      .info--below .info__tip {
        bottom: auto;
        top: calc(100% + var(--space-2));
      }
      .info:hover .info__tip,
      .info:focus .info__tip {
        opacity: 1;
        visibility: visible;
      }

      .editor-panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        max-width: 72ch;
      }
      .scaffold {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        padding: var(--space-3) var(--space-4);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
        background: var(--surface-sunken);
        border: 1px dashed var(--border-default);
        border-radius: var(--radius-card);
      }
      .scaffold__label {
        font-family: var(--font-sans);
        font-weight: var(--weight-medium);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        margin-bottom: var(--space-1);
      }
      .editor {
        width: 100%;
        min-height: 400px;
        padding: var(--space-4);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        line-height: 1.65;
        color: var(--text-primary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        resize: vertical;
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
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
      }
      .tool-card__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
        cursor: pointer;
      }
      .tool-card__body {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .tool-card__title {
        display: flex;
        align-items: center;
        gap: var(--space-2);
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
      .chevron {
        font-size: var(--text-body);
        color: var(--text-tertiary);
        transform: rotate(90deg);
        transition: transform 0.12s ease;
        flex-shrink: 0;
      }
      .chevron--open {
        transform: rotate(-90deg);
      }
      .chip {
        padding: var(--space-1) var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-badge);
        white-space: nowrap;
      }

      .output-block,
      .json-block {
        margin: 0;
        padding: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        line-height: 1.6;
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
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
        display: flex;
        align-items: center;
        gap: var(--space-2);
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
      .status--warn {
        color: var(--warning);
      }

      .archetype-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .archetype-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      button[appButton] {
        align-self: flex-start;
      }
      .archetype-input {
        flex: 1;
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-primary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
      }
      .btn-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        flex-shrink: 0;
        font-size: var(--text-body);
        line-height: 1;
        color: var(--text-tertiary);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        cursor: pointer;
      }
      .btn-icon:hover {
        color: var(--danger);
        filter: brightness(1.1);
      }

      .editor-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .mode-toggle {
        display: inline-flex;
        gap: var(--space-1);
        padding: var(--space-1);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-badge);
      }
      .mode-btn {
        padding: var(--space-1) var(--space-3);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        background: none;
        border: none;
        border-radius: var(--radius-badge);
        cursor: pointer;
      }
      .mode-btn--on {
        color: var(--text-primary);
        background: var(--surface-2);
      }
      .form-cards {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        max-width: 72ch;
      }
      .form-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .field-row {
        display: flex;
        gap: var(--space-3);
      }
      .field-row .field {
        flex: 1;
      }
      .field__label {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .field__input {
        width: 100%;
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-primary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
      }
      .field__input--area {
        min-height: 160px;
        line-height: 1.6;
        resize: vertical;
      }
    `,
  ],
})
export class ProfileComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  protected readonly onboarding = inject(OnboardingService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  readonly fullMd = signal('');
  readonly rawMode = signal(false);
  readonly form = signal<ProfileForm>({ ...EMPTY_FORM });
  readonly archetypes = signal<string[]>([]);
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
  readonly scoringOpen = signal(true);

  readonly archetypesDirty = computed(
    () =>
      JSON.stringify(this.archetypes()) !==
      JSON.stringify(this.parseArchetypes(this.profile()?.targetArchetypes)),
  );
  readonly dirty = computed(
    () => this.fullMd() !== (this.profile()?.fullMd ?? '') || this.archetypesDirty(),
  );
  readonly scoringCached = computed(() => !!this.profile()?.scoringJson && !this.dirty());

  async ngOnInit(): Promise<void> {
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
      this.fullMd.set(p?.fullMd ?? '');
      this.form.set(parseProfileMd(p?.fullMd ?? ''));
      this.archetypes.set(this.parseArchetypes(p?.targetArchetypes));
      if (p?.updatedAt) {
        this.saveStatus.set(this.t()('profile.last_saved').replace('{date}', p.updatedAt));
      }
    } catch (e) {
      this.saveStatus.set(this.t()('profile.load_failed').replace('{error}', String(e)));
      this.saveError.set(true);
      this.toast.error(this.t()('profile.load_failed').replace('{error}', String(e)));
    } finally {
      this.loading.set(false);
    }
  }

  toggleScoring(): void {
    this.scoringOpen.update((v) => !v);
  }

  private syncMdFromForm(): void {
    this.fullMd.set(serializeProfileForm(this.form()));
  }

  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.syncMdFromForm();
  }

  updateSkills(value: string): void {
    this.updateField(
      'skills',
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  updateLanguages(value: string): void {
    this.updateField(
      'languages',
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  toggleRawMode(): void {
    if (this.rawMode()) {
      // leaving raw → re-parse edited markdown back into fields
      this.form.set(parseProfileMd(this.fullMd()));
    } else {
      this.syncMdFromForm();
    }
    this.rawMode.update((v) => !v);
  }

  focusField(key: ProfileFieldKey): void {
    const el = document.getElementById('field-' + key);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement | null)?.focus?.();
  }

  private parseArchetypes(json: string | null | undefined): string[] {
    try {
      const arr = JSON.parse(json || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  addArchetype(): void {
    if (this.archetypes().length >= 5) return;
    this.archetypes.update((a) => [...a, '']);
  }

  removeArchetype(index: number): void {
    this.archetypes.update((a) => a.filter((_, i) => i !== index));
  }

  updateArchetype(index: number, value: string): void {
    this.archetypes.update((a) => a.map((v, i) => (i === index ? value : v)));
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
        targetArchetypes: JSON.stringify(this.archetypes().filter((a) => a.trim())),
      });
      this.profile.set(saved);
      this.archetypes.set(this.parseArchetypes(saved.targetArchetypes));
      this.saveStatus.set(this.t()('profile.saved_at').replace('{date}', saved.updatedAt ?? 'now'));
    } catch (e) {
      this.saveStatus.set(this.t()('profile.save_failed').replace('{error}', String(e)));
      this.saveError.set(true);
      this.toast.error(this.t()('profile.save_failed').replace('{error}', String(e)));
    } finally {
      this.saving.set(false);
    }
  }

  async generateScoringProfile(): Promise<void> {
    const md = this.fullMd().trim();
    if (!md) {
      this.scoreStatus.set(this.t()('profile.empty_hint'));
      return;
    }
    const p = this.profile();
    const s = this.settings();
    if (!s) return;

    const hash = await this.db.hashText(md);
    if (hash === p?.scoringHash && p?.scoringJson) {
      this.scoreStatus.set(this.t()('profile.scoring_cached'));
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
        targetArchetypes: p?.targetArchetypes,
      });
      this.profile.set(saved);
      this.scoreStatus.set(
        this.t()('profile.generated_tokens')
          .replace('{in}', String(res.tokensInput))
          .replace('{out}', String(res.tokensOutput)),
      );
    } catch (e) {
      this.scoreStatus.set(this.t()('profile.generate_failed').replace('{error}', String(e)));
      this.scoreError.set(true);
      this.toast.error(this.t()('profile.generate_failed').replace('{error}', String(e)));
    } finally {
      this.scoring.set(false);
    }
  }

  async generatePitch(): Promise<void> {
    const md = this.fullMd().trim();
    if (!md) {
      this.pitchStatus.set(this.t()('profile.empty_hint'));
      return;
    }
    const p = this.profile();
    const s = this.settings();
    if (!s) return;

    const hash = await this.db.hashText(md);
    if (hash === p?.scoringHash && p?.pitchMd) {
      this.pitchStatus.set(this.t()('profile.pitch_cached'));
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
        targetArchetypes: p?.targetArchetypes,
      });
      this.profile.set(saved);
      this.pitchStatus.set(
        this.t()('profile.generated_tokens')
          .replace('{in}', String(res.tokensInput))
          .replace('{out}', String(res.tokensOutput)),
      );
    } catch (e) {
      this.pitchStatus.set(this.t()('profile.generate_failed').replace('{error}', String(e)));
      this.pitchError.set(true);
      this.toast.error(this.t()('profile.generate_failed').replace('{error}', String(e)));
    } finally {
      this.pitching.set(false);
    }
  }
}

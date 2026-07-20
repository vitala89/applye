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
  EducationEntry,
  EMPTY_EDUCATION_ENTRY,
  parseEducationEntries,
  serializeEducationEntries,
  ExperienceEntry,
  EMPTY_EXPERIENCE_ENTRY,
  parseExperienceEntries,
  serializeExperienceEntries,
  LanguageEntry,
  EMPTY_LANGUAGE_ENTRY,
  parseLanguageEntries,
  serializeLanguageEntries,
  Archetype,
  parseArchetypes,
  serializeArchetypes,
  profileCompleteness,
  missingFields,
  parseScoringJson,
  scoringState as computeScoringState,
  pitchState as computePitchState,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import {
  LucideAngularModule,
  Info,
  Save,
  Check,
  RotateCcw,
  Target,
  X,
  Plus,
  Sparkles,
  Mic,
  RefreshCw,
  ChevronDown,
  CircleDot,
  TriangleAlert,
} from 'lucide-angular';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '../../core/toast/toast.service';
import { ScoringSummaryComponent } from './scoring-summary.component';
import { CompletenessHeroComponent } from './completeness-hero.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    FormsModule,
    ButtonDirective,
    ScoringSummaryComponent,
    CompletenessHeroComponent,
    LucideAngularModule,
  ],
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
              <lucide-icon [img]="infoIcon" [size]="14" class="info__glyph" aria-hidden="true" />
              <span class="info__tip" role="tooltip">{{ t()('profile.info_profile') }}</span>
            </span>
          </p>
          <div class="profile__head-actions">
            @if (saveError() && saveStatus()) {
              <span class="head-status status--error">{{ saveStatus() }}</span>
            } @else if (dirty()) {
              <span class="head-status head-status--warn">
                <lucide-icon [img]="unsavedIcon" [size]="13" aria-hidden="true" />
                {{ t()('profile.unsaved') }}
              </span>
            } @else if (saveStatus()) {
              <span class="head-status head-status--ok">
                <lucide-icon [img]="checkIcon" [size]="13" aria-hidden="true" />
                {{ t()('profile.saved_status') }}
              </span>
            }
            <button appButton variant="secondary" size="md" (click)="onboarding.requestOpen()">
              <lucide-icon [img]="rerunIcon" [size]="15" aria-hidden="true" />
              {{ t()('onboarding.rerun') }}
            </button>
            <button
              appButton
              variant="primary"
              size="md"
              [disabled]="saving() || !dirty() || scoring() || pitching()"
              (click)="save()"
            >
              <lucide-icon [img]="dirty() ? saveIcon : checkIcon" [size]="15" aria-hidden="true" />
              {{
                saving()
                  ? t()('profile.saving')
                  : dirty()
                    ? t()('profile.save_btn')
                    : t()('profile.saved_status')
              }}
            </button>
          </div>
        </header>

        <app-completeness-hero
          [completeness]="completeness()"
          [gaps]="gaps()"
          [name]="form().name"
          [subtitle]="heroSubtitle()"
          (addField)="focusField($event)"
        />

        <!-- Target roles (archetypes) -->
        <section class="section section--card">
          <h3 class="eyebrow-row">
            <span class="eyebrow">{{ t()('profile.section_archetypes') }}</span>
            <span
              class="info info--below"
              tabindex="0"
              [attr.aria-label]="t()('profile.info_aria')"
            >
              <lucide-icon [img]="infoIcon" [size]="14" class="info__glyph" aria-hidden="true" />
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
                <div class="archetype-card">
                  <div class="archetype-card__top">
                    <lucide-icon
                      [img]="targetIcon"
                      [size]="16"
                      class="archetype-card__icon"
                      aria-hidden="true"
                    />
                    <input
                      class="archetype-input"
                      type="text"
                      [ngModel]="a.name"
                      (ngModelChange)="updateArchetype($index, { name: $event })"
                      [placeholder]="t()('profile.archetype_placeholder')"
                      [attr.aria-label]="t()('profile.archetype_name')"
                    />
                    <select
                      class="archetype-fit"
                      [ngModel]="a.fit"
                      (ngModelChange)="updateArchetype($index, { fit: $event })"
                      [attr.aria-label]="t()('profile.archetype_fit')"
                    >
                      <option value="primary">{{ t()('profile.fit_primary') }}</option>
                      <option value="secondary">{{ t()('profile.fit_secondary') }}</option>
                      <option value="adjacent">{{ t()('profile.fit_adjacent') }}</option>
                    </select>
                    <button
                      class="btn-ghost"
                      type="button"
                      (click)="removeArchetype($index)"
                      [attr.aria-label]="t()('profile.remove_archetype')"
                    >
                      <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
                    </button>
                  </div>
                  <div class="archetype-card__sell">
                    <label class="archetype-card__label" [attr.for]="'archetype-sell-' + $index">{{
                      t()('profile.archetype_sell_when')
                    }}</label>
                    <textarea
                      [id]="'archetype-sell-' + $index"
                      class="archetype-sell"
                      [ngModel]="a.sellWhen"
                      (ngModelChange)="updateArchetype($index, { sellWhen: $event })"
                      [placeholder]="t()('profile.archetype_sell_when_hint')"
                    ></textarea>
                  </div>
                </div>
              }
            </div>
          }
          @if (archetypes().length < 5) {
            <button class="btn-dashed" type="button" (click)="addArchetype()">
              <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
              {{ t()('profile.add_archetype') }}
            </button>
          }
        </section>

        <!-- Editor -->
        <section class="section section--card">
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
              <div class="field">
                <label class="field__label" for="field-name">{{ t()('profile.field_name') }}</label>
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

              <div class="field-row">
                <div class="field">
                  <label class="field__label" for="field-email">{{
                    t()('profile.field_email')
                  }}</label>
                  <input
                    id="field-email"
                    class="field__input"
                    type="email"
                    [ngModel]="form().email"
                    (ngModelChange)="updateField('email', $event)"
                  />
                </div>
                <div class="field">
                  <label class="field__label" for="field-phone">{{
                    t()('profile.field_phone')
                  }}</label>
                  <input
                    id="field-phone"
                    class="field__input"
                    type="tel"
                    [ngModel]="form().phone"
                    (ngModelChange)="updateField('phone', $event)"
                  />
                </div>
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="field__label" for="field-website">{{
                    t()('profile.field_website')
                  }}</label>
                  <input
                    id="field-website"
                    class="field__input"
                    type="text"
                    [ngModel]="form().website"
                    (ngModelChange)="updateField('website', $event)"
                    [placeholder]="t()('profile.website_hint')"
                  />
                </div>
                <div class="field">
                  <label class="field__label" for="field-linkedin">{{
                    t()('profile.field_linkedin')
                  }}</label>
                  <input
                    id="field-linkedin"
                    class="field__input"
                    type="text"
                    [ngModel]="form().linkedin"
                    (ngModelChange)="updateField('linkedin', $event)"
                    [placeholder]="t()('profile.linkedin_hint')"
                  />
                </div>
              </div>

              <div class="field field--full" id="field-experience">
                <div class="field__label-row">
                  <span class="field__label">{{ t()('profile.section_experience') }}</span>
                  <span class="field__hint field__hint--inline">{{
                    t()('profile.experience_hint')
                  }}</span>
                </div>
                @if (experienceEntries().length > 0) {
                  <div class="archetype-list">
                    @for (e of experienceEntries(); track ei; let ei = $index) {
                      <div class="archetype-card">
                        <div class="archetype-card__top">
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.role"
                            (ngModelChange)="updateExperienceField(ei, 'role', $event)"
                            [placeholder]="t()('profile.exp_role')"
                            [attr.aria-label]="t()('profile.exp_role')"
                          />
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.company"
                            (ngModelChange)="updateExperienceField(ei, 'company', $event)"
                            [placeholder]="t()('profile.exp_company')"
                            [attr.aria-label]="t()('profile.exp_company')"
                          />
                          <button
                            class="btn-ghost"
                            type="button"
                            (click)="removeExperience(ei)"
                            [attr.aria-label]="t()('profile.remove_experience')"
                          >
                            <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
                          </button>
                        </div>
                        <div class="archetype-card__top">
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.location"
                            (ngModelChange)="updateExperienceField(ei, 'location', $event)"
                            [placeholder]="t()('profile.exp_location')"
                            [attr.aria-label]="t()('profile.exp_location')"
                          />
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.startDate"
                            (ngModelChange)="updateExperienceField(ei, 'startDate', $event)"
                            [placeholder]="t()('profile.exp_start')"
                            [attr.aria-label]="t()('profile.exp_start')"
                          />
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.endDate"
                            (ngModelChange)="updateExperienceField(ei, 'endDate', $event)"
                            [placeholder]="t()('profile.exp_end')"
                            [attr.aria-label]="t()('profile.exp_end')"
                          />
                        </div>
                        <div class="exp-bullets">
                          @for (b of e.bullets; track bi; let bi = $index) {
                            <div class="exp-bullet-row">
                              <input
                                class="archetype-input"
                                type="text"
                                [ngModel]="b"
                                (ngModelChange)="updateExperienceBullet(ei, bi, $event)"
                                [placeholder]="t()('profile.exp_bullet_hint')"
                                [attr.aria-label]="t()('profile.exp_bullet_hint')"
                              />
                              <button
                                class="btn-ghost"
                                type="button"
                                (click)="removeExperienceBullet(ei, bi)"
                                [attr.aria-label]="t()('profile.exp_remove_bullet')"
                              >
                                <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
                              </button>
                            </div>
                          }
                          <button
                            class="btn-dashed"
                            type="button"
                            (click)="addExperienceBullet(ei)"
                          >
                            <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
                            {{ t()('profile.exp_add_bullet') }}
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
                <button class="btn-dashed" type="button" (click)="addExperience()">
                  <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
                  {{ t()('profile.add_experience') }}
                </button>
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="field__label" for="field-skills">{{
                    t()('profile.field_skills')
                  }}</label>
                  <div class="chip-input">
                    @for (s of form().skills; track $index) {
                      <span class="skill-chip">
                        {{ s }}
                        <button
                          type="button"
                          class="skill-chip__x"
                          (click)="removeSkillChip($index)"
                          [attr.aria-label]="t()('profile.remove_skill')"
                        >
                          <lucide-icon [img]="removeIcon" [size]="12" aria-hidden="true" />
                        </button>
                      </span>
                    }
                    <input
                      id="field-skills"
                      class="chip-input__field"
                      type="text"
                      (keydown.enter)="addSkillChip($event)"
                      [placeholder]="t()('profile.skills_add_hint')"
                    />
                  </div>
                </div>
                <div class="field" id="field-languages">
                  <span class="field__label">{{ t()('profile.section_languages') }}</span>
                  @if (languageEntries().length > 0) {
                    <div class="lang-list">
                      @for (l of languageEntries(); track $index) {
                        <div class="lang-row">
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="l.language"
                            (ngModelChange)="updateLanguageField($index, 'language', $event)"
                            [placeholder]="t()('profile.lang_name')"
                            [attr.aria-label]="t()('profile.lang_name')"
                          />
                          <select
                            class="archetype-fit"
                            [ngModel]="l.level"
                            (ngModelChange)="updateLanguageField($index, 'level', $event)"
                            [attr.aria-label]="t()('profile.lang_level')"
                          >
                            @for (lvl of languageLevels; track lvl) {
                              <option [value]="lvl">
                                {{ lvl || t()('profile.lang_level_none') }}
                              </option>
                            }
                          </select>
                          <button
                            class="btn-ghost"
                            type="button"
                            (click)="removeLanguage($index)"
                            [attr.aria-label]="t()('profile.remove_language')"
                          >
                            <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
                          </button>
                        </div>
                      }
                    </div>
                  }
                  <button class="btn-dashed" type="button" (click)="addLanguage()">
                    <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
                    {{ t()('profile.add_language') }}
                  </button>
                </div>
              </div>

              <div class="field field--full" id="field-education">
                <span class="field__label">{{ t()('profile.field_education') }}</span>
                <p class="muted">{{ t()('profile.education_hint') }}</p>
                @if (educationEntries().length > 0) {
                  <div class="archetype-list">
                    @for (e of educationEntries(); track $index) {
                      <div class="archetype-card">
                        <div class="archetype-card__top">
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.title"
                            (ngModelChange)="updateEducation($index, 'title', $event)"
                            [placeholder]="t()('profile.education_title_hint')"
                            [attr.aria-label]="t()('profile.education_title')"
                          />
                          <button
                            class="btn-ghost"
                            type="button"
                            (click)="removeEducation($index)"
                            [attr.aria-label]="t()('profile.remove_education')"
                          >
                            <lucide-icon [img]="removeIcon" [size]="15" aria-hidden="true" />
                          </button>
                        </div>
                        <div class="archetype-card__top">
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.institution"
                            (ngModelChange)="updateEducation($index, 'institution', $event)"
                            [placeholder]="t()('profile.education_institution_hint')"
                            [attr.aria-label]="t()('profile.education_institution')"
                          />
                        </div>
                        <div class="archetype-card__top">
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.startDate"
                            (ngModelChange)="updateEducation($index, 'startDate', $event)"
                            [placeholder]="t()('profile.education_start_hint')"
                            [attr.aria-label]="t()('profile.education_start')"
                          />
                          <input
                            class="archetype-input"
                            type="text"
                            [ngModel]="e.endDate"
                            (ngModelChange)="updateEducation($index, 'endDate', $event)"
                            [placeholder]="t()('profile.education_end_hint')"
                            [attr.aria-label]="t()('profile.education_end')"
                          />
                        </div>
                      </div>
                    }
                  </div>
                }
                <button class="btn-dashed" type="button" (click)="addEducation()">
                  <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
                  {{ t()('profile.add_education') }}
                </button>
              </div>
            </div>
          } @else {
            <div class="editor-panel">
              <textarea
                class="editor"
                [ngModel]="fullMd()"
                (ngModelChange)="fullMd.set($event)"
                spellcheck="false"
              ></textarea>
              <div class="scaffold">
                <span class="scaffold__label">{{ t()('profile.scaffold_label') }}</span>
                <span class="scaffold__line"># Name · Title · Location</span>
                <span class="scaffold__line">## Contact</span>
                <span class="scaffold__line">## Experience &nbsp;&nbsp;### Role, Company</span>
                <span class="scaffold__line">## Skills · Education · Languages</span>
              </div>
            </div>
          }
          @if (dirty()) {
            <p class="unsaved-hint">
              <lucide-icon [img]="unsavedIcon" [size]="13" aria-hidden="true" />
              {{ t()('profile.unsaved') }}
            </p>
          }
        </section>

        <!-- AI Tools -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('profile.section_ai_tools') }}</h3>
          <p class="muted">{{ t()('profile.ai_hint') }}</p>

          <div class="ai-tools">
            <div class="tool-card">
              <div
                class="tool-card__head tool-card__head--toggle"
                role="button"
                tabindex="0"
                [attr.aria-expanded]="scoringOpen()"
                (click)="toggleScoring()"
                (keydown.enter)="toggleScoring()"
                (keydown.space)="toggleScoring(); $event.preventDefault()"
              >
                <span class="tool-card__icon" aria-hidden="true">
                  <lucide-icon [img]="scoringIcon" [size]="16" />
                </span>
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
                      <lucide-icon
                        [img]="infoIcon"
                        [size]="14"
                        class="info__glyph"
                        aria-hidden="true"
                      />
                      <span class="info__tip" role="tooltip">{{
                        t()('profile.info_scoring')
                      }}</span>
                    </span>
                  </p>
                  <p class="tool-card__desc">{{ t()('profile.scoring_desc') }}</p>
                </div>
                <lucide-icon
                  [img]="chevronIcon"
                  [size]="17"
                  class="chevron"
                  [class.chevron--open]="scoringOpen()"
                  aria-hidden="true"
                />
              </div>
              @if (scoringOpen()) {
                @if (scoring()) {
                  <div class="ai-loading">
                    <span class="ai-loading__dots" aria-hidden="true"><i></i><i></i><i></i></span>
                    <span class="ai-loading__label">{{ t()('profile.scoring_loading') }}</span>
                  </div>
                } @else if (profile()?.scoringJson) {
                  <app-scoring-summary [scoringJson]="profile()?.scoringJson ?? null" />
                }
                <div class="tool-card__foot">
                  <button
                    appButton
                    variant="secondary"
                    size="sm"
                    [disabled]="scoring() || pitching() || saving() || !fullMd().trim()"
                    (click)="generateScoringProfile()"
                  >
                    <lucide-icon [img]="regenIcon" [size]="13" aria-hidden="true" />
                    {{
                      scoring()
                        ? t()('profile.generating')
                        : profile()?.scoringJson
                          ? t()('profile.regenerate')
                          : t()('profile.generate')
                    }}
                  </button>
                  @if (scoringState() === 'fresh') {
                    <span class="chip">
                      <lucide-icon [img]="checkIcon" [size]="12" aria-hidden="true" />
                      {{ t()('profile.cached_chip') }}
                    </span>
                  } @else if (scoringState() === 'stale') {
                    <span class="chip chip--stale">
                      <lucide-icon [img]="staleIcon" [size]="12" aria-hidden="true" />
                      {{ t()('profile.stale_chip') }}
                    </span>
                    <span class="chip-hint">{{ t()('profile.stale_hint') }}</span>
                  } @else if (scoringState() === 'unsaved') {
                    <span class="chip chip--stale">
                      <lucide-icon [img]="unsavedIcon" [size]="12" aria-hidden="true" />
                      {{ t()('profile.unsaved_chip') }}
                    </span>
                    <span class="chip-hint">{{ t()('profile.unsaved_scoring_hint') }}</span>
                  }
                  @if (scoreStatus()) {
                    <span class="status" [class.status--error]="scoreError()">{{
                      scoreStatus()
                    }}</span>
                  }
                </div>
              }
            </div>

            <div class="tool-card">
              <div class="tool-card__head">
                <span class="tool-card__icon" aria-hidden="true">
                  <lucide-icon [img]="pitchIcon" [size]="16" />
                </span>
                <div class="tool-card__body">
                  <p class="tool-card__title">{{ t()('profile.pitch_title') }}</p>
                  <p class="tool-card__desc">{{ t()('profile.pitch_desc') }}</p>
                </div>
                <button
                  appButton
                  variant="secondary"
                  size="sm"
                  [disabled]="pitching() || scoring() || saving() || !fullMd().trim()"
                  (click)="generatePitch()"
                >
                  <lucide-icon [img]="regenIcon" [size]="13" aria-hidden="true" />
                  {{
                    pitching()
                      ? t()('profile.generating')
                      : profile()?.pitchMd
                        ? t()('profile.regenerate')
                        : t()('profile.generate')
                  }}
                </button>
              </div>
              @if (pitching()) {
                <div class="ai-loading">
                  <span class="ai-loading__dots" aria-hidden="true"><i></i><i></i><i></i></span>
                  <span class="ai-loading__label">{{ t()('profile.pitch_loading') }}</span>
                </div>
              } @else if (profile()?.pitchMd) {
                <div class="output-block output-block--prose">{{ profile()?.pitchMd }}</div>
              }
              <div class="tool-card__foot">
                @if (pitchState() === 'fresh') {
                  <span class="chip">
                    <lucide-icon [img]="checkIcon" [size]="12" aria-hidden="true" />
                    {{ t()('profile.cached_chip') }}
                  </span>
                } @else if (pitchState() === 'stale') {
                  <span class="chip chip--stale">
                    <lucide-icon [img]="staleIcon" [size]="12" aria-hidden="true" />
                    {{ t()('profile.stale_chip') }}
                  </span>
                  <span class="chip-hint">{{ t()('profile.pitch_stale_hint') }}</span>
                } @else if (pitchState() === 'unsaved') {
                  <span class="chip chip--stale">
                    <lucide-icon [img]="unsavedIcon" [size]="12" aria-hidden="true" />
                    {{ t()('profile.unsaved_chip') }}
                  </span>
                  <span class="chip-hint">{{ t()('profile.unsaved_pitch_hint') }}</span>
                }
                @if (pitchStatus()) {
                  <span class="status" [class.status--error]="pitchError()">{{
                    pitchStatus()
                  }}</span>
                }
              </div>
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
      .head-status {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        white-space: nowrap;
      }
      .head-status--warn {
        color: var(--text-tertiary);
      }
      .head-status--ok {
        color: var(--success);
      }
      button[appButton] {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
      }

      .section {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .section--card {
        padding: var(--space-5);
        background: var(--surface-1);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-sm);
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
        line-height: 1.7;
        color: var(--text-disabled);
        background: transparent;
        border: 1px dashed var(--border-default);
        border-radius: var(--radius-input);
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
        min-height: 300px;
        padding: var(--space-5) var(--space-5);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        line-height: 1.7;
        color: var(--text-primary);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        resize: vertical;
        outline: none;
      }
      .unsaved-hint {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--warning);
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
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-sm);
      }
      .tool-card__head {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .tool-card__head--toggle {
        cursor: pointer;
      }
      .tool-card__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        color: var(--text-accent);
        background: var(--accent-tint);
        border-radius: var(--radius-input);
      }
      .tool-card__body {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        flex: 1;
        min-width: 0;
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
        color: var(--text-tertiary);
        transition: transform var(--dur-fast) var(--ease-standard);
        flex-shrink: 0;
      }
      .chevron--open {
        transform: rotate(180deg);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-1) var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        color: var(--text-tertiary);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-badge);
        white-space: nowrap;
      }
      .chip--stale {
        color: var(--warning);
        background: var(--warning-tint);
        border-color: transparent;
      }
      .chip-hint {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .tool-card__foot {
        flex-wrap: wrap;
      }
      .ai-loading {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4) 0;
      }
      .ai-loading__dots {
        display: flex;
        gap: 5px;
      }
      .ai-loading__dots i {
        width: 6px;
        height: 6px;
        border-radius: var(--radius-full);
        background: var(--accent);
        animation: applye-ai-pulse var(--dur-ai-pulse) var(--ease-standard) infinite;
      }
      .ai-loading__dots i:nth-child(2) {
        animation-delay: 0.3s;
      }
      .ai-loading__dots i:nth-child(3) {
        animation-delay: 0.6s;
      }
      .ai-loading__label {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        letter-spacing: var(--tracking-wide);
        color: var(--text-tertiary);
      }
      @keyframes applye-ai-pulse {
        0%,
        100% {
          opacity: 0.3;
          transform: scale(0.8);
        }
        50% {
          opacity: 1;
          transform: scale(1);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ai-loading__dots i {
          animation: none;
          opacity: 0.7;
        }
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
        gap: var(--space-4);
      }
      .archetype-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-4);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
      }
      .archetype-card__top {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .archetype-card__icon {
        color: var(--accent);
        flex-shrink: 0;
      }
      .archetype-input {
        flex: 1;
        min-width: 0;
        height: 36px;
        padding: 0 var(--space-4);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-primary);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        outline: none;
      }
      .archetype-fit {
        flex-shrink: 0;
        height: 36px;
        padding: 0 var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-primary);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        cursor: pointer;
        outline: none;
      }
      .archetype-card__sell {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding-left: calc(16px + var(--space-3));
      }
      .archetype-card__label {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        letter-spacing: var(--tracking-wide);
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .archetype-sell {
        width: 100%;
        min-height: 52px;
        padding: var(--space-3) var(--space-4);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        line-height: 1.5;
        color: var(--text-secondary);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        resize: vertical;
        outline: none;
      }
      .btn-ghost {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        color: var(--text-tertiary);
        background: transparent;
        border: none;
        border-radius: var(--radius-input);
        cursor: pointer;
      }
      .btn-ghost:hover {
        color: var(--danger);
        background: var(--surface-active);
      }
      .btn-dashed {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        height: 36px;
        padding: 0 var(--space-4);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
        background: transparent;
        border: 1px dashed var(--border-strong);
        border-radius: var(--radius-input);
        cursor: pointer;
      }
      .btn-dashed:hover {
        color: var(--text-accent);
        background: var(--accent-tint);
        border-color: var(--accent);
        border-style: solid;
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
        background: var(--surface-1);
        box-shadow: var(--shadow-xs);
      }
      .form-cards {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
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
        height: 38px;
        padding: 0 var(--space-4);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-primary);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        outline: none;
      }
      .field__input--area {
        height: 150px;
        padding: var(--space-4) var(--space-5);
        line-height: 1.7;
        resize: vertical;
      }
      .field__input--mono {
        font-family: var(--font-mono);
        font-size: var(--text-sm);
      }
      .chip-input {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        align-items: center;
        padding: var(--space-2);
        min-height: 38px;
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
      }
      .chip-input__field {
        flex: 1;
        min-width: 120px;
        border: none;
        background: transparent;
        outline: none;
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-primary);
      }
      .skill-chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        padding: 2px var(--space-2);
        font-size: var(--text-xs);
        color: var(--text-primary);
        background: var(--surface-1);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-badge);
      }
      .skill-chip__x {
        display: inline-flex;
        align-items: center;
        border: none;
        background: none;
        color: var(--text-tertiary);
        cursor: pointer;
        padding: 0;
      }
      .skill-chip__x:hover {
        color: var(--danger);
      }
      .field__hint {
        margin: 0 0 var(--space-1);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
      }
      .field__label-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .field__hint--inline {
        margin: 0;
        font-family: var(--font-mono);
      }
      .exp-bullets {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding-left: var(--space-4);
      }
      .exp-bullet-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .lang-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .lang-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
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
  protected readonly infoIcon = Info;
  protected readonly saveIcon = Save;
  protected readonly checkIcon = Check;
  protected readonly rerunIcon = RotateCcw;
  protected readonly targetIcon = Target;
  protected readonly removeIcon = X;
  protected readonly plusIcon = Plus;
  protected readonly scoringIcon = Sparkles;
  protected readonly pitchIcon = Mic;
  protected readonly regenIcon = RefreshCw;
  protected readonly chevronIcon = ChevronDown;
  protected readonly unsavedIcon = CircleDot;
  protected readonly staleIcon = TriangleAlert;

  readonly fullMd = signal('');
  readonly rawMode = signal(false);
  readonly form = signal<ProfileForm>({ ...EMPTY_FORM });
  /** Structured mirror of `form().education` for the multi-entry editor. Its
   * own signal (not a computed) so a freshly-added blank row survives until the
   * user fills it — `serializeEducationEntries` drops blank lines from the
   * string, but the row must stay editable. Re-seeded whenever the form is
   * reparsed (load, leaving raw mode). */
  readonly educationEntries = signal<EducationEntry[]>([]);
  /** Structured mirror of `form().experienceText`, same rationale as `educationEntries`. */
  readonly experienceEntries = signal<ExperienceEntry[]>([]);
  /** Structured mirror of `form().languages`, same rationale as `educationEntries`. */
  readonly languageEntries = signal<LanguageEntry[]>([]);
  protected readonly languageLevels = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];
  readonly archetypes = signal<Archetype[]>([]);
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
      serializeArchetypes(this.archetypes()) !==
      serializeArchetypes(parseArchetypes(this.profile()?.targetArchetypes)),
  );
  readonly mdDirty = computed(() => this.fullMd() !== (this.profile()?.fullMd ?? ''));
  readonly dirty = computed(() => this.mdDirty() || this.archetypesDirty());

  /** Hash of the saved fullMd. hashText is an IPC call, so it cannot be derived inside a computed. */
  readonly savedMdHash = signal<string | null>(null);

  /** Archetype edits are excluded via mdDirty: they never enter fullMd, so they cannot stale it. */
  readonly scoringState = computed(() =>
    computeScoringState({
      hasScoringJson: !!this.profile()?.scoringJson,
      mdDirty: this.mdDirty(),
      savedMdHash: this.savedMdHash(),
      scoringHash: this.profile()?.scoringHash,
    }),
  );

  /** Same freshness rule as scoring, keyed on the pitch's own hash (not scoringHash). */
  readonly pitchState = computed(() =>
    computePitchState({
      hasPitch: !!this.profile()?.pitchMd,
      mdDirty: this.mdDirty(),
      savedMdHash: this.savedMdHash(),
      pitchHash: this.profile()?.pitchHash,
    }),
  );

  readonly completeness = computed(() => profileCompleteness(this.form()));
  readonly gaps = computed(() => missingFields(this.form()));
  readonly heroSubtitle = computed(() => {
    const s = parseScoringJson(this.profile()?.scoringJson ?? null);
    const f = this.form();
    return [s?.seniority, f.location || s?.location, ...(s?.domains ?? [])]
      .filter(Boolean)
      .join(' · ');
  });

  async ngOnInit(): Promise<void> {
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
      this.fullMd.set(p?.fullMd ?? '');
      this.form.set(parseProfileMd(p?.fullMd ?? ''));
      this.educationEntries.set(parseEducationEntries(this.form().education));
      this.experienceEntries.set(parseExperienceEntries(this.form().experienceText));
      this.languageEntries.set(parseLanguageEntries(this.form().languages));
      this.archetypes.set(parseArchetypes(p?.targetArchetypes));
      await this.refreshSavedMdHash(p?.fullMd ?? '');
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

  /** Trims to match the input generateScoringProfile hashes, or the two hashes never compare equal. */
  private async refreshSavedMdHash(md: string): Promise<void> {
    const text = md.trim();
    if (!text) {
      this.savedMdHash.set(null);
      return;
    }
    try {
      this.savedMdHash.set(await this.db.hashText(text));
    } catch {
      this.savedMdHash.set(null);
    }
  }

  /**
   * The only writer of the profile row, so that persisting fullMd and refreshing savedMdHash
   * cannot come apart. A hash that lags the row it describes is precisely what makes the scoring
   * chip report a stale artefact as cached, and every writer that maintained the hash by hand
   * eventually forgot to.
   *
   * Pass mdHash only when it is known to be the hash of input.fullMd trimmed; otherwise the hash
   * is recomputed from what the row actually came back with.
   */
  private async persistProfile(
    input: Partial<
      Pick<
        Profile,
        'fullMd' | 'scoringJson' | 'scoringHash' | 'pitchMd' | 'pitchHash' | 'targetArchetypes'
      >
    >,
    mdHash?: string,
  ): Promise<Profile> {
    const saved = await this.db.upsertProfile(input);
    this.profile.set(saved);
    if (mdHash) {
      this.savedMdHash.set(mdHash);
    } else {
      await this.refreshSavedMdHash(saved.fullMd);
    }
    return saved;
  }

  private syncMdFromForm(): void {
    this.fullMd.set(serializeProfileForm(this.form()));
  }

  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.syncMdFromForm();
  }

  addSkillChip(event: Event): void {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    if (this.form().skills.includes(value)) return;
    this.updateField('skills', [...this.form().skills, value]);
  }

  removeSkillChip(index: number): void {
    this.updateField(
      'skills',
      this.form().skills.filter((_, i) => i !== index),
    );
  }

  addLanguage(): void {
    this.languageEntries.update((list) => [...list, { ...EMPTY_LANGUAGE_ENTRY }]);
    this.syncLanguages();
  }

  removeLanguage(index: number): void {
    this.languageEntries.update((list) => list.filter((_, i) => i !== index));
    this.syncLanguages();
  }

  updateLanguageField(index: number, field: keyof LanguageEntry, value: string): void {
    this.languageEntries.update((list) =>
      list.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    );
    this.syncLanguages();
  }

  private syncLanguages(): void {
    this.updateField('languages', serializeLanguageEntries(this.languageEntries()));
  }

  toggleRawMode(): void {
    if (this.rawMode()) {
      // leaving raw → re-parse edited markdown back into fields
      this.form.set(parseProfileMd(this.fullMd()));
      this.educationEntries.set(parseEducationEntries(this.form().education));
      this.experienceEntries.set(parseExperienceEntries(this.form().experienceText));
      this.languageEntries.set(parseLanguageEntries(this.form().languages));
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

  addArchetype(): void {
    if (this.archetypes().length >= 5) return;
    this.archetypes.update((a) => [...a, { name: '', fit: 'primary', sellWhen: '' }]);
  }

  removeArchetype(index: number): void {
    this.archetypes.update((a) => a.filter((_, i) => i !== index));
  }

  updateArchetype(index: number, patch: Partial<Archetype>): void {
    this.archetypes.update((a) => a.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  addEducation(): void {
    this.educationEntries.update((list) => [...list, { ...EMPTY_EDUCATION_ENTRY }]);
    this.syncEducation();
  }

  removeEducation(index: number): void {
    this.educationEntries.update((list) => list.filter((_, i) => i !== index));
    this.syncEducation();
  }

  updateEducation(index: number, field: keyof EducationEntry, value: string): void {
    this.educationEntries.update((list) =>
      list.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    );
    this.syncEducation();
  }

  /** Folds the structured entries back into the `education` string (and thus
   * `fullMd`). Blank entries serialize to nothing, so the string stays clean. */
  private syncEducation(): void {
    this.updateField('education', serializeEducationEntries(this.educationEntries()));
  }

  addExperience(): void {
    this.experienceEntries.update((list) => [...list, { ...EMPTY_EXPERIENCE_ENTRY, bullets: [] }]);
    this.syncExperience();
  }

  removeExperience(index: number): void {
    this.experienceEntries.update((list) => list.filter((_, i) => i !== index));
    this.syncExperience();
  }

  updateExperienceField(
    index: number,
    field: Exclude<keyof ExperienceEntry, 'bullets'>,
    value: string,
  ): void {
    this.experienceEntries.update((list) =>
      list.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    );
    this.syncExperience();
  }

  addExperienceBullet(index: number): void {
    this.experienceEntries.update((list) =>
      list.map((e, i) => (i === index ? { ...e, bullets: [...e.bullets, ''] } : e)),
    );
    this.syncExperience();
  }

  removeExperienceBullet(index: number, bulletIndex: number): void {
    this.experienceEntries.update((list) =>
      list.map((e, i) =>
        i === index ? { ...e, bullets: e.bullets.filter((_, bi) => bi !== bulletIndex) } : e,
      ),
    );
    this.syncExperience();
  }

  updateExperienceBullet(index: number, bulletIndex: number, value: string): void {
    this.experienceEntries.update((list) =>
      list.map((e, i) =>
        i === index
          ? { ...e, bullets: e.bullets.map((b, bi) => (bi === bulletIndex ? value : b)) }
          : e,
      ),
    );
    this.syncExperience();
  }

  /** Folds the structured entries back into the `experienceText` string (and thus
   * `fullMd`). Blank entries serialize to nothing, so the string stays clean. */
  private syncExperience(): void {
    this.updateField('experienceText', serializeExperienceEntries(this.experienceEntries()));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saveStatus.set('');
    this.saveError.set(false);
    try {
      const p = this.profile();
      const saved = await this.persistProfile({
        fullMd: this.fullMd(),
        scoringJson: p?.scoringJson,
        scoringHash: p?.scoringHash,
        pitchMd: p?.pitchMd,
        pitchHash: p?.pitchHash,
        targetArchetypes: serializeArchetypes(this.archetypes()),
      });
      this.archetypes.set(parseArchetypes(saved.targetArchetypes));
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
    // Captured before any await: this is the text the artefact is generated from, so it is also
    // the text the row and scoringHash must describe. Reading fullMd() again after the AI call
    // would persist markdown nothing analysed.
    const mdAtStart = this.fullMd();
    const md = mdAtStart.trim();
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
      await this.persistProfile(
        {
          fullMd: mdAtStart,
          scoringJson: res.text,
          scoringHash: hash,
          pitchMd: p?.pitchMd,
          pitchHash: p?.pitchHash,
          targetArchetypes: p?.targetArchetypes,
        },
        hash,
      );
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
    // See generateScoringProfile: the row must describe the text that was actually pitched.
    const mdAtStart = this.fullMd();
    const md = mdAtStart.trim();
    if (!md) {
      this.pitchStatus.set(this.t()('profile.empty_hint'));
      return;
    }
    const p = this.profile();
    const s = this.settings();
    if (!s) return;

    const hash = await this.db.hashText(md);
    if (hash === p?.pitchHash && p?.pitchMd) {
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
      await this.persistProfile(
        {
          fullMd: mdAtStart,
          scoringJson: p?.scoringJson,
          scoringHash: p?.scoringHash,
          pitchMd: res.text,
          pitchHash: hash,
          targetArchetypes: p?.targetArchetypes,
        },
        hash,
      );
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

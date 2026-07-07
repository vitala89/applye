import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PageTitleService } from '../../shared/page-title/page-title.service';
import { FormsModule } from '@angular/forms';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  ExternalLink,
  FileDown,
  FileText,
  Flag,
  GitCompare,
  Hammer,
  Languages,
  ListChecks,
  LucideAngularModule,
  Minus,
  Pencil,
  PencilLine,
  Plus,
  RotateCw,
  ScanLine,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  CircleX,
  Star,
  Tag,
  Trash2,
  WandSparkles,
  Bookmark,
  X,
} from 'lucide-angular';
import { AiService, DbService, JobsStore } from '@applye/data';
import {
  Application,
  Job,
  Profile,
  ScoreDimension,
  ScoringCache,
  Settings,
  SupportedLanguage,
  CoverLetterAddress,
  CoverLetterContent,
  CvContent,
  DocumentLibraryItem,
  parseArchetypes,
  archetypeNames,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { SkeletonCard } from '@applye/ui';
import { JobDetailIcons, applicationStatusBadgeClass, classifyChangeType } from './scoring.utils';
import { ScoringView } from './scoring-view.component';
import { ApplyWizard } from './apply-wizard.component';
import { UpdatedScoreView } from './updated-score-view.component';
import {
  cleanJsonText,
  cvContentToMd,
  markdownToCvContentFallback,
} from '../documents/cv-content.util';

interface PassResult {
  pass: number;
  resultMd: string;
  changes: string[];
  gaps: string[];
  inputHash: string;
  fromCache: boolean;
  tokensIn: number;
  tokensOut: number;
}

type DocumentRegionTag = 'de' | 'us' | 'uk' | 'generic';
type ReviewDocumentKind = 'cv' | 'cover_letter';
type ReviewDocumentStatus = 'missing' | 'generating' | 'linked' | 'needs_review' | 'ready';
type FinalCheckStatus =
  | 'not_run'
  | 'pass'
  | 'needs_review'
  | 'strong'
  | 'needs_edits'
  | 'valid'
  | 'rescore'
  | 'outdated';

interface FinalChecks {
  inputHash: string;
  ats: FinalCheckStatus;
  hr: FinalCheckStatus;
  fit: FinalCheckStatus;
  notes: string[];
}

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule,
    LucideAngularModule,
    ScoringView,
    ApplyWizard,
    UpdatedScoreView,
    SkeletonCard,
  ],
  template: `
    <div class="jobs">
      @if (!wizardOpen()) {
        <!-- Paste section -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('jobs.paste_title') }}</h3>
          <textarea
            class="editor"
            [class.editor--locked]="jobLocked()"
            [disabled]="jobLocked()"
            [ngModel]="jdText()"
            (ngModelChange)="jdText.set($event)"
            [placeholder]="t()('jobs.paste_placeholder')"
            spellcheck="false"
          ></textarea>
          @if (jobLocked()) {
            <p class="locked-hint">{{ t()('jobs.description_locked') }}</p>
          } @else {
            <div class="row">
              <button
                class="btn btn--secondary btn--md"
                [disabled]="parsing() || !jdText().trim()"
                (click)="parseAndFilter()"
              >
                {{ parsing() ? t()('jobs.parsing') : t()('jobs.parse_btn') }}
              </button>
              @if (parsing()) {
                <span class="ai-thinking">
                  <span class="ai-thinking__dots"><span></span><span></span><span></span></span>
                  {{ t()('jobs.parsing') }}
                </span>
              }
              @if (parseStatus()) {
                <span class="status" [class.status--error]="parseError()">{{ parseStatus() }}</span>
              }
            </div>
          }
        </section>

        @if (!job()) {
          <div class="state-empty">
            <lucide-icon
              [img]="icons.empty"
              [size]="40"
              class="state-empty__icon"
              aria-hidden="true"
            />
            <p class="state-empty__msg">{{ t()('jobs.empty') }}</p>
          </div>
        }

        <!-- Filter result -->
        @if (job(); as j) {
          <div class="detail-actions">
            <div class="detail-actions__row">
              <!-- Left: primary action + status/tailored badges -->
              @if (!application()) {
                <button
                  class="btn btn--secondary btn--md"
                  [disabled]="actionBusy()"
                  (click)="addToPipeline()"
                >
                  {{ t()('jobs.add_to_pipeline') }}
                </button>
              }
              @if (canMarkApplied()) {
                <button
                  class="btn btn--primary btn--md"
                  [disabled]="actionBusy()"
                  (click)="markApplied()"
                >
                  {{ t()('jobs.mark_applied') }}
                </button>
              } @else if (application(); as app) {
                <span class="badge" [class]="statusBadgeClass(app.status)">{{
                  t()('status.' + app.status)
                }}</span>
              }
              @if (isTailored()) {
                <span class="badge badge--accent">
                  <lucide-icon [img]="icons.wand" [size]="11" aria-hidden="true" />
                  {{ t()('jobs.wizard.tailored_badge') }}
                </span>
              }
              @if (application()?.cvDocumentId; as cvId) {
                <button
                  class="detail-actions__doc"
                  type="button"
                  [title]="t()('jobs.open_cv_document')"
                  [attr.aria-label]="t()('jobs.open_cv_document')"
                  (click)="openCv(cvId)"
                >
                  <lucide-icon [img]="icons.fileText" [size]="14" aria-hidden="true" />
                  <span>CV</span>
                </button>
              }
              @if (application()?.coverLetterDocumentId; as clId) {
                <button
                  class="detail-actions__doc"
                  type="button"
                  [title]="t()('jobs.open_cover_letter_document')"
                  [attr.aria-label]="t()('jobs.open_cover_letter_document')"
                  (click)="openCoverLetter(clId)"
                >
                  <lucide-icon [img]="icons.pencilLine" [size]="14" aria-hidden="true" />
                  <span>{{ t()('documents.tab_cover_letter') }}</span>
                </button>
              }

              <span class="detail-actions__spacer"></span>

              <!-- Right: edit/cancel + delete -->
              @if (!canMarkApplied()) {
                <button
                  class="btn btn--secondary btn--sm"
                  type="button"
                  [disabled]="actionBusy()"
                  (click)="startEditingLocked()"
                >
                  {{ t()('jobs.change_status_action') }}
                </button>
              } @else if (editingLocked()) {
                <button
                  class="btn btn--secondary btn--sm"
                  type="button"
                  [disabled]="actionBusy()"
                  (click)="cancelEditingLocked()"
                >
                  {{ t()('actions.cancel') }}
                </button>
              }
              <button
                class="btn btn--secondary btn--sm"
                type="button"
                [disabled]="actionBusy() || deleting()"
                (click)="openDeleteConfirm()"
              >
                <lucide-icon [img]="icons.trash" [size]="14" aria-hidden="true" />
                {{ t()('jobs.delete_action') }}
              </button>
            </div>
            @if (actionMsg()) {
              <p class="detail-actions__msg">{{ actionMsg() }}</p>
            }
          </div>
          @if (deleteConfirmOpen()) {
            <div class="alert alert--danger" role="alert">
              <lucide-icon
                [img]="icons.dangerGlyph"
                [size]="16"
                class="alert__icon"
                aria-hidden="true"
              />
              <div class="alert__body">
                <p class="alert__title">{{ t()('jobs.delete_confirm_title') }}</p>
                <p class="alert__text">{{ t()('jobs.delete_confirm_msg') }}</p>
                <div class="alert__actions">
                  <button
                    class="btn btn--danger btn--md"
                    type="button"
                    [disabled]="deleting()"
                    (click)="confirmDeleteJob()"
                  >
                    {{ deleting() ? t()('common.loading') : t()('jobs.delete_confirm_btn') }}
                  </button>
                  <button
                    class="btn btn--secondary btn--md"
                    type="button"
                    [disabled]="deleting()"
                    (click)="cancelDeleteConfirm()"
                  >
                    {{ t()('actions.cancel') }}
                  </button>
                </div>
              </div>
            </div>
          }
          <section class="section">
            @if (!j.hardFilterPassed) {
              <div class="card card--danger">
                <p class="card__title">{{ t()('jobs.hard_filter_failed') }}</p>
                <p class="muted">{{ t()('jobs.hard_filter_msg') }}</p>
              </div>
            } @else {
              <div class="card">
                <div class="job-meta">
                  <div class="job-meta__info">
                    @if (j.company) {
                      <span class="job-meta__company">{{ j.company }}</span>
                    }
                    @if (j.title) {
                      <span class="job-meta__title">{{ j.title }}</span>
                    }
                    <span class="job-meta__hash">{{ (j.jdHash ?? '').slice(0, 12) }}</span>
                  </div>
                  <div class="job-meta__badges">
                    <span class="badge badge--pass">{{ t()('jobs.filter_passed') }}</span>
                    @if (hasArchetypes() && archetypeMatch() === false) {
                      <span class="badge badge--warn">{{ t()('jobs.off_archetype') }}</span>
                    }
                    @if (j.legitimacyTier === 'yellow') {
                      <span class="badge badge--warn">{{ t()('jobs.legitimacy_yellow') }}</span>
                    }
                    @if (j.legitimacyTier === 'red') {
                      <span class="badge badge--danger">{{ t()('jobs.legitimacy_red') }}</span>
                    }
                  </div>
                </div>
                @if (!hasArchetypes()) {
                  <p class="status">{{ t()('jobs.define_archetype_prompt') }}</p>
                }
                @if (legitimacyNotes().length) {
                  <ul class="legitimacy-notes">
                    @for (n of legitimacyNotes(); track n) {
                      <li>{{ n }}</li>
                    }
                  </ul>
                }
                <div class="row row--mt">
                  @if (!profile()?.scoringJson) {
                    <p class="status status--error">{{ t()('jobs.profile_needed') }}</p>
                  } @else {
                    <button
                      class="btn btn--secondary btn--md"
                      [disabled]="scoring()"
                      (click)="scoreJob(false)"
                    >
                      {{
                        scoring()
                          ? t()('jobs.scoring')
                          : cache()
                            ? t()('jobs.rescore')
                            : t()('jobs.score_btn')
                      }}
                    </button>
                    @if (scoreStatus()) {
                      <span class="status" [class.status--error]="scoreError()">{{
                        scoreStatus()
                      }}</span>
                    }
                  }
                </div>
              </div>
            }
          </section>
        }
      }

      <!-- Scoring result -->
      @if (cache(); as c) {
        <section class="section">
          @if (!wizardOpen()) {
            <!-- Legitimacy warning — informs, never blocks. User can still tailor below. -->
            @if (job()?.legitimacyTier === 'red') {
              <div class="card card--danger">
                <p class="card__title">{{ t()('jobs.legitimacy_red_banner_title') }}</p>
                @if (legitimacyNotes().length) {
                  <ul class="red-flags">
                    @for (n of legitimacyNotes(); track n) {
                      <li class="red-flag">{{ n }}</li>
                    }
                  </ul>
                }
              </div>
            }

            <app-scoring-view
              [cache]="cache()"
              [fromCache]="fromCache()"
              [job]="job()"
              [icons]="icons"
              [tailored]="isTailored()"
              (tailorApply)="openWizard()"
            />
          } @else if (applyResult()) {
            <!-- Success confirmation before redirecting back to the job -->
            <div class="apply-success card">
              <span class="apply-success__icon">
                <lucide-icon [img]="icons.checkCircle" [size]="28" aria-hidden="true" />
              </span>
              <h3 class="apply-success__title">{{ t()('jobs.wizard.update_success_title') }}</h3>
              <p class="apply-success__msg">{{ t()('jobs.wizard.update_success_msg') }}</p>
              <span class="ai-thinking">
                <span class="ai-thinking__dots"><span></span><span></span><span></span></span>
                {{ t()('jobs.wizard.redirecting') }}
              </span>
            </div>
          } @else {
            <app-apply-wizard
              [cache]="cache()"
              [fromCache]="fromCache()"
              [job]="job()"
              [jobTitle]="job()?.title ?? ''"
              [company]="job()?.company ?? ''"
              [icons]="icons"
              [postTailorScore]="postTailorScore()"
              [applicationStatus]="application()?.status ?? null"
              [overrideEditing]="editingLocked()"
              [initialStep]="wizardInitialStep()"
              (closeWizard)="closeWizard()"
              (markApplied)="markApplied()"
              (updateApplication)="updateApplication()"
              (cancelEdit)="cancelEditingLocked()"
              (stepChange)="onWizardStep($event)"
            >
              <div wizardTailorStep class="wizard-step-content">
                <div class="apply-fields-header">
                  <span class="eyebrow">{{ t()('jobs.wizard.tailor_eyebrow') }}</span>
                  <h4 class="apply-fields-title">{{ t()('jobs.wizard.tailor_title') }}</h4>
                </div>
                <!-- Phase cards -->
                <div class="tailor-phases">
                  @for (p of tailorPhases(); track p.n) {
                    <div class="tailor-phase" [class]="'tailor-phase--' + p.state">
                      <div class="tailor-phase__head">
                        <span class="tailor-phase__icon">
                          <lucide-icon [img]="p.icon" [size]="13" aria-hidden="true" />
                        </span>
                        <span class="tailor-phase__name">{{ t()(p.nameKey) }}</span>
                      </div>
                      <span class="tailor-phase__status">{{ t()(p.statusKey) }}</span>
                    </div>
                  }
                </div>

                <!-- Actions -->
                @if (tailorResults().length === 0 && !tailoring()) {
                  <div class="base-cv-picker">
                    <span class="base-cv-picker__icon" aria-hidden="true">
                      <lucide-icon [img]="icons.fileText" [size]="16" />
                    </span>
                    <div class="base-cv-picker__body">
                      <label class="base-cv-picker__label" for="wizard-base-cv">
                        {{ t()('jobs.wizard.tailor_base_cv_label') }}
                      </label>
                      <p class="base-cv-picker__hint">
                        {{ t()('jobs.wizard.tailor_base_cv_hint') }}
                      </p>
                    </div>
                    <div class="base-cv-picker__control">
                      <select
                        id="wizard-base-cv"
                        [ngModel]="selectedBaseCvId()"
                        (ngModelChange)="
                          selectedBaseCvId.set($event === null || $event === '' ? null : +$event)
                        "
                      >
                        <option [ngValue]="null">
                          {{ t()('jobs.wizard.tailor_profile_from_scratch') }}
                        </option>
                        @for (cv of matchingCvs(); track cv.id) {
                          <option [value]="cv.id">
                            {{ cv.label }} · {{ cv.regionTag?.toUpperCase() || 'GENERIC' }}
                          </option>
                        }
                      </select>
                      <lucide-icon
                        class="base-cv-picker__chevron"
                        [img]="icons.chevronDown"
                        [size]="16"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <div class="row">
                    <button
                      class="btn btn--primary btn--md"
                      [disabled]="!selectedBaseCvId() && !profile()?.fullMd"
                      (click)="startTailoring()"
                    >
                      <lucide-icon [img]="icons.sparkles" [size]="15" aria-hidden="true" />
                      {{ t()('jobs.tailor_btn') }}
                    </button>
                    @if (!selectedBaseCvId() && !profile()?.fullMd) {
                      <span class="status status--error">{{
                        t()('jobs.profile_needed_full')
                      }}</span>
                    }
                  </div>
                  <p class="muted">{{ t()('jobs.wizard.tailor_skip_hint') }}</p>
                } @else if (tailoring()) {
                  <div class="ai-thinking">
                    <span class="ai-thinking__dots"><span></span><span></span><span></span></span>
                    {{ t()(currentPhaseKey()) }}
                  </div>
                } @else if (tailorResults().length === 3) {
                  <div class="row">
                    <span class="badge badge--pass">
                      <lucide-icon [img]="icons.checkCircle" [size]="12" aria-hidden="true" />
                      {{ t()('jobs.wizard.tailored_badge') }}
                    </span>
                    <button class="btn btn--secondary btn--md" (click)="resetWizard()">
                      <lucide-icon [img]="icons.another" [size]="15" aria-hidden="true" />
                      {{ t()('jobs.wizard.retailor_btn') }}
                    </button>
                  </div>
                }

                @if (tailorStatus() && tailorError()) {
                  <span class="status status--error">{{ tailorStatus() }}</span>
                }

                <!-- Changes (shown here, after the tailoring pass completes) -->
                @if (!tailoring() && allChanges().length) {
                  <details
                    class="card tailor-changes"
                    open
                    (toggle)="changesOpen.set($any($event.target).open)"
                  >
                    <summary class="tailor-changes__summary">
                      <lucide-icon
                        [img]="icons.gitCompare"
                        [size]="15"
                        class="scoring-view__accent-icon"
                        aria-hidden="true"
                      />
                      <span class="tailor-changes__title"
                        >{{ t()('jobs.wizard.changes_title') }} ({{ allChanges().length }})</span
                      >
                      <span class="tailor-changes__toggle">
                        {{
                          changesOpen()
                            ? t()('jobs.wizard.hide_label')
                            : t()('jobs.wizard.show_label')
                        }}
                        <lucide-icon
                          [img]="changesOpen() ? icons.chevronUp : icons.chevronDown"
                          [size]="14"
                          aria-hidden="true"
                        />
                      </span>
                    </summary>
                    <div class="tailor-changes__list">
                      @for (ch of allChanges(); track ch) {
                        <div class="tailor-change-row">
                          <lucide-icon
                            [img]="changeType(ch) === 'added' ? icons.plus : icons.pencil"
                            [size]="13"
                            [class]="
                              'tailor-change-row__icon tailor-change-row__icon--' + changeType(ch)
                            "
                            aria-hidden="true"
                          />
                          <span>{{ ch }}</span>
                        </div>
                      }
                    </div>
                  </details>
                }

                <!-- Gaps -->
                @if (!tailoring() && allGaps().length) {
                  <div class="tailor-gaps">
                    <div class="tailor-gaps__head">
                      <lucide-icon [img]="icons.alertTriangle" [size]="14" aria-hidden="true" />
                      <span class="eyebrow">{{ t()('jobs.wizard.gaps_title') }}</span>
                    </div>
                    @for (g of allGaps(); track g) {
                      <div class="tailor-gap-row">
                        <lucide-icon [img]="icons.minus" [size]="13" aria-hidden="true" />
                        <span>{{ g }}</span>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Step 3: Updated score — auto-rescores the tailored resume -->
              <div wizardUpdateScoreStep class="wizard-step-content">
                <div class="apply-fields-header">
                  <span class="eyebrow">{{ t()('jobs.wizard.updated_score_eyebrow') }}</span>
                  <h4 class="apply-fields-title">{{ t()('jobs.wizard.updated_score_title') }}</h4>
                </div>

                @if (updatingScore()) {
                  <!-- Design-system skeleton card while the rescore runs -->
                  <div class="rescore-loading">
                    <div class="ai-thinking">
                      <span class="ai-thinking__dots"><span></span><span></span><span></span></span>
                      {{ t()('jobs.wizard.updating_score_hint') }}
                    </div>
                    <lib-skeleton-card [lines]="2" />
                    <lib-skeleton-card [media]="false" [lines]="3" [footer]="false" />
                  </div>
                } @else if (postTailorScore(); as post) {
                  <app-updated-score-view
                    [before]="cache()"
                    [after]="post"
                    [jobTitle]="job()?.title ?? ''"
                    [icons]="icons"
                  />
                } @else if (updateScoreError()) {
                  <div class="row">
                    <span class="status status--error">{{ updateScoreStatus() }}</span>
                    <button class="btn btn--secondary btn--md" (click)="updateScoreAfterTailor()">
                      <lucide-icon [img]="icons.another" [size]="15" aria-hidden="true" />
                      {{ t()('common.retry') }}
                    </button>
                  </div>
                } @else {
                  <p class="muted">{{ t()('jobs.wizard.updated_score_skip') }}</p>
                }
              </div>

              <div wizardDocumentsStep class="wizard-step-content">
                <div class="apply-fields-header">
                  <span class="eyebrow">{{ t()('jobs.wizard.review_documents_eyebrow') }}</span>
                  <h4 class="apply-fields-title">
                    {{ t()('jobs.wizard.review_documents_title') }}
                  </h4>
                  <p class="muted">{{ t()('jobs.wizard.review_documents_hint') }}</p>
                </div>

                <div class="document-targets">
                  <label>
                    {{ t()('documents.cv_field_region') }}
                    <select
                      [ngModel]="documentReviewRegion()"
                      (ngModelChange)="
                        documentReviewRegion.set($event); finalChecksOutdated.set(!!finalChecks())
                      "
                    >
                      @for (region of documentRegionTags; track region) {
                        <option [value]="region">{{ region.toUpperCase() }}</option>
                      }
                    </select>
                  </label>
                  <label>
                    {{ t()('documents.cv_field_language') }}
                    <select
                      [ngModel]="documentReviewLanguage()"
                      (ngModelChange)="
                        documentReviewLanguage.set($event); finalChecksOutdated.set(!!finalChecks())
                      "
                    >
                      @for (language of portalLanguages; track language) {
                        <option [value]="language">{{ language.toUpperCase() }}</option>
                      }
                    </select>
                  </label>
                </div>

                <div class="document-review-grid">
                  <article class="document-review-card">
                    <div class="document-review-card__head">
                      <span class="document-review-card__icon">
                        <lucide-icon [img]="icons.fileText" [size]="16" aria-hidden="true" />
                      </span>
                      <div>
                        <h5>{{ t()('documents.tab_cv') }}</h5>
                        <span class="badge" [class]="'badge--doc-' + cvReviewStatus()">
                          {{ t()(documentStatusKey(cvReviewStatus())) }}
                        </span>
                      </div>
                    </div>
                    @if (linkedCv(); as cv) {
                      <p class="document-review-card__label">
                        {{ cv.label || t()('documents.cv_untitled') }}
                      </p>
                      <p class="muted">{{ t()('jobs.wizard.document_linked_hint') }}</p>
                    } @else {
                      <p class="muted">{{ t()('jobs.wizard.document_cv_missing_hint') }}</p>
                    }
                    <div class="document-review-card__actions">
                      @if (linkedCv(); as cv) {
                        <button
                          class="btn btn--primary btn--sm"
                          type="button"
                          (click)="openCv(cv.id, true)"
                        >
                          {{ t()('jobs.wizard.document_review_cv') }}
                        </button>
                      } @else {
                        <button
                          class="btn btn--primary btn--sm"
                          type="button"
                          [disabled]="documentPreparing() === 'cv'"
                          (click)="createCvDraft(false)"
                        >
                          {{
                            documentPreparing() === 'cv'
                              ? t()('jobs.wizard.document_status_generating')
                              : t()('jobs.wizard.document_create_cv')
                          }}
                        </button>
                      }
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        [disabled]="documentPreparing() === 'cv' || !finalTailoredCvMd()"
                        (click)="createCvDraft(true)"
                      >
                        {{ t()('jobs.wizard.document_regenerate') }}
                      </button>
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        (click)="chooseCvOpen.set(!chooseCvOpen())"
                      >
                        {{ t()('jobs.wizard.document_choose_existing') }}
                      </button>
                      @if (linkedCv(); as cv) {
                        <button
                          class="btn btn--secondary btn--sm"
                          type="button"
                          (click)="openCv(cv.id, true)"
                        >
                          {{ t()('jobs.wizard.document_open_editor') }}
                        </button>
                      }
                    </div>
                    @if (chooseCvOpen()) {
                      <select
                        class="document-review-card__select"
                        [ngModel]="application()?.cvDocumentId ?? null"
                        (ngModelChange)="
                          chooseExistingDocument(
                            'cv',
                            $event === null || $event === '' ? null : +$event
                          )
                        "
                      >
                        <option [ngValue]="null">
                          {{ t()('jobs.wizard.document_choose_cv') }}
                        </option>
                        @for (cv of matchingCvs(); track cv.id) {
                          <option [value]="cv.id">
                            {{ cv.label || t()('documents.cv_untitled') }}
                          </option>
                        }
                      </select>
                    }
                  </article>

                  <article class="document-review-card">
                    <div class="document-review-card__head">
                      <span class="document-review-card__icon">
                        <lucide-icon [img]="icons.pencilLine" [size]="16" aria-hidden="true" />
                      </span>
                      <div>
                        <h5>{{ t()('documents.tab_cover_letter') }}</h5>
                        <span class="badge" [class]="'badge--doc-' + coverLetterReviewStatus()">
                          {{ t()(documentStatusKey(coverLetterReviewStatus())) }}
                        </span>
                      </div>
                    </div>
                    @if (linkedCoverLetter(); as letter) {
                      <p class="document-review-card__label">
                        {{ letter.label || t()('documents.cover_letter_untitled') }}
                      </p>
                      <p class="muted">{{ t()('jobs.wizard.document_linked_hint') }}</p>
                    } @else {
                      <p class="muted">
                        {{ t()('jobs.wizard.document_cover_letter_missing_hint') }}
                      </p>
                    }
                    <div class="document-review-card__actions">
                      @if (linkedCoverLetter(); as letter) {
                        <button
                          class="btn btn--primary btn--sm"
                          type="button"
                          (click)="openCoverLetter(letter.id, true)"
                        >
                          {{ t()('jobs.wizard.document_review_letter') }}
                        </button>
                      } @else {
                        <button
                          class="btn btn--primary btn--sm"
                          type="button"
                          [disabled]="documentPreparing() === 'cover_letter'"
                          (click)="createCoverLetterDraft(false)"
                        >
                          {{
                            documentPreparing() === 'cover_letter'
                              ? t()('jobs.wizard.document_status_generating')
                              : t()('jobs.wizard.document_create_cover_letter')
                          }}
                        </button>
                      }
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        [disabled]="documentPreparing() === 'cover_letter'"
                        (click)="createCoverLetterDraft(true)"
                      >
                        {{ t()('jobs.wizard.document_regenerate') }}
                      </button>
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        (click)="chooseCoverLetterOpen.set(!chooseCoverLetterOpen())"
                      >
                        {{ t()('jobs.wizard.document_choose_existing') }}
                      </button>
                      @if (linkedCoverLetter(); as letter) {
                        <button
                          class="btn btn--secondary btn--sm"
                          type="button"
                          (click)="openCoverLetter(letter.id, true)"
                        >
                          {{ t()('jobs.wizard.document_open_editor') }}
                        </button>
                      }
                    </div>
                    @if (chooseCoverLetterOpen()) {
                      <select
                        class="document-review-card__select"
                        [ngModel]="application()?.coverLetterDocumentId ?? null"
                        (ngModelChange)="
                          chooseExistingDocument(
                            'cover_letter',
                            $event === null || $event === '' ? null : +$event
                          )
                        "
                      >
                        <option [ngValue]="null">
                          {{ t()('jobs.wizard.document_choose_cover_letter') }}
                        </option>
                        @for (letter of coverLetters(); track letter.id) {
                          <option [value]="letter.id">
                            {{ letter.label || t()('documents.cover_letter_untitled') }}
                          </option>
                        }
                      </select>
                    }
                  </article>
                </div>

                @if (documentReviewStatus()) {
                  <p class="status" [class.status--error]="documentReviewError()">
                    {{ documentReviewStatus() }}
                  </p>
                }

                <section class="final-checks card">
                  <div class="final-checks__head">
                    <div>
                      <h5>{{ t()('jobs.wizard.final_checks_title') }}</h5>
                      @if (finalChecksOutdated()) {
                        <p class="status status--error">
                          {{ t()('jobs.wizard.final_checks_outdated') }}
                        </p>
                      }
                    </div>
                    <button
                      class="btn btn--secondary btn--sm"
                      type="button"
                      (click)="runFinalChecks()"
                    >
                      <lucide-icon [img]="icons.checklist" [size]="14" aria-hidden="true" />
                      {{ t()('jobs.wizard.final_checks_run') }}
                    </button>
                  </div>
                  <div class="final-checks__rows">
                    <div>
                      <span>{{ t()('jobs.wizard.final_checks_ats') }}</span>
                      <strong>{{
                        t()(
                          finalCheckStatusKey(
                            finalChecksOutdated() ? 'outdated' : finalChecks()?.ats || 'not_run'
                          )
                        )
                      }}</strong>
                    </div>
                    <div>
                      <span>{{ t()('jobs.wizard.final_checks_hr') }}</span>
                      <strong>{{
                        t()(
                          finalCheckStatusKey(
                            finalChecksOutdated() ? 'outdated' : finalChecks()?.hr || 'not_run'
                          )
                        )
                      }}</strong>
                    </div>
                    <div>
                      <span>{{ t()('jobs.wizard.final_checks_fit') }}</span>
                      <strong>{{
                        t()(
                          finalCheckStatusKey(
                            finalChecksOutdated() ? 'outdated' : finalChecks()?.fit || 'not_run'
                          )
                        )
                      }}</strong>
                    </div>
                  </div>
                  @if (finalChecks()?.notes?.length) {
                    <ul class="final-checks__notes">
                      @for (note of finalChecks()?.notes; track note) {
                        <li>{{ note }}</li>
                      }
                    </ul>
                  }
                  @if (finalChecks()?.fit === 'rescore' || finalChecksOutdated()) {
                    <button
                      class="btn btn--ghost btn--sm"
                      type="button"
                      (click)="updateScoreAfterTailor()"
                    >
                      {{ t()('jobs.wizard.final_checks_rescore_action') }}
                    </button>
                  }
                  @if (finalChecksNeedRetailor()) {
                    <div class="final-checks__retailor">
                      <p class="muted">{{ t()('jobs.wizard.final_checks_retailor_hint') }}</p>
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        [disabled]="tailoring()"
                        (click)="retailorFromFinalChecks()"
                      >
                        <lucide-icon [img]="icons.another" [size]="14" aria-hidden="true" />
                        {{
                          tailoring()
                            ? t()('jobs.wizard.phase_running')
                            : t()('jobs.wizard.final_checks_retailor_action')
                        }}
                      </button>
                    </div>
                  }
                </section>
              </div>

              <div wizardExportApplyStep class="wizard-step-content">
                <div class="apply-fields-header">
                  <span class="eyebrow">{{ t()('jobs.wizard.export_apply_eyebrow') }}</span>
                  <h4 class="apply-fields-title">{{ t()('jobs.wizard.export_title') }}</h4>
                </div>
                <!-- Export linked library documents. -->
                @if (!tailoring()) {
                  @if (!linkedCv()) {
                    <div class="alert alert--warn">
                      <lucide-icon [img]="icons.alertTriangle" [size]="15" aria-hidden="true" />
                      <span>{{ t()('jobs.wizard.export_missing_cv_warning') }}</span>
                    </div>
                  }
                  @if (!linkedCoverLetter()) {
                    <p class="muted">
                      {{ t()('jobs.wizard.export_missing_cover_letter_warning') }}
                    </p>
                  }
                  <div class="export-options">
                    <button
                      class="export-option export-option--primary"
                      type="button"
                      [disabled]="!!exporting() || !linkedCv()"
                      (click)="doExport('cv', 'docx')"
                    >
                      <span class="export-option__badge">{{ t()('jobs.export_recommended') }}</span>
                      <span class="export-option__icon export-option__icon--accent">
                        <lucide-icon [img]="icons.fileText" [size]="20" aria-hidden="true" />
                      </span>
                      <span class="export-option__title">{{
                        exporting() === 'cv-docx' ? t()('jobs.exporting') : t()('jobs.export_docx')
                      }}</span>
                      <span class="export-option__desc">{{ t()('jobs.export_docx_desc') }}</span>
                    </button>
                    <button
                      class="export-option"
                      type="button"
                      [disabled]="!!exporting() || !linkedCv()"
                      (click)="doExport('cv', 'pdf')"
                    >
                      <span class="export-option__icon">
                        <lucide-icon [img]="icons.fileDown" [size]="20" aria-hidden="true" />
                      </span>
                      <span class="export-option__title">{{
                        exporting() === 'cv-pdf' ? t()('jobs.exporting') : t()('jobs.export_pdf')
                      }}</span>
                      <span class="export-option__desc">{{ t()('jobs.export_pdf_desc') }}</span>
                    </button>
                    @if (linkedCoverLetter()) {
                      <button
                        class="export-option"
                        type="button"
                        [disabled]="!!exporting()"
                        (click)="doExport('cover_letter', 'docx')"
                      >
                        <span class="export-option__icon">
                          <lucide-icon [img]="icons.pencilLine" [size]="20" aria-hidden="true" />
                        </span>
                        <span class="export-option__title">{{
                          exporting() === 'cover_letter-docx'
                            ? t()('jobs.exporting')
                            : t()('jobs.wizard.export_cover_letter_docx')
                        }}</span>
                        <span class="export-option__desc">{{
                          t()('jobs.wizard.export_cover_letter_desc')
                        }}</span>
                      </button>
                    }
                  </div>
                  @if (exportStatus()) {
                    <p class="export-path" [class.status--error]="exportError()">
                      {{ exportStatus() }}
                    </p>
                  }
                  @if (lastExport(); as exp) {
                    <div class="export-actions">
                      <button
                        class="btn btn--secondary btn--sm"
                        (click)="openExportedFile(exp.filePath)"
                      >
                        {{ t()('jobs.open_file') }}
                      </button>
                      <button
                        class="btn btn--secondary btn--sm"
                        (click)="revealExportedFile(exp.filePath)"
                      >
                        {{ t()('jobs.show_folder') }}
                      </button>
                    </div>
                  }
                  <button class="btn btn--ghost btn--sm export-startover" (click)="resetWizard()">
                    {{ t()('jobs.start_over') }}
                  </button>
                }

                <div class="apply-fields-header apply-fields-header--sub">
                  <span class="eyebrow">{{ t()('jobs.wizard.apply_title') }}</span>
                  <p class="muted">{{ t()('jobs.wizard.apply_subtitle') }}</p>
                </div>
                @if (lastExport(); as exp) {
                  <div class="card apply-fields">
                    <div class="apply-field-row">
                      <span class="apply-field-row__label">{{ t()('jobs.export_section') }}</span>
                      <span class="apply-field-row__value">{{ exp.filePath }}</span>
                      <button
                        class="btn btn--secondary btn--sm"
                        type="button"
                        (click)="openExportedFile(exp.filePath)"
                      >
                        <lucide-icon [img]="icons.fileText" [size]="12" aria-hidden="true" />
                        {{ t()('jobs.open_file') }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <p class="muted">{{ t()('jobs.wizard.apply_no_export') }}</p>
                }
                @if (actionMsg()) {
                  <p class="muted">{{ actionMsg() }}</p>
                }
              </div>
            </app-apply-wizard>
          }
        </section>
      }

      @if (tailorCoverLetterOpen()) {
        <div
          class="modal-backdrop"
          (click)="tailorCoverLetterOpen.set(false)"
          (keydown.escape)="tailorCoverLetterOpen.set(false)"
          tabindex="-1"
          role="presentation"
        >
          <div
            class="modal"
            role="presentation"
            tabindex="-1"
            (click)="$event.stopPropagation()"
            (keydown)="$event.stopPropagation()"
          >
            <h3>{{ t()('documents.cover_letter_tailor_title') }}</h3>
            <p class="modal__hint">{{ t()('documents.cover_letter_tailor_hint') }}</p>

            <div class="cvform">
              <label
                style="grid-column: span 2; display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: var(--space-2);"
              >
                {{ t()('documents.cover_letter_tailor_select') }}
                <select
                  style="background: var(--surface-sunken); border: var(--border-width) solid var(--border-default); border-radius: var(--radius-input); color: var(--text-primary); padding: var(--space-2) var(--space-3);"
                  [ngModel]="selectedCoverLetterId()"
                  (ngModelChange)="
                    selectedCoverLetterId.set($event === null || $event === '' ? null : +$event)
                  "
                >
                  <option [ngValue]="null">
                    {{ t()('documents.cover_letter_tailor_none') }}
                  </option>
                  @for (c of coverLetters(); track c.id) {
                    <option [value]="c.id">
                      {{ c.label || t()('documents.cover_letter_untitled') }} ({{
                        c.language?.toUpperCase()
                      }})
                    </option>
                  }
                </select>
              </label>
              <label
                style="grid-column: span 2; display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: var(--space-2);"
              >
                {{ t()('documents.cv_field_language') }}
                <select
                  style="background: var(--surface-sunken); border: var(--border-width) solid var(--border-default); border-radius: var(--radius-input); color: var(--text-primary); padding: var(--space-2) var(--space-3);"
                  [ngModel]="tailorCoverLetterLanguage()"
                  (ngModelChange)="tailorCoverLetterLanguage.set($event)"
                >
                  @for (l of portalLanguages; track l) {
                    <option [value]="l">{{ l.toUpperCase() }}</option>
                  }
                </select>
              </label>
            </div>

            @if (tailorCoverLetterError()) {
              <p class="modal__error">{{ tailorCoverLetterError() }}</p>
            }
            <div class="modal__actions">
              <button
                class="btn btn--secondary btn--md"
                [disabled]="tailoringCoverLetter()"
                (click)="tailorCoverLetterOpen.set(false)"
              >
                {{ t()('actions.cancel') }}
              </button>
              <button
                class="btn btn--primary btn--md"
                [disabled]="tailoringCoverLetter()"
                (click)="startTailoringCoverLetter()"
              >
                {{
                  tailoringCoverLetter()
                    ? t()('documents.cover_letter_tailor_busy')
                    : t()('documents.cover_letter_tailor_confirm_btn')
                }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .detail-actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-bottom: var(--space-5);
      }
      .detail-actions__row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-3);
      }
      .detail-actions__doc {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 0 var(--space-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        background: var(--surface-1);
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        cursor: pointer;
      }
      .detail-actions__doc:hover {
        border-color: var(--accent);
        color: var(--text-primary);
      }
      .detail-actions__msg {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        margin: 0;
      }
      .detail-actions__spacer {
        flex: 1 1 auto;
      }
      .locked-hint {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        margin: 0;
      }
      /* Alert (danger) — matches the Applye Design System Alert component:
         tinted surface, hairline tone border, mono title + sans body. */
      .alert {
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 13px 14px;
        border-radius: var(--radius-card);
        margin-bottom: var(--space-5);
      }
      .alert--danger {
        background: var(--danger-tint);
        border: 1px solid color-mix(in srgb, var(--danger) 34%, transparent);
      }
      .alert--danger .alert__icon {
        color: var(--danger);
      }
      .alert__icon {
        flex: 0 0 auto;
        margin-top: 1px;
      }
      .alert__body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .alert__title {
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
        margin: 0;
      }
      .alert__text {
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0;
        line-height: 1.6;
      }
      .alert__actions {
        display: flex;
        gap: var(--space-3);
        margin-top: var(--space-4);
      }
      /* Rescore loading — AI-thinking line + design-system skeleton cards. */
      .rescore-loading {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-4) 0;
      }
      .apply-success {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-3);
        text-align: center;
        padding: var(--space-9) var(--space-6);
      }
      .apply-success__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--success-tint);
        color: var(--success);
        margin-bottom: var(--space-2);
      }
      .apply-success__title {
        font-family: var(--font-mono);
        font-size: var(--text-h2);
        color: var(--text-primary);
        margin: 0;
      }
      .apply-success__msg {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0;
        max-width: 420px;
      }
      .jobs {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        max-width: 880px;
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
        margin: 0;
      }

      .editor {
        width: 100%;
        min-height: 200px;
        padding: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        line-height: 1.6;
        color: var(--text-primary);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        resize: vertical;
      }
      .editor--locked,
      .editor:disabled {
        color: var(--text-disabled);
        cursor: not-allowed;
        resize: none;
      }
      .editor:focus {
        outline: none;
        border-color: var(--accent);
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .row--mt {
        margin-top: var(--space-2);
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        background: var(--surface-1);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-card);
        padding: var(--space-4);
      }
      .card--danger {
        border-color: var(--danger);
      }
      .card__title {
        font-weight: var(--weight-medium);
        color: var(--danger);
        margin: 0;
        font-size: var(--text-sm);
      }

      .job-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .job-meta__info {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .job-meta__company {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        font-family: var(--font-mono);
      }
      .job-meta__title {
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .job-meta__hash {
        font-size: var(--text-2xs);
        font-family: var(--font-mono);
        color: var(--text-quaternary, var(--text-tertiary));
      }
      .job-meta__badges {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-shrink: 0;
      }

      /* Red flags */
      .red-flags {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .red-flag {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .red-flag::before {
        content: '•';
        color: var(--danger);
        flex-shrink: 0;
      }

      .legitimacy-notes {
        margin: var(--space-2) 0 0;
        padding-left: var(--space-4);
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }
      .legitimacy-notes li {
        margin-bottom: var(--space-1);
      }

      /* CTA / wizard entry */
      /* Tailor CV — phase cards */
      .tailor-phases {
        display: flex;
        gap: var(--space-4);
      }
      .tailor-phase {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--surface-1);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-sm);
      }
      .tailor-phase--done {
        border-color: color-mix(in srgb, var(--success) 35%, var(--border-subtle));
      }
      .tailor-phase--running,
      .tailor-phase--ready {
        border-color: var(--accent);
      }
      .tailor-phase--pending {
        opacity: 0.6;
      }
      .tailor-phase__head {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .tailor-phase__icon {
        width: 22px;
        height: 22px;
        border-radius: var(--radius-badge);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-sunken);
        color: var(--text-tertiary);
      }
      .tailor-phase--done .tailor-phase__icon {
        background: var(--success-tint);
        color: var(--success);
      }
      .tailor-phase--running .tailor-phase__icon,
      .tailor-phase--ready .tailor-phase__icon {
        background: var(--accent-tint);
        color: var(--text-accent);
      }
      .tailor-phase__name {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .tailor-phase__status {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wide);
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .tailor-phase--done .tailor-phase__status {
        color: var(--success);
      }
      .tailor-phase--running .tailor-phase__status,
      .tailor-phase--ready .tailor-phase__status {
        color: var(--text-accent);
      }

      .base-cv-picker {
        display: grid;
        grid-template-columns: auto minmax(160px, 1fr) minmax(260px, 420px);
        align-items: center;
        gap: var(--space-4);
        margin: var(--space-5) 0 var(--space-4);
        padding: var(--space-4);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-card);
        background: var(--surface-1);
        box-shadow: var(--shadow-sm);
      }
      .base-cv-picker__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--radius-input);
        background: var(--accent-tint);
        color: var(--text-accent);
      }
      .base-cv-picker__body {
        min-width: 0;
      }
      .base-cv-picker__label {
        display: block;
        margin-bottom: 2px;
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .base-cv-picker__hint {
        margin: 0;
        color: var(--text-tertiary);
        font-size: var(--text-xs);
        line-height: var(--leading-snug);
      }
      .base-cv-picker__control {
        position: relative;
        min-width: 0;
      }
      .base-cv-picker__control select {
        width: 100%;
        height: 40px;
        padding: 0 calc(var(--space-8) + var(--space-2)) 0 var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);
        background: var(--surface-sunken);
        color: var(--text-primary);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        outline: none;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        box-shadow: inset 0 0 0 1px transparent;
        transition:
          border-color var(--dur-fast) var(--ease-standard),
          box-shadow var(--dur-fast) var(--ease-standard),
          background var(--dur-fast) var(--ease-standard);
      }
      .base-cv-picker__control select:hover {
        border-color: color-mix(in srgb, var(--accent) 55%, var(--border-default));
        background: var(--surface-hover);
      }
      .base-cv-picker__control select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
      }
      .base-cv-picker__chevron {
        position: absolute;
        right: var(--space-3);
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-tertiary);
        pointer-events: none;
      }

      /* Tailor CV — changes diff */
      .tailor-changes {
        padding: 0;
        gap: 0;
      }
      .tailor-changes__summary {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4);
        cursor: pointer;
        user-select: none;
      }
      .tailor-changes__title {
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .tailor-changes__toggle {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
      }
      .tailor-changes__list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: 0 var(--space-4) var(--space-4);
      }
      .tailor-change-row {
        display: flex;
        gap: var(--space-3);
        align-items: flex-start;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-input);
        background: var(--accent-tint);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        line-height: 1.5;
        color: var(--text-secondary);
      }
      .tailor-change-row__icon {
        margin-top: 2px;
        flex: 0 0 auto;
      }
      .tailor-change-row__icon--added {
        color: var(--success);
      }
      .tailor-change-row__icon--reworded {
        color: var(--text-accent);
      }

      /* Tailor CV — gaps */
      .tailor-gaps {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--warning-tint);
        border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
        border-radius: var(--radius-card);
      }
      .tailor-gaps__head {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        color: var(--warning);
      }
      .tailor-gap-row {
        display: flex;
        gap: var(--space-3);
        align-items: flex-start;
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        line-height: 1.5;
        color: var(--text-primary);
      }
      .tailor-gap-row lucide-icon {
        color: var(--warning);
        margin-top: 2px;
        flex: 0 0 auto;
      }

      /* Export */
      .export-path {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        word-break: break-all;
        margin: 0;
      }
      .export-actions {
        display: flex;
        gap: var(--space-3);
      }
      .export-options {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-5);
      }
      .export-option {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-6);
        text-align: left;
        background: var(--surface-1);
        border: 1.5px solid var(--border-subtle);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-sm);
        cursor: pointer;
      }
      .export-option:hover:not(:disabled) {
        border-color: var(--border-strong);
      }
      .export-option:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .export-option--primary {
        border-color: var(--accent);
        box-shadow:
          0 0 0 1px var(--accent),
          var(--shadow-md);
      }
      .export-option__badge {
        position: absolute;
        top: var(--space-4);
        right: var(--space-4);
        display: inline-flex;
        align-items: center;
        height: 20px;
        padding: 0 var(--space-3);
        border-radius: var(--radius-badge);
        background: var(--success-tint);
        color: var(--success);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        letter-spacing: var(--tracking-wide);
        text-transform: uppercase;
      }
      .export-option__icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-input);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-sunken);
        color: var(--text-secondary);
      }
      .export-option__icon--accent {
        background: var(--accent-tint);
        color: var(--text-accent);
      }
      .export-option__title {
        font-family: var(--font-mono);
        font-size: var(--text-title);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .export-option__desc {
        font-family: var(--font-sans);
        font-size: var(--text-xs);
        line-height: 1.55;
        color: var(--text-secondary);
      }
      .export-startover {
        align-self: center;
        color: var(--text-tertiary);
      }

      /* Shared */
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

      .wizard-step-content {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }
      .apply-fields-header {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .apply-fields-header--sub {
        padding-top: var(--space-5);
        border-top: 1px solid var(--border-subtle);
      }
      .apply-fields-title {
        margin: 0;
        font-family: var(--font-mono);
        font-size: var(--text-h2);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .apply-fields {
        padding: 0;
        gap: 0;
      }
      .apply-field-row {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-4);
        border-bottom: 1px solid var(--border-subtle);
      }
      .apply-field-row:last-child {
        border-bottom: none;
      }
      .apply-field-row__label {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wide);
        text-transform: uppercase;
        color: var(--text-tertiary);
        width: 96px;
        flex: 0 0 auto;
      }
      .apply-field-row__value {
        font-size: var(--text-sm);
        color: var(--text-primary);
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .document-targets {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-5);
      }
      .document-targets label {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wide);
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .document-targets select,
      .document-review-card__select {
        background: var(--surface-sunken);
        border: var(--border-width) solid var(--border-default);
        border-radius: var(--radius-input);
        color: var(--text-primary);
        font-size: var(--text-sm);
        padding: var(--space-2) var(--space-3);
        outline: none;
      }
      .document-review-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
      }
      .document-review-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-5);
        border: var(--border-width) solid var(--border-subtle);
        border-radius: var(--radius-card);
        background: var(--surface-1);
      }
      .document-review-card__head {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
      }
      .document-review-card__head h5,
      .final-checks h5 {
        margin: 0 0 var(--space-2);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        color: var(--text-primary);
      }
      .document-review-card__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: var(--radius-input);
        background: var(--surface-sunken);
        color: var(--accent);
      }
      .document-review-card__label {
        margin: 0;
        color: var(--text-primary);
        font-weight: var(--weight-medium);
      }
      .document-review-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .document-review-card__select {
        width: 100%;
      }
      .badge--doc-missing {
        color: var(--warning);
        border-color: color-mix(in srgb, var(--warning) 40%, transparent);
      }
      .badge--doc-generating {
        color: var(--accent);
        border-color: color-mix(in srgb, var(--accent) 40%, transparent);
      }
      .badge--doc-ready {
        color: var(--success);
        border-color: color-mix(in srgb, var(--success) 40%, transparent);
      }
      .badge--doc-needs_review {
        color: var(--warning);
        border-color: color-mix(in srgb, var(--warning) 40%, transparent);
      }
      .final-checks {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        margin-top: var(--space-5);
        padding: var(--space-5);
      }
      .final-checks__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-4);
      }
      .final-checks__rows {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-3);
      }
      .final-checks__rows div {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        padding: var(--space-3);
        border-radius: var(--radius-input);
        background: var(--surface-sunken);
      }
      .final-checks__rows span {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
      }
      .final-checks__rows strong {
        color: var(--text-primary);
        font-size: var(--text-sm);
      }
      .final-checks__notes {
        margin: 0;
        padding-left: var(--space-5);
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }
      .final-checks__retailor {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3);
        border: var(--border-width) solid var(--border-default);
        border-radius: var(--radius-input);
        background: var(--surface-sunken);
      }
      .final-checks__retailor p {
        margin: 0;
      }
      .alert--warn {
        color: var(--warning);
        border-color: color-mix(in srgb, var(--warning) 35%, transparent);
        background: var(--warning-tint);
      }
      @media (max-width: 760px) {
        .base-cv-picker {
          grid-template-columns: auto minmax(0, 1fr);
        }
        .base-cv-picker__control {
          grid-column: 1 / -1;
        }
        .document-targets,
        .document-review-grid,
        .final-checks__rows {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class JobsComponent implements OnInit, OnDestroy {
  private readonly db = inject(DbService);
  private readonly jobsStore = inject(JobsStore);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(PageTitleService);
  private readonly document = inject(DOCUMENT);
  protected readonly t = this.i18n.t;

  protected readonly icons: JobDetailIcons & {
    empty: typeof Search;
    copy: typeof Copy;
    add: typeof Plus;
    remove: typeof X;
    another: typeof RotateCw;
    trash: typeof Trash2;
    dangerGlyph: typeof CircleX;
  } = {
    empty: Search,
    atsPass: Check,
    atsFail: X,
    tag: Tag,
    flag: Flag,
    scan: ScanLine,
    checklist: ListChecks,
    next: ArrowRight,
    star: Star,
    db: Database,
    bookmark: Bookmark,
    wand: WandSparkles,
    back: ArrowLeft,
    checkCircle: CheckCircle2,
    languages: Languages,
    chevronDown: ChevronDown,
    chevronUp: ChevronUp,
    shieldCheck: ShieldCheck,
    sparkles: Sparkles,
    gitCompare: GitCompare,
    alertTriangle: AlertTriangle,
    minus: Minus,
    plus: Plus,
    pencil: Pencil,
    hammer: Hammer,
    scanSearch: ScanSearch,
    pencilLine: PencilLine,
    fileText: FileText,
    fileDown: FileDown,
    externalLink: ExternalLink,
    copy: Copy,
    check: Check,
    add: Plus,
    remove: X,
    another: RotateCw,
    trash: Trash2,
    dangerGlyph: CircleX,
  };

  protected readonly portalLanguages: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];
  private static readonly DEFAULT_PORTAL_QUESTIONS = [
    'Why this role?',
    'Why this company?',
    'Tell us about a relevant project',
    'What excites you about this?',
  ];

  readonly jdText = signal('');
  readonly job = signal<Job | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly settings = signal<Settings | null>(null);
  readonly cache = signal<ScoringCache | null>(null);
  readonly fromCache = signal(false);
  readonly wizardOpen = signal(false);
  readonly wizardInitialStep = signal(0);
  readonly archetypeMatch = signal<boolean | null>(null);

  // Job Detail: the application row (if this job is on the board) + action state.
  readonly application = signal<Application | null>(null);
  readonly actionBusy = signal(false);
  readonly actionMsg = signal('');
  readonly deleteConfirmOpen = signal(false);
  readonly deleting = signal(false);

  /** "Change" doesn't write anything — it just lifts the lock so the
   * description is editable and Mark-as-Applied reappears, letting the user
   * redo the status/description from scratch. Nothing is saved unless the
   * user then takes an explicit action (Parse & filter, Mark as Applied).
   * "Cancel" drops this override and discards any in-progress edit. */
  readonly editingLocked = signal(false);

  /** True with no application yet, one still in 'saved', or the user
   * overrode the lock via "Change". Anything else (applied/interview/
   * offer/rejected/cancelled) shows a status badge + Change instead of an
   * actionable Mark-as-Applied button. */
  readonly canMarkApplied = computed(() => {
    const status = this.application()?.status;
    return !status || status === 'saved' || this.editingLocked();
  });

  /** Locked exactly when Mark-as-Applied isn't available. */
  readonly jobLocked = computed(() => !this.canMarkApplied());

  protected readonly statusBadgeClass = applicationStatusBadgeClass;

  // Draft portal answers
  readonly portalQuestions = signal<string[]>([...JobsComponent.DEFAULT_PORTAL_QUESTIONS]);
  readonly portalLanguage = signal<SupportedLanguage>('en');
  readonly portalAnswers = signal<{ question: string; answer: string }[]>([]);
  readonly portalDrafting = signal(false);
  readonly portalRedrafting = signal<number | null>(null);
  readonly portalFromCache = signal(false);
  readonly portalStatus = signal('');
  readonly portalError = signal(false);
  readonly portalCopiedIndex = signal<number | null>(null);

  // Tailoring wizard
  readonly tailorResults = signal<PassResult[]>([]);
  readonly tailoring = signal(false);
  readonly tailorStatus = signal('');
  readonly tailorError = signal(false);

  // Post-tailor rescore (before/after). The before/after pair is transient
  // (in-memory), but the *after* score is persisted to My Jobs once the user
  // reaches the export step — see savePostTailorScore.
  readonly postTailorScore = signal<ScoringCache | null>(null);
  readonly updatingScore = signal(false);
  readonly updateScoreStatus = signal('');
  readonly updateScoreError = signal(false);
  private readonly postTailorSaved = signal(false);
  /** Non-null while the post-apply/update success card is shown before the
   * redirect fires. */
  readonly applyResult = signal<'updated' | null>(null);

  /** True once all 3 tailoring passes are done (in this session or restored
   * from cache) — drives the immutable Tailored badge and the Retailor CTA. */
  readonly isTailored = computed(() => this.tailorResults().length === 3);

  /** Flattened change / gap notes across all completed tailoring passes. */
  readonly allChanges = computed(() => this.tailorResults().flatMap((r) => r.changes));
  readonly allGaps = computed(() => this.tailorResults().flatMap((r) => r.gaps));
  readonly changesOpen = signal(true);
  protected readonly changeType = classifyChangeType;

  // Cover Letter tailoring (Phase 1c)
  readonly coverLetters = signal<DocumentLibraryItem[]>([]);
  readonly matchingCvs = signal<DocumentLibraryItem[]>([]);
  readonly selectedBaseCvId = signal<number | null>(null);
  readonly selectedCoverLetterId = signal<number | null>(null);
  readonly tailorCoverLetterLanguage = signal<SupportedLanguage>('en');
  readonly tailorCoverLetterOpen = signal(false);
  readonly tailoringCoverLetter = signal(false);
  readonly tailorCoverLetterError = signal('');

  readonly documentRegionTags: DocumentRegionTag[] = ['de', 'us', 'uk', 'generic'];
  readonly documentReviewRegion = signal<DocumentRegionTag>('generic');
  readonly documentReviewLanguage = signal<SupportedLanguage>('en');
  readonly linkedCv = signal<DocumentLibraryItem | null>(null);
  readonly linkedCoverLetter = signal<DocumentLibraryItem | null>(null);
  readonly documentPreparing = signal<ReviewDocumentKind | null>(null);
  readonly documentReviewStatus = signal('');
  readonly documentReviewError = signal(false);
  readonly chooseCvOpen = signal(false);
  readonly chooseCoverLetterOpen = signal(false);
  readonly finalChecks = signal<FinalChecks | null>(null);
  readonly finalChecksOutdated = signal(false);

  readonly cvReviewStatus = computed<ReviewDocumentStatus>(() =>
    this.documentCardStatus('cv', this.linkedCv()),
  );
  readonly coverLetterReviewStatus = computed<ReviewDocumentStatus>(() =>
    this.documentCardStatus('cover_letter', this.linkedCoverLetter()),
  );

  async openCv(id: number, returnToWizard = false): Promise<void> {
    if (!returnToWizard) {
      await this.router.navigate(['/documents/cv', id]);
      return;
    }
    await this.openDocumentEditorWithReturn('cv', id);
  }

  async openCoverLetter(id: number, returnToWizard = false): Promise<void> {
    if (!returnToWizard) {
      await this.router.navigate(['/documents/cover-letter', id]);
      return;
    }
    await this.openDocumentEditorWithReturn('cover_letter', id);
  }

  private async openDocumentEditorWithReturn(kind: ReviewDocumentKind, id: number): Promise<void> {
    const job = this.job();
    if (!job?.id) return;
    const reviewHash = await this.currentDocumentsHash();
    this.storeFinalChecksForReturn(reviewHash);
    const path = kind === 'cv' ? ['/documents/cv', id] : ['/documents/cover-letter', id];
    await this.router.navigate(path, {
      queryParams: {
        returnTo: 'applyWizard',
        jobId: job.id,
        documentType: kind,
        documentId: id,
        reviewHash,
      },
    });
  }

  private storeFinalChecksForReturn(reviewHash: string): void {
    const checks = this.finalChecks();
    const storage = this.document.defaultView?.sessionStorage;
    if (!checks || !storage) return;
    storage.setItem(`applye:wizardFinalChecks:${reviewHash}`, JSON.stringify(checks));
  }

  private restoreFinalChecksAfterReturn(reviewHash: string): FinalChecks | null {
    const storage = this.document.defaultView?.sessionStorage;
    const raw = storage?.getItem(`applye:wizardFinalChecks:${reviewHash}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as FinalChecks;
    } catch {
      return null;
    }
  }

  private inferDocumentRegion(job: Job | null): DocumentRegionTag {
    return job?.language === 'de' ? 'de' : 'generic';
  }

  private normalizeSupportedLanguage(value: string | null | undefined): SupportedLanguage {
    return this.portalLanguages.includes(value as SupportedLanguage)
      ? (value as SupportedLanguage)
      : 'en';
  }

  private documentCardStatus(
    kind: ReviewDocumentKind,
    item: DocumentLibraryItem | null,
  ): ReviewDocumentStatus {
    if (this.documentPreparing() === kind) return 'generating';
    if (!item) return 'missing';
    if (this.finalChecks()?.inputHash && !this.finalChecksOutdated()) return 'ready';
    if (this.finalChecksOutdated()) return 'needs_review';
    return 'linked';
  }

  documentStatusKey(status: ReviewDocumentStatus): string {
    return `jobs.wizard.document_status_${status}`;
  }

  finalCheckStatusKey(status: FinalCheckStatus): string {
    return `jobs.wizard.final_check_${status}`;
  }

  async ensureApplicationDraft(): Promise<Application> {
    const existing = this.application();
    if (existing) return existing;

    const job = this.job();
    if (!job?.id) throw new Error(this.t()('jobs.not_found_label'));

    const created = await this.db.upsertApplication({
      jobId: job.id,
      status: 'saved',
      docLanguage: this.documentReviewLanguage(),
      sourceUrl: job.source,
    });
    this.application.set(created);
    this.jobsStore.patchOverviewRow(job.id, { status: 'saved' });
    return created;
  }

  private async loadLinkedDocuments(): Promise<void> {
    const app = this.application();
    const [cv, letter] = await Promise.all([
      app?.cvDocumentId ? this.db.documentLibraryGet(app.cvDocumentId) : Promise.resolve(null),
      app?.coverLetterDocumentId
        ? this.db.documentLibraryGet(app.coverLetterDocumentId)
        : Promise.resolve(null),
    ]);
    this.linkedCv.set(cv);
    this.linkedCoverLetter.set(letter);
    await this.refreshFinalChecksFreshness();
  }

  async prepareDocumentsStep(): Promise<void> {
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const [cvs, letters] = await Promise.all([
        this.db.documentLibraryList('cv'),
        this.db.documentLibraryList('cover_letter'),
      ]);
      this.matchingCvs.set(cvs);
      this.coverLetters.set(letters);
      await this.ensureApplicationDraft();
      await this.loadLinkedDocuments();
      if (!this.linkedCv() && this.tailorResults().find((r) => r.pass === 3)) {
        await this.createCvDraft(false);
      }
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
    }
  }

  protected finalTailoredCvMd(): string {
    return this.tailorResults().find((r) => r.pass === 3)?.resultMd ?? '';
  }

  private profileDisplayName(): string {
    const md = this.profile()?.fullMd ?? '';
    const heading = md
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('# '));
    return heading?.replace(/^#\s+/, '').trim() ?? '';
  }

  async createCvDraft(regenerate: boolean): Promise<void> {
    if (this.documentPreparing()) return;
    const job = this.job();
    const tailoredMd = this.finalTailoredCvMd();
    if (!job?.id || !tailoredMd) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_cv_requires_tailoring'));
      return;
    }

    this.documentPreparing.set('cv');
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const app = await this.ensureApplicationDraft();
      const inputHash = await this.db.hashText(
        [job.id, tailoredMd, this.documentReviewLanguage(), this.documentReviewRegion()].join(
          '\x00',
        ),
      );
      const content = markdownToCvContentFallback(tailoredMd, this.profileDisplayName());
      const doc = await this.db.documentLibraryUpsert({
        id: regenerate ? app.cvDocumentId : undefined,
        docType: 'cv',
        source: 'generated',
        label: `${job.company || 'Job'} — Tailored CV`,
        language: this.documentReviewLanguage(),
        regionTag: this.documentReviewRegion(),
        contentJson: JSON.stringify(content),
        inputHash,
      });
      const updated = await this.db.upsertApplication({
        ...app,
        cvDocumentId: doc.id,
        docLanguage: this.documentReviewLanguage(),
      });
      this.application.set(updated);
      this.linkedCv.set(doc);
      this.finalChecksOutdated.set(!!this.finalChecks());
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_cv_linked'));
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
    } finally {
      this.documentPreparing.set(null);
    }
  }

  async createCoverLetterDraft(regenerate: boolean): Promise<void> {
    if (this.documentPreparing()) return;
    const job = this.job();
    const profile = this.profile();
    const settings = this.settings();
    if (!job?.id || !profile?.fullMd || !settings) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(this.t()('documents.cv_generate_no_profile'));
      return;
    }

    this.documentPreparing.set('cover_letter');
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const app = await this.ensureApplicationDraft();
      const language = this.documentReviewLanguage();
      const rendered = await this.ai.renderSkill('cover-letter-generate', {
        profile_md: profile.fullMd,
        job_description: job.jdText ?? '',
        language,
        section: 'all',
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      const parsed = JSON.parse(cleanJsonText(res.text)) as CoverLetterContent;
      const content: CoverLetterContent = {
        ...parsed,
        bodyParagraphs: parsed.bodyParagraphs ?? [],
        jobDescription: job.jdText ?? '',
      };
      const inputHash = await this.db.hashText(
        [job.id, profile.fullMd, job.jdText ?? '', language, this.documentReviewRegion()].join(
          '\x00',
        ),
      );
      const doc = await this.db.documentLibraryUpsert({
        id: regenerate ? app.coverLetterDocumentId : undefined,
        docType: 'cover_letter',
        source: 'generated',
        label: `${job.company || 'Job'} — Cover Letter`,
        language,
        regionTag: this.documentReviewRegion(),
        contentJson: JSON.stringify(content),
        inputHash,
        modelUsed: settings.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      const updated = await this.db.upsertApplication({
        ...app,
        coverLetterDocumentId: doc.id,
        docLanguage: language,
      });
      this.application.set(updated);
      this.linkedCoverLetter.set(doc);
      this.finalChecksOutdated.set(!!this.finalChecks());
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_cover_letter_linked'));
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
    } finally {
      this.documentPreparing.set(null);
    }
  }

  async chooseExistingDocument(kind: ReviewDocumentKind, id: number | null): Promise<void> {
    if (!id) return;
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    try {
      const app = await this.ensureApplicationDraft();
      const item = await this.db.documentLibraryGet(id);
      if (!item) return;
      const updated = await this.db.upsertApplication({
        ...app,
        cvDocumentId: kind === 'cv' ? id : app.cvDocumentId,
        coverLetterDocumentId: kind === 'cover_letter' ? id : app.coverLetterDocumentId,
        docLanguage: item.language ?? this.documentReviewLanguage(),
      });
      this.application.set(updated);
      if (kind === 'cv') {
        this.linkedCv.set(item);
        this.chooseCvOpen.set(false);
      } else {
        this.linkedCoverLetter.set(item);
        this.chooseCoverLetterOpen.set(false);
      }
      this.finalChecksOutdated.set(!!this.finalChecks());
    } catch (e) {
      this.documentReviewError.set(true);
      this.documentReviewStatus.set(String(e));
    }
  }

  async runFinalChecks(): Promise<void> {
    const hash = await this.currentDocumentsHash();
    const cvText = this.documentText(this.linkedCv());
    const letterText = this.documentText(this.linkedCoverLetter());
    const jobText = this.jdText().toLowerCase();
    const keywords = Array.from(new Set(jobText.match(/[a-zäöüß]{5,}/gi) ?? [])).slice(0, 24);
    const overlap = keywords.filter((word) =>
      cvText.toLowerCase().includes(word.toLowerCase()),
    ).length;
    const cvReasonable = cvText.trim().length >= 900;
    const hasSettings = !!this.documentReviewLanguage() && !!this.documentReviewRegion();
    const notes: string[] = [];

    if (!this.linkedCv()) notes.push(this.t()('jobs.wizard.final_note_missing_cv'));
    if (!this.linkedCoverLetter())
      notes.push(this.t()('jobs.wizard.final_note_missing_cover_letter'));
    if (this.linkedCv() && !cvReasonable) notes.push(this.t()('jobs.wizard.final_note_short_cv'));
    if (keywords.length && overlap < Math.min(4, keywords.length)) {
      notes.push(this.t()('jobs.wizard.final_note_keyword_overlap'));
    }
    if (!hasSettings) notes.push(this.t()('jobs.wizard.final_note_market_language'));
    if (letterText && letterText.length < 500) {
      notes.push(this.t()('jobs.wizard.final_note_short_cover_letter'));
    }

    this.finalChecks.set({
      inputHash: hash,
      ats: this.linkedCv() && cvReasonable && hasSettings ? 'pass' : 'needs_review',
      hr: notes.length <= 1 ? 'strong' : 'needs_edits',
      fit: this.finalChecksOutdated() ? 'rescore' : 'valid',
      notes,
    });
    this.finalChecksOutdated.set(false);
  }

  finalChecksNeedRetailor(): boolean {
    const checks = this.finalChecks();
    if (!checks || this.finalChecksOutdated()) return false;
    return !!this.linkedCv() && (checks.ats === 'needs_review' || checks.fit === 'rescore');
  }

  async retailorFromFinalChecks(): Promise<void> {
    if (this.tailoring()) return;
    this.documentReviewStatus.set('');
    this.documentReviewError.set(false);
    this.wizardInitialStep.set(1);
    await this.startTailoring();
    if (this.tailorError()) return;
    if (!this.postTailorScore() && !this.updatingScore()) {
      await this.updateScoreAfterTailor();
    }
    if (this.linkedCv()) {
      await this.createCvDraft(true);
    }
    this.finalChecks.set(null);
    this.finalChecksOutdated.set(true);
    this.wizardInitialStep.set(2);
  }

  private documentText(item: DocumentLibraryItem | null): string {
    if (!item?.contentJson) return '';
    try {
      if (item.docType === 'cv') return cvContentToMd(JSON.parse(item.contentJson) as CvContent);
      const content = JSON.parse(item.contentJson) as CoverLetterContent;
      return [
        content.subject,
        content.greeting,
        ...(content.bodyParagraphs ?? []),
        content.closing,
        content.signature,
      ]
        .filter(Boolean)
        .join('\n\n');
    } catch {
      return item.contentJson;
    }
  }

  private currentDocumentsHash(): Promise<string> {
    const cv = this.linkedCv();
    const coverLetter = this.linkedCoverLetter();
    return this.db.hashText(
      JSON.stringify({
        cv: cv
          ? {
              label: cv.label ?? '',
              contentJson: cv.contentJson ?? '',
              language: cv.language ?? '',
              regionTag: cv.regionTag ?? '',
            }
          : null,
        coverLetter: coverLetter
          ? {
              label: coverLetter.label ?? '',
              contentJson: coverLetter.contentJson ?? '',
              language: coverLetter.language ?? '',
              regionTag: coverLetter.regionTag ?? '',
            }
          : null,
        language: this.documentReviewLanguage(),
        region: this.documentReviewRegion(),
      }),
    );
  }

  private async refreshFinalChecksFreshness(): Promise<void> {
    const checks = this.finalChecks();
    if (!checks) {
      this.finalChecksOutdated.set(false);
      return;
    }
    this.finalChecksOutdated.set((await this.currentDocumentsHash()) !== checks.inputHash);
  }

  async openTailorCoverLetterModal(): Promise<void> {
    this.tailorCoverLetterError.set('');
    this.selectedCoverLetterId.set(null);
    this.tailoringCoverLetter.set(false);
    this.tailorCoverLetterOpen.set(true);

    try {
      const letters = await this.db.documentLibraryList('cover_letter');
      this.coverLetters.set(letters);
      const settings = this.settings();
      this.tailorCoverLetterLanguage.set(settings?.defaultDocLanguage ?? 'en');
      const defaultDoc =
        letters.find((c) => c.isDefault && c.language === this.tailorCoverLetterLanguage()) ??
        letters.find((c) => c.language === this.tailorCoverLetterLanguage()) ??
        letters[0] ??
        null;
      if (defaultDoc) {
        this.selectedCoverLetterId.set(defaultDoc.id);
      }
    } catch {
      // Non-fatal
    }
  }

  async startTailoringCoverLetter(): Promise<void> {
    if (this.tailoringCoverLetter()) return;
    this.tailoringCoverLetter.set(true);
    this.tailorCoverLetterError.set('');

    try {
      const job = this.job();
      const profile = this.profile();
      const settings = this.settings();
      if (!job || !job.id) throw new Error('No active job selected.');
      if (!profile?.fullMd) throw new Error(this.t()('documents.cv_generate_no_profile'));

      const lang = this.tailorCoverLetterLanguage();
      const jd = job.jdText ?? '';

      let baseParagraphs: string[] = [];
      let baseAddress: CoverLetterAddress = {};
      let baseSubject = '';
      let baseGreeting = '';
      let baseClosing = '';
      let baseSignature = '';
      let baseRegionTag = 'generic';

      const selectedId = this.selectedCoverLetterId();
      if (selectedId) {
        const baseDoc = this.coverLetters().find((c) => c.id === selectedId);
        if (baseDoc && baseDoc.contentJson) {
          const content = JSON.parse(baseDoc.contentJson) as CoverLetterContent;
          baseParagraphs = content.bodyParagraphs || [];
          baseAddress = content.address || {};
          baseSubject = content.subject || '';
          baseGreeting = content.greeting || '';
          baseClosing = content.closing || '';
          baseSignature = content.signature || '';
          baseRegionTag = baseDoc.regionTag || 'generic';
        }
      }

      let tailoredParagraphs: string[] = [];
      const modelUsed = settings?.defaultModel ?? 'quality';
      let tokensInput = 0;
      let tokensOutput = 0;

      if (baseParagraphs.length > 0) {
        const rendered = await this.ai.renderSkill('cover-letter-tailor', {
          profile_md: profile.fullMd,
          job_description: jd,
          body_paragraphs: JSON.stringify(baseParagraphs),
          language: lang,
        });
        const res = await this.ai.run({
          mode: settings?.aiMode ?? 'api',
          provider: settings?.provider ?? 'openai',
          model: settings?.defaultModel ?? 'quality',
          systemPrompt: rendered.systemPrompt,
          userPrompt: rendered.userPrompt,
          language: lang,
        });

        const rawText = res.text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        const parsed = JSON.parse(rawText);
        tailoredParagraphs = parsed.bodyParagraphs || [];
        tokensInput = res.tokensInput;
        tokensOutput = res.tokensOutput;
      } else {
        const rendered = await this.ai.renderSkill('cover-letter-generate', {
          profile_md: profile.fullMd,
          job_description: jd,
          language: lang,
          section: 'all',
        });
        const res = await this.ai.run({
          mode: settings?.aiMode ?? 'api',
          provider: settings?.provider ?? 'openai',
          model: settings?.defaultModel ?? 'quality',
          systemPrompt: rendered.systemPrompt,
          userPrompt: rendered.userPrompt,
          language: lang,
        });

        const rawText = res.text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        const parsed = JSON.parse(rawText) as CoverLetterContent;
        baseAddress = parsed.address || {};
        baseSubject = parsed.subject || '';
        baseGreeting = parsed.greeting || '';
        baseClosing = parsed.closing || '';
        baseSignature = parsed.signature || '';
        tailoredParagraphs = parsed.bodyParagraphs || [];
        tokensInput = res.tokensInput;
        tokensOutput = res.tokensOutput;
      }

      const contentJsonObj: CoverLetterContent = {
        address: baseAddress,
        date: new Date().toISOString().split('T')[0],
        subject: baseSubject,
        greeting: baseGreeting,
        bodyParagraphs: tailoredParagraphs,
        closing: baseClosing,
        signature: baseSignature,
        jobDescription: jd,
      };

      const label = `${job.company || 'Job'} — Tailored Cover Letter`;
      const created = await this.db.documentLibraryUpsert({
        docType: 'cover_letter',
        source: 'generated',
        label,
        contentJson: JSON.stringify(contentJsonObj),
        regionTag: baseRegionTag,
        language: lang,
        modelUsed,
        tokensInput,
        tokensOutput,
      });

      const app = this.application();
      if (app && app.id) {
        const updatedApp = await this.db.upsertApplication({
          ...app,
          coverLetterDocumentId: created.id,
        });
        this.application.set(updatedApp);
      }

      this.tailorCoverLetterOpen.set(false);
      void this.router.navigate(['/documents/cover-letter', created.id]);
    } catch (e) {
      this.tailorCoverLetterError.set(String(e));
    } finally {
      this.tailoringCoverLetter.set(false);
    }
  }

  /** Three tailoring phases (XYZ → dual critique → build) with derived state. */
  readonly tailorPhases = computed(() => {
    const done = this.tailorResults().length;
    const running = this.tailoring();
    const defs = [
      { n: 1, icon: this.icons.pencilLine, nameKey: 'jobs.wizard.phase_xyz' },
      { n: 2, icon: this.icons.scanSearch, nameKey: 'jobs.wizard.phase_critique' },
      { n: 3, icon: this.icons.hammer, nameKey: 'jobs.wizard.phase_build' },
    ];
    return defs.map((d) => {
      let state: 'done' | 'running' | 'ready' | 'pending';
      let statusKey: string;
      if (done >= d.n) {
        state = 'done';
        statusKey = 'jobs.wizard.phase_done';
      } else if (running && done === d.n - 1) {
        state = 'running';
        statusKey = 'jobs.wizard.phase_running';
      } else if (!running && done === d.n - 1) {
        state = 'ready';
        statusKey = 'jobs.wizard.phase_ready';
      } else {
        state = 'pending';
        statusKey = 'jobs.wizard.phase_pending';
      }
      return { ...d, state, statusKey };
    });
  });

  /** i18n key of the phase currently being generated — drives the animated
   * "AI thinking" line while tailoring auto-runs through all three passes. */
  readonly currentPhaseKey = computed(() => {
    const keys = ['jobs.wizard.phase_xyz', 'jobs.wizard.phase_critique', 'jobs.wizard.phase_build'];
    return keys[Math.min(this.tailorResults().length, 2)];
  });

  readonly exporting = signal<string | false>(false);
  readonly exportStatus = signal('');
  readonly exportError = signal(false);
  readonly lastExport = signal<{ filePath: string; format: 'docx' | 'pdf' } | null>(null);

  readonly parsing = signal(false);
  readonly scoring = signal(false);

  readonly parseStatus = signal('');
  readonly parseError = signal(false);
  readonly scoreStatus = signal('');
  readonly scoreError = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
    } catch {
      // non-fatal — user can still paste
    }

    // Job Detail mode: /jobs/:id loads the job and its CACHED score only.
    // No AI is called on open (0 tokens); the user clicks Score to spend tokens.
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      await this.loadJob(+idParam);
      await this.handleWizardReturnFromDocumentEditor();
    }
  }

  ngOnDestroy(): void {
    this.pageTitle.clear();
  }

  private async loadJob(id: number): Promise<void> {
    try {
      const job = await this.db.getJob(id);
      if (!job) return;
      this.job.set(job);
      this.jdText.set(job.jdText ?? '');
      const headerTitle = [job.company, job.title].filter(Boolean).join(' — ');
      this.pageTitle.set(headerTitle || this.t()('nav.jobs'));
      const p = this.profile();
      if (p?.scoringHash) {
        const cached = await this.db.scoreCacheGet(id, p.scoringHash);
        if (cached) {
          this.cache.set(cached);
          this.fromCache.set(true);
        }
      }
      const apps = await this.db.listApplications();
      const app = apps.find((a) => a.jobId === id) ?? null;
      this.application.set(app);
      this.documentReviewLanguage.set(
        app?.docLanguage ??
          this.normalizeSupportedLanguage(job.language ?? this.settings()?.defaultDocLanguage),
      );
      this.documentReviewRegion.set(this.inferDocumentRegion(job));

      const coverLetters = await this.db.documentLibraryList('cover_letter');
      this.coverLetters.set(coverLetters);

      const cvs = await this.db.documentLibraryList('cv');
      const s = this.settings();
      const lang = job.language ?? s?.defaultDocLanguage ?? 'en';
      const matches = cvs.filter((c) => c.language === lang || c.isDefault);
      this.matchingCvs.set(matches);
      if (matches.length > 0) {
        this.selectedBaseCvId.set(matches[0].id);
      } else {
        this.selectedBaseCvId.set(null);
      }
      await this.loadLinkedDocuments();

      this.portalQuestions.set([...JobsComponent.DEFAULT_PORTAL_QUESTIONS]);
      this.portalAnswers.set([]);
      this.portalFromCache.set(false);
      this.portalStatus.set('');
      this.portalError.set(false);
      this.portalRedrafting.set(null);
      this.portalCopiedIndex.set(null);
      this.portalLanguage.set(app?.docLanguage ?? this.settings()?.defaultDocLanguage ?? 'en');
      await this.loadPortalAnswersFromCache();
      await this.restoreTailoringFromCache();
    } catch {
      // non-fatal — detail still renders, user can re-score
    }
  }

  private async handleWizardReturnFromDocumentEditor(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('returnTo') !== 'applyWizard' && params.get('wizardStep') !== 'documents') {
      return;
    }

    this.wizardOpen.set(true);
    this.wizardInitialStep.set(3);
    await this.prepareDocumentsStep();

    if (params.get('documentSaved') !== '1') return;

    const previousHash = params.get('reviewHash');
    if (!previousHash) return;

    const currentHash = await this.currentDocumentsHash();
    if (currentHash === previousHash) {
      const restoredChecks = this.restoreFinalChecksAfterReturn(previousHash);
      if (restoredChecks) this.finalChecks.set(restoredChecks);
      this.finalChecksOutdated.set(false);
      this.documentReviewError.set(false);
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_saved_unchanged'));
    } else {
      this.finalChecks.set(null);
      this.finalChecksOutdated.set(true);
      this.documentReviewError.set(false);
      this.documentReviewStatus.set(this.t()('jobs.wizard.document_saved_changed'));
    }
  }

  /** Re-hydrate `tailorResults` from `tailoring_cache` so returning to a
   * previously-tailored job shows its Tailored state (badge + Retailor)
   * without re-running any AI. Replays the exact per-pass input hashes
   * `runTailorPass` uses; stops at the first pass with no cached row. */
  private async restoreTailoringFromCache(): Promise<void> {
    const j = this.job();
    const p = this.profile();
    const s = this.settings();
    if (!j?.id || !p?.fullMd || !s) return;

    const lang = s.defaultDocLanguage ?? 'en';
    const restored: PassResult[] = [];
    for (const passNum of [1, 2, 3] as const) {
      const pass1Md = restored.find((r) => r.pass === 1)?.resultMd ?? '';
      const pass2Md = restored.find((r) => r.pass === 2)?.resultMd ?? '';
      const hashInput = [p.fullMd, this.jdText(), String(passNum), lang, pass1Md, pass2Md].join(
        '\x00',
      );
      const inputHash = await this.db.hashText(hashInput);
      const cached = await this.db.tailoringCacheGet(j.id, passNum, inputHash);
      if (!cached) break;
      restored.push({
        pass: passNum,
        resultMd: cached.resultMd,
        inputHash,
        fromCache: true,
        tokensIn: 0,
        tokensOut: 0,
        changes: this.parseJsonArray(cached.changesJson),
        gaps: this.parseJsonArray(cached.gapsJson),
      });
    }
    if (restored.length) this.tailorResults.set(restored);
  }

  /** Best-effort cache read for the current default question set. Never calls AI. */
  private async loadPortalAnswersFromCache(): Promise<void> {
    const job = this.job();
    const p = this.profile();
    const s = this.settings();
    const questions = this.portalQuestions()
      .map((q) => q.trim())
      .filter(Boolean);
    if (!job || !p?.scoringHash || !s || !questions.length) return;
    try {
      const inputHash = await this.portalInputHash(questions, s.defaultModel);
      const cached = await this.db.portalAnswersGet(job.id, p.scoringHash, inputHash);
      if (cached) {
        this.portalAnswers.set(JSON.parse(cached.answersJson ?? '[]'));
        this.portalFromCache.set(true);
      }
    } catch {
      // non-fatal — user can still click "Draft answers"
    }
  }

  private portalInputHash(questions: string[], model: string): Promise<string> {
    return this.db.hashText(JSON.stringify({ q: questions, lang: this.portalLanguage(), model }));
  }

  private parsePortalAnswers(text: string): { question: string; answer: string }[] {
    const raw = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    let parsed: { answers: { question: string; answer: string }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
    }
    return parsed.answers ?? [];
  }

  addPortalQuestion(): void {
    this.portalQuestions.set([...this.portalQuestions(), '']);
  }

  updatePortalQuestion(index: number, value: string): void {
    const qs = this.portalQuestions().slice();
    qs[index] = value;
    this.portalQuestions.set(qs);
  }

  removePortalQuestion(index: number): void {
    const qs = this.portalQuestions().slice();
    qs.splice(index, 1);
    this.portalQuestions.set(qs);
  }

  editPortalAnswer(index: number, value: string): void {
    const answers = this.portalAnswers().slice();
    if (!answers[index]) return;
    answers[index] = { ...answers[index], answer: value };
    this.portalAnswers.set(answers);
  }

  async copyPortalAnswer(index: number): Promise<void> {
    const answer = this.portalAnswers()[index]?.answer;
    if (!answer) return;
    await navigator.clipboard.writeText(answer);
    this.portalCopiedIndex.set(index);
    setTimeout(() => this.portalCopiedIndex.set(null), 1500);
  }

  /** One AI call for the whole question set, cached by (job, profile, questions+language+model). */
  async draftPortalAnswers(): Promise<void> {
    if (this.portalDrafting()) return;
    const job = this.job();
    const p = this.profile();
    const s = this.settings();
    const questions = this.portalQuestions()
      .map((q) => q.trim())
      .filter(Boolean);
    if (!job || !p?.scoringJson || !p.scoringHash || !s || !questions.length) return;

    this.portalDrafting.set(true);
    this.portalError.set(false);
    this.portalStatus.set('');
    try {
      const inputHash = await this.portalInputHash(questions, s.defaultModel);
      const cached = await this.db.portalAnswersGet(job.id, p.scoringHash, inputHash);
      if (cached) {
        this.portalAnswers.set(JSON.parse(cached.answersJson ?? '[]'));
        this.portalFromCache.set(true);
        this.portalStatus.set(this.t()('jobs.portal_cached'));
        return;
      }

      const rendered = await this.ai.renderSkill('portal-answers', {
        profile_json: p.scoringJson,
        job_description: job.jdText ?? '',
        questions: JSON.stringify(questions),
        language: this.portalLanguage(),
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.portalLanguage(),
      });
      const parsed = this.parsePortalAnswers(res.text);
      this.portalAnswers.set(parsed);
      this.portalFromCache.set(false);
      await this.db.portalAnswersSave({
        jobId: job.id,
        profileHash: p.scoringHash,
        questionsJson: JSON.stringify(questions),
        answersJson: JSON.stringify(parsed),
        inputHash,
        modelUsed: s.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      this.portalStatus.set(`${res.tokensInput + res.tokensOutput} tokens used.`);
    } catch (e) {
      this.portalError.set(true);
      this.portalStatus.set(String(e));
    } finally {
      this.portalDrafting.set(false);
    }
  }

  /** Re-drafts a single answer. Always a fresh AI call (a unique variant marker keeps the
   * cache key distinct from both the batch draft and any prior version), still cached. */
  async redraftPortalAnswer(index: number): Promise<void> {
    if (this.portalRedrafting() !== null) return;
    const job = this.job();
    const p = this.profile();
    const s = this.settings();
    const current = this.portalAnswers()[index];
    if (!job || !p?.scoringJson || !p.scoringHash || !s || !current) return;

    this.portalRedrafting.set(index);
    this.portalError.set(false);
    try {
      const question = current.question;
      const inputHash = await this.db.hashText(
        `${question}::${this.portalLanguage()}::${s.defaultModel}::${Date.now()}`,
      );
      const rendered = await this.ai.renderSkill('portal-answers', {
        profile_json: p.scoringJson,
        job_description: job.jdText ?? '',
        questions: JSON.stringify([question]),
        language: this.portalLanguage(),
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.portalLanguage(),
      });
      const parsed = this.parsePortalAnswers(res.text);
      const answer = parsed[0]?.answer ?? current.answer;
      await this.db.portalAnswersSave({
        jobId: job.id,
        profileHash: p.scoringHash,
        questionsJson: JSON.stringify([question]),
        answersJson: JSON.stringify([{ question, answer }]),
        inputHash,
        modelUsed: s.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      const answers = this.portalAnswers().slice();
      answers[index] = { question, answer };
      this.portalAnswers.set(answers);
    } catch (e) {
      this.portalError.set(true);
      this.portalStatus.set(String(e));
    } finally {
      this.portalRedrafting.set(null);
    }
  }

  /** Add to Pipeline: create an 'applied' application so it shows on the board. */
  async addToPipeline(): Promise<void> {
    const j = this.job();
    if (!j?.id || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionMsg.set('');
    try {
      const existing = this.application();
      const patch: Partial<Application> & { jobId: number; status: 'applied' } = {
        jobId: j.id,
        status: 'applied',
      };
      if (existing?.id) patch.id = existing.id;
      const app = await this.db.upsertApplication(patch);
      this.application.set(app);
      this.actionMsg.set(this.t()('jobs.pipeline_ok'));
    } catch (e) {
      this.actionMsg.set(String(e));
    } finally {
      this.actionBusy.set(false);
    }
  }

  /**
   * Mark as Applied — reuses the SAME status-transition command the pipeline
   * kanban's drag-and-drop uses (`db_set_application_status`): it writes
   * `status_history` and computes `follow_up_at` deterministically from
   * `settings.followup_days_after_apply` in SQL, 0 AI tokens. No date math
   * is duplicated here.
   */
  async markApplied(): Promise<void> {
    const j = this.job();
    if (!j?.id || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionMsg.set('');
    try {
      let app = this.application();
      if (!app?.id) {
        app = await this.db.upsertApplication({ jobId: j.id, status: 'saved' });
      }
      const updated = await this.db.setApplicationStatus(app.id, 'applied');
      this.application.set(updated);
      this.jobsStore.patchOverviewRow(j.id, { status: 'applied' });
      this.editingLocked.set(false);
      // Applied — send the user back to My Jobs; re-entering the job shows
      // its Applied + Tailored state.
      await this.router.navigate(['/jobs']);
    } catch (e) {
      this.actionMsg.set(String(e));
      this.actionBusy.set(false);
    }
  }

  /** "Change" — lifts the lock immediately, no confirmation. Nothing is
   * written until the user takes an explicit follow-up action. */
  startEditingLocked(): void {
    this.editingLocked.set(true);
  }

  /** "Cancel" — drops the override and discards the in-progress description
   * edit (reverts jdText to the persisted value). Nothing was ever saved. */
  cancelEditingLocked(): void {
    this.editingLocked.set(false);
    this.jdText.set(this.job()?.jdText ?? '');
  }

  /** Opening the wizard / returning to the summary should always land the
   * user at the top of the page — the scoring view runs long, so the wizard
   * (or the restored summary) would otherwise open mid-scroll. */
  openWizard(): void {
    this.wizardInitialStep.set(0);
    this.wizardOpen.set(true);
    this.scrollContentToTop();
  }

  closeWizard(): void {
    this.wizardOpen.set(false);
    this.scrollContentToTop();
  }

  private scrollContentToTop(): void {
    // Defer to the next frame so the step's new (shorter/taller) content has
    // rendered before we scroll — otherwise the container clamps against the
    // old scrollHeight and can land mid-page.
    const view = this.document.defaultView;
    const doScroll = (): void => {
      const el =
        this.document.querySelector('.content') ??
        this.document.scrollingElement ??
        this.document.documentElement;
      el?.scrollTo?.({ top: 0, behavior: 'smooth' });
    };
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(doScroll);
    } else {
      doScroll();
    }
  }

  openDeleteConfirm(): void {
    this.deleteConfirmOpen.set(true);
  }

  cancelDeleteConfirm(): void {
    this.deleteConfirmOpen.set(false);
  }

  async confirmDeleteJob(): Promise<void> {
    const j = this.job();
    if (!j?.id || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.jobsStore.deleteJob(j.id);
      await this.router.navigate(['/jobs']);
    } catch (e) {
      this.actionMsg.set(String(e));
      this.deleting.set(false);
      this.deleteConfirmOpen.set(false);
    }
  }

  async parseAndFilter(): Promise<void> {
    this.parsing.set(true);
    this.parseStatus.set('');
    this.parseError.set(false);
    this.job.set(null);
    this.cache.set(null);
    this.archetypeMatch.set(null);
    // Re-parsing means the JD (and therefore the score) changed — any earlier
    // tailoring for this job is now stale. Drop it so the Tailored badge and
    // Retailor state clear and the user re-tailors against the updated JD.
    this.editingLocked.set(false);
    this.resetWizard();
    try {
      const j = await this.db.jobPaste(this.jdText());
      this.job.set(j);
      if (!j.hardFilterPassed) {
        this.parseStatus.set('Hard filter failed — job blocked.');
      } else {
        this.parseStatus.set('');
        // Check cache immediately if profile available
        const p = this.profile();
        if (p?.scoringHash && j.id) {
          const cached = await this.db.scoreCacheGet(j.id, p.scoringHash);
          if (cached) {
            this.cache.set(cached);
            this.fromCache.set(true);
            this.scoreStatus.set('Loaded from cache — 0 tokens used.');
          }
        }
        // Layer-1 archetype overlap check (0 tokens, deterministic) — warn only, never blocks.
        const match = await this.db.checkArchetypeMatch(
          j.title ?? undefined,
          j.jdText ?? '',
          p?.targetArchetypes
            ? JSON.stringify(archetypeNames(parseArchetypes(p.targetArchetypes)))
            : undefined,
        );
        this.archetypeMatch.set(match);
      }
    } catch (e) {
      this.parseStatus.set(`Failed: ${String(e)}`);
      this.parseError.set(true);
    } finally {
      this.parsing.set(false);
    }
  }

  async scoreJob(forceRefresh = false): Promise<void> {
    const j = this.job();
    const p = this.profile();
    const s = this.settings();
    if (!j || !p?.scoringJson || !p.scoringHash || !s) return;

    // Cache check (skip on force refresh)
    if (!forceRefresh) {
      const cached = await this.db.scoreCacheGet(j.id!, p.scoringHash);
      if (cached) {
        this.cache.set(cached);
        this.fromCache.set(true);
        this.scoreStatus.set('Loaded from cache — 0 tokens used.');
        return;
      }
    }

    this.scoring.set(true);
    this.scoreStatus.set('');
    this.scoreError.set(false);
    this.fromCache.set(false);
    try {
      const lang = s.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('job-scoring', {
        profile_json: p.scoringJson,
        job_description: this.jdText(),
        language: lang,
        legitimacy_notes: this.legitimacyNotes().join('\n'),
        tailored_resume_md: '',
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });

      // Parse AI JSON response
      let parsed: {
        score: number;
        dimensions: ScoreDimension[];
        missing_keywords: string[];
        red_flags: string[];
        ats_pass: boolean;
        ats_notes: string;
        summary: string;
        before_you_submit?: string[];
      };
      try {
        const raw = res.text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`AI returned invalid JSON: ${res.text.slice(0, 200)}`);
      }

      const saved = await this.db.scoreCacheSave({
        jobId: j.id!,
        profileHash: p.scoringHash,
        language: lang,
        score: parsed.score,
        dimensionsJson: JSON.stringify(parsed.dimensions),
        missingKeywordsJson: JSON.stringify(parsed.missing_keywords),
        redFlagsJson: JSON.stringify(parsed.red_flags),
        atsPass: parsed.ats_pass,
        atsNotes: parsed.ats_notes,
        summary: parsed.summary,
        beforeYouSubmitJson: JSON.stringify(parsed.before_you_submit ?? []),
        modelUsed: s.economyModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      this.cache.set(saved);
      this.jobsStore.patchOverviewRow(j.id!, { score: saved.score });
      this.scoreStatus.set(`Scored — ${res.tokensInput} in / ${res.tokensOutput} out`);
    } catch (e) {
      this.scoreStatus.set(`Scoring failed: ${String(e)}`);
      this.scoreError.set(true);
    } finally {
      this.scoring.set(false);
    }
  }

  /**
   * Post-tailor rescore — user-initiated (opt-in, spends tokens), scores the
   * PASS-3 tailored resume instead of the generic profile, so the user sees
   * before (original posting fit) vs after (fit of what they'd actually
   * submit). Intentionally NOT persisted to `scoring_cache`: that table is
   * keyed unique on (job_id, profile_hash, jd_hash) — the same key the
   * original score used — so saving here would overwrite the "before"
   * baseline instead of keeping both. Kept as in-memory state only.
   */
  async updateScoreAfterTailor(): Promise<void> {
    const j = this.job();
    const p = this.profile();
    const s = this.settings();
    const pass3 = this.tailorResults().find((r) => r.pass === 3);
    if (!j?.id || !p?.scoringJson || !p.scoringHash || !s || !pass3 || this.updatingScore()) {
      return;
    }

    this.updatingScore.set(true);
    this.updateScoreStatus.set('');
    this.updateScoreError.set(false);
    this.finalChecks.set(null);
    this.finalChecksOutdated.set(false);
    try {
      const lang = s.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('job-scoring', {
        profile_json: p.scoringJson,
        job_description: this.jdText(),
        language: lang,
        legitimacy_notes: this.legitimacyNotes().join('\n'),
        tailored_resume_md: pass3.resultMd,
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });

      let parsed: {
        score: number;
        dimensions: ScoreDimension[];
        missing_keywords: string[];
        red_flags: string[];
        ats_pass: boolean;
        ats_notes: string;
        summary: string;
        before_you_submit?: string[];
      };
      try {
        const raw = res.text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`AI returned invalid JSON: ${res.text.slice(0, 200)}`);
      }

      this.postTailorScore.set({
        id: -1,
        jobId: j.id,
        profileHash: p.scoringHash,
        jdHash: j.jdHash ?? '',
        language: lang,
        score: parsed.score,
        dimensionsJson: JSON.stringify(parsed.dimensions),
        missingKeywordsJson: JSON.stringify(parsed.missing_keywords),
        redFlagsJson: JSON.stringify(parsed.red_flags),
        atsPass: parsed.ats_pass,
        atsNotes: parsed.ats_notes,
        summary: parsed.summary,
        beforeYouSubmitJson: JSON.stringify(parsed.before_you_submit ?? []),
        modelUsed: s.economyModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
      this.updateScoreStatus.set(`Updated — ${res.tokensInput} in / ${res.tokensOutput} out`);
    } catch (e) {
      this.updateScoreStatus.set(`Update failed: ${String(e)}`);
      this.updateScoreError.set(true);
    } finally {
      this.updatingScore.set(false);
    }
  }

  /**
   * Persists the post-tailor score to `scoring_cache` so the My Jobs list
   * reflects the tailored fit. The unique key (job_id, profile_hash, jd_hash)
   * matches the baseline row, so this overwrites it — the "before" is only
   * needed for the in-session comparison (held in `cache()`), not on disk.
   * Idempotent per rescore via `postTailorSaved`.
   */
  private async savePostTailorScore(): Promise<void> {
    const post = this.postTailorScore();
    const j = this.job();
    if (!post || !j?.id || this.postTailorSaved()) return;
    this.postTailorSaved.set(true);
    try {
      await this.db.scoreCacheSave({
        jobId: j.id,
        profileHash: post.profileHash,
        language: post.language ?? 'en',
        score: post.score,
        dimensionsJson: post.dimensionsJson ?? '[]',
        missingKeywordsJson: post.missingKeywordsJson ?? '[]',
        redFlagsJson: post.redFlagsJson ?? '[]',
        atsPass: post.atsPass ?? false,
        atsNotes: post.atsNotes ?? '',
        summary: post.summary ?? '',
        beforeYouSubmitJson: post.beforeYouSubmitJson ?? '[]',
        modelUsed: post.modelUsed ?? '',
        tokensInput: post.tokensInput ?? 0,
        tokensOutput: post.tokensOutput ?? 0,
      });
      this.jobsStore.patchOverviewRow(j.id, { score: post.score });
    } catch {
      this.postTailorSaved.set(false); // allow a retry on the next commit
    }
  }

  /**
   * "Update application" — final-step action when the job already has a
   * status (applied/interview/…). Commits the re-tailored score, shows the
   * success card, then returns the user to this job's detail where the
   * updated score and Tailored badge are now in place.
   */
  async updateApplication(): Promise<void> {
    const j = this.job();
    if (!j?.id || this.actionBusy()) return;
    this.actionBusy.set(true);
    await this.savePostTailorScore();
    this.applyResult.set('updated');
    // Success card holds briefly, then drop back to this job's detail with the
    // updated score + Tailored badge freshly loaded from cache.
    const view = this.document.defaultView;
    const jobId = j.id;
    view?.setTimeout(() => {
      void (async () => {
        this.wizardOpen.set(false);
        this.applyResult.set(null);
        this.actionBusy.set(false);
        await this.loadJob(jobId);
        this.scrollContentToTop();
      })();
    }, 2200);
  }

  legitimacyNotes(): string[] {
    try {
      return JSON.parse(this.job()?.legitimacyNotes ?? '[]');
    } catch {
      return [];
    }
  }

  hasArchetypes(): boolean {
    return parseArchetypes(this.profile()?.targetArchetypes).length > 0;
  }

  // ── Tailoring wizard ────────────────────────────────────────────────────────

  /** Runs the full 3-pass tailoring pipeline back-to-back on one click — the
   * phase cards animate through running/done as each pass lands, no manual
   * Continue between passes. Stops on the first failing pass. */
  async startTailoring(): Promise<void> {
    this.tailorResults.set([]);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    this.exportStatus.set('');
    this.lastExport.set(null);
    this.postTailorScore.set(null);
    this.postTailorSaved.set(false);
    this.updateScoreStatus.set('');
    this.updateScoreError.set(false);
    this.finalChecks.set(null);
    this.finalChecksOutdated.set(false);

    this.tailoring.set(true);
    try {
      for (const pass of [1, 2, 3] as const) {
        await this.runTailorPass(pass);
      }
    } catch (e) {
      this.tailorStatus.set(String(e));
      this.tailorError.set(true);
    } finally {
      this.tailoring.set(false);
    }
  }

  /** Wizard step index: 0 review · 1 tailor · 2 updated score · 3 documents · 4 export.
   * Entering the Updated score step auto-runs the rescore once (only if the
   * user actually tailored — pass 3 exists — and it hasn't run yet). */
  onWizardStep(step: number): void {
    this.wizardInitialStep.set(step);
    // Every step transition lands the user at the top of the page.
    this.scrollContentToTop();

    const UPDATED_SCORE_STEP = 2;
    const DOCUMENTS_STEP = 3;
    const EXPORT_STEP = 4;
    if (
      step === UPDATED_SCORE_STEP &&
      this.tailorResults().length === 3 &&
      !this.postTailorScore() &&
      !this.updatingScore()
    ) {
      void this.updateScoreAfterTailor();
    }
    if (step === DOCUMENTS_STEP) {
      void this.prepareDocumentsStep();
    }
    // Continuing past the Updated score step commits the new score to My Jobs.
    if (step === EXPORT_STEP) {
      void this.savePostTailorScore();
    }
  }

  resetWizard(): void {
    this.tailorResults.set([]);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    this.exportStatus.set('');
    this.exportError.set(false);
    this.postTailorScore.set(null);
    this.postTailorSaved.set(false);
    this.updateScoreStatus.set('');
    this.updateScoreError.set(false);
  }

  async doExport(kind: ReviewDocumentKind, format: 'docx' | 'pdf'): Promise<void> {
    const item = kind === 'cv' ? this.linkedCv() : this.linkedCoverLetter();
    if (!item) {
      this.exportStatus.set(
        kind === 'cv'
          ? this.t()('jobs.wizard.export_missing_cv_warning')
          : this.t()('jobs.wizard.export_missing_cover_letter_warning'),
      );
      this.exportError.set(true);
      return;
    }

    const exportingKey = `${kind}-${format}`;
    this.exporting.set(exportingKey);
    this.exportStatus.set('');
    this.exportError.set(false);
    this.lastExport.set(null);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({ defaultPath: this.documentExportFilename(item, format) });
      if (!filePath) return;
      if (kind === 'cv') {
        await this.db.cvDocumentExport(item.id, format, filePath);
      } else {
        await this.db.coverLetterDocumentExport(item.id, format, filePath);
      }
      this.exportStatus.set(`${this.t()('jobs.wizard.export_saved')}: ${filePath}`);
      this.lastExport.set({ filePath, format });
    } catch (e) {
      this.exportStatus.set(`${this.t()('jobs.wizard.export_failed')}: ${String(e)}`);
      this.exportError.set(true);
    } finally {
      this.exporting.set(false);
    }
  }

  private documentExportFilename(item: DocumentLibraryItem, format: 'docx' | 'pdf'): string {
    const base = (item.label || item.docType)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${base || item.docType}.${format}`;
  }

  openExportedFile(path: string): void {
    void this.db.openFile(path);
  }

  revealExportedFile(path: string): void {
    void this.db.revealInFolder(path);
  }

  private async runTailorPass(passNum: 1 | 2 | 3): Promise<void> {
    const j = this.job();
    const p = this.profile();
    const s = this.settings();
    const selectedCvId = this.selectedBaseCvId();
    const matchingCvs = this.matchingCvs();

    if (!j?.id || (!p?.fullMd && !selectedCvId) || !s) return;

    let baselineMd = p?.fullMd ?? '';
    if (selectedCvId) {
      const cvItem = matchingCvs.find((c) => c.id === selectedCvId);
      if (cvItem?.contentJson) {
        try {
          const cvContent = JSON.parse(cvItem.contentJson) as CvContent;
          baselineMd = cvContentToMd(cvContent);
        } catch {
          // fallback to profile if parsing fails
        }
      }
    }

    const lang = s.defaultDocLanguage ?? 'en';
    const pass1Md = this.tailorResults().find((r) => r.pass === 1)?.resultMd ?? '';
    const pass2Md = this.tailorResults().find((r) => r.pass === 2)?.resultMd ?? '';

    // Input hash includes all inputs for this pass → correct cache invalidation
    const hashInput = [baselineMd, this.jdText(), String(passNum), lang, pass1Md, pass2Md].join(
      '\x00',
    );
    const inputHash = await this.db.hashText(hashInput);

    const cached = await this.db.tailoringCacheGet(j.id, passNum, inputHash);
    if (cached) {
      this.appendPassResult(
        passNum,
        cached.resultMd,
        cached.changesJson,
        cached.gapsJson,
        inputHash,
        true,
        0,
        0,
      );
      this.tailorStatus.set(`Pass ${passNum} loaded from cache — 0 tokens.`);
      return;
    }

    const scoringJson = this.cache() ? JSON.stringify(this.cache()) : '{}';
    const rendered = await this.ai.renderSkill('resume-tailoring', {
      profile_md: baselineMd,
      job_description: this.jdText(),
      scoring_json: scoringJson,
      pass: String(passNum),
      language: lang,
      pass1_result: pass1Md,
      pass2_result: pass2Md,
    });

    const res = await this.ai.run({
      mode: s.aiMode,
      provider: s.provider,
      model: s.defaultModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: lang,
    });

    const parsed = this.parsePassResult(res.text, passNum);

    await this.db.tailoringCacheSave({
      jobId: j.id,
      pass: passNum,
      inputHash,
      resultMd: parsed.result_md,
      changesJson: JSON.stringify(parsed.changes),
      gapsJson: JSON.stringify(parsed.gaps),
      modelUsed: s.defaultModel,
      tokensInput: res.tokensInput,
      tokensOutput: res.tokensOutput,
    });

    this.appendPassResult(
      passNum,
      parsed.result_md,
      JSON.stringify(parsed.changes),
      JSON.stringify(parsed.gaps),
      inputHash,
      false,
      res.tokensInput,
      res.tokensOutput,
    );
    this.tailorStatus.set(`Pass ${passNum} done — ${res.tokensInput} in / ${res.tokensOutput} out`);
  }

  private appendPassResult(
    pass: number,
    resultMd: string,
    changesJson: string | undefined,
    gapsJson: string | undefined,
    inputHash: string,
    fromCache: boolean,
    tokensIn: number,
    tokensOut: number,
  ): void {
    this.tailorResults.update((r) => [
      ...r,
      {
        pass,
        resultMd,
        inputHash,
        fromCache,
        tokensIn,
        tokensOut,
        changes: this.parseJsonArray(changesJson),
        gaps: this.parseJsonArray(gapsJson),
      },
    ]);
  }

  private parsePassResult(
    text: string,
    pass: number,
  ): { result_md: string; changes: string[]; gaps: string[] } {
    try {
      const raw = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(raw);
      return {
        result_md: String(parsed.result_md ?? ''),
        changes: Array.isArray(parsed.changes) ? parsed.changes : [],
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      };
    } catch {
      throw new Error(`Pass ${pass} returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }

  private parseJsonArray(json: string | undefined): string[] {
    try {
      return JSON.parse(json ?? '[]');
    } catch {
      return [];
    }
  }
}

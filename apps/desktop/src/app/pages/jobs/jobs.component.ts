import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
  Star,
  Tag,
  WandSparkles,
  Bookmark,
  X,
} from 'lucide-angular';
import { AiService, DbService } from '@applye/data';
import {
  Application,
  Job,
  Profile,
  ScoreDimension,
  ScoringCache,
  Settings,
  SupportedLanguage,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobDetailIcons, classifyChangeType } from './scoring.utils';
import { ScoringView } from './scoring-view.component';
import { ApplyWizard } from './apply-wizard.component';

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

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, ScoringView, ApplyWizard],
  template: `
    <div class="jobs">
      @if (!wizardOpen()) {
        <!-- Paste section -->
        <section class="section">
          <h3 class="eyebrow">{{ t()('jobs.paste_title') }}</h3>
          <textarea
            class="editor"
            [ngModel]="jdText()"
            (ngModelChange)="jdText.set($event)"
            [placeholder]="t()('jobs.paste_placeholder')"
            spellcheck="false"
          ></textarea>
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
            @if (!application()) {
              <button
                class="btn btn--secondary btn--md"
                [disabled]="actionBusy()"
                (click)="addToPipeline()"
              >
                {{ t()('jobs.add_to_pipeline') }}
              </button>
            }
            <button
              class="btn btn--primary btn--md"
              [disabled]="actionBusy()"
              (click)="markApplied()"
            >
              {{ t()('jobs.mark_applied') }}
            </button>
            @if (actionMsg()) {
              <span class="detail-actions__msg">{{ actionMsg() }}</span>
            }
          </div>
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
              (tailorApply)="wizardOpen.set(true)"
            />
          } @else {
            <app-apply-wizard
              [cache]="cache()"
              [fromCache]="fromCache()"
              [job]="job()"
              [jobTitle]="job()?.title ?? ''"
              [company]="job()?.company ?? ''"
              [icons]="icons"
              (closeWizard)="wizardOpen.set(false)"
              (markApplied)="markApplied()"
            >
              <div wizardTailorStep>
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
                  <div class="row">
                    <button
                      class="btn btn--primary btn--md"
                      [disabled]="!profile()?.fullMd"
                      (click)="startTailoring()"
                    >
                      <lucide-icon [img]="icons.sparkles" [size]="15" aria-hidden="true" />
                      {{ t()('jobs.tailor_btn') }}
                    </button>
                    @if (!profile()?.fullMd) {
                      <span class="status status--error">{{
                        t()('jobs.profile_needed_full')
                      }}</span>
                    }
                  </div>
                } @else if (
                  !tailoring() && tailorResults().length > 0 && tailorResults().length < 3
                ) {
                  <div class="row">
                    <button class="btn btn--primary btn--md" (click)="runNextPass()">
                      {{ t()('jobs.wizard.continue_label') }}
                      <lucide-icon [img]="icons.next" [size]="15" aria-hidden="true" />
                    </button>
                    <button class="btn btn--secondary btn--md" (click)="resetWizard()">
                      {{ t()('jobs.start_over') }}
                    </button>
                  </div>
                }

                @if (tailorStatus()) {
                  <span class="status" [class.status--error]="tailorError()">{{
                    tailorStatus()
                  }}</span>
                }

                <!-- Changes -->
                @if (allChanges().length) {
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
                @if (allGaps().length) {
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

              <div wizardExportApplyStep>
                <div class="apply-fields-header">
                  <span class="eyebrow">{{ t()('jobs.wizard.export_apply_eyebrow') }}</span>
                  <h4 class="apply-fields-title">{{ t()('jobs.wizard.export_title') }}</h4>
                </div>
                <!-- Export (pass 3 done) -->
                @if (!tailoring() && tailorResults().length === 3) {
                  <div class="export-options">
                    <button
                      class="export-option export-option--primary"
                      type="button"
                      [disabled]="!!exporting()"
                      (click)="doExport('docx')"
                    >
                      <span class="export-option__badge">{{ t()('jobs.export_recommended') }}</span>
                      <span class="export-option__icon export-option__icon--accent">
                        <lucide-icon [img]="icons.fileText" [size]="20" aria-hidden="true" />
                      </span>
                      <span class="export-option__title">{{
                        exporting() === 'docx' ? t()('jobs.exporting') : t()('jobs.export_docx')
                      }}</span>
                      <span class="export-option__desc">{{ t()('jobs.export_docx_desc') }}</span>
                    </button>
                    <button
                      class="export-option"
                      type="button"
                      [disabled]="!!exporting()"
                      (click)="doExport('pdf')"
                    >
                      <span class="export-option__icon">
                        <lucide-icon [img]="icons.fileDown" [size]="20" aria-hidden="true" />
                      </span>
                      <span class="export-option__title">{{
                        exporting() === 'pdf' ? t()('jobs.exporting') : t()('jobs.export_pdf')
                      }}</span>
                      <span class="export-option__desc">{{ t()('jobs.export_pdf_desc') }}</span>
                    </button>
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
    </div>
  `,
  styles: [
    `
      .detail-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-5);
      }
      .detail-actions__msg {
        font-size: var(--text-sm);
        color: var(--text-secondary);
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

      /* Badges */
      .badge {
        padding: 2px var(--space-2);
        border-radius: var(--radius-full);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        font-family: var(--font-mono);
      }
      .badge--pass {
        background: var(--success-tint);
        color: var(--success);
      }
      .badge--cache {
        background: var(--accent-tint);
        color: var(--text-accent);
      }
      .badge--warn {
        background: var(--warning-tint);
        color: var(--warning);
      }
      .badge--danger {
        background: var(--danger-tint);
        color: var(--danger);
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

      .apply-fields-header {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-bottom: var(--space-5);
      }
      .apply-fields-header--sub {
        margin-top: var(--space-6);
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
    `,
  ],
})
export class JobsComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = this.i18n.t;

  protected readonly icons: JobDetailIcons & {
    empty: typeof Search;
    copy: typeof Copy;
    add: typeof Plus;
    remove: typeof X;
    another: typeof RotateCw;
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
  readonly archetypeMatch = signal<boolean | null>(null);

  // Job Detail: the application row (if this job is on the board) + action state.
  readonly application = signal<Application | null>(null);
  readonly actionBusy = signal(false);
  readonly actionMsg = signal('');

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

  /** Flattened change / gap notes across all completed tailoring passes. */
  readonly allChanges = computed(() => this.tailorResults().flatMap((r) => r.changes));
  readonly allGaps = computed(() => this.tailorResults().flatMap((r) => r.gaps));
  readonly changesOpen = signal(true);
  protected readonly changeType = classifyChangeType;

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
  readonly exporting = signal<'docx' | 'pdf' | false>(false);
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
    }
  }

  private async loadJob(id: number): Promise<void> {
    try {
      const job = await this.db.getJob(id);
      if (!job) return;
      this.job.set(job);
      this.jdText.set(job.jdText ?? '');
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

      this.portalQuestions.set([...JobsComponent.DEFAULT_PORTAL_QUESTIONS]);
      this.portalAnswers.set([]);
      this.portalFromCache.set(false);
      this.portalStatus.set('');
      this.portalError.set(false);
      this.portalRedrafting.set(null);
      this.portalCopiedIndex.set(null);
      this.portalLanguage.set(app?.docLanguage ?? this.settings()?.defaultDocLanguage ?? 'en');
      await this.loadPortalAnswersFromCache();
    } catch {
      // non-fatal — detail still renders, user can re-score
    }
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
      this.actionMsg.set(this.t()('jobs.applied_ok'));
    } catch (e) {
      this.actionMsg.set(String(e));
    } finally {
      this.actionBusy.set(false);
    }
  }

  async parseAndFilter(): Promise<void> {
    this.parsing.set(true);
    this.parseStatus.set('');
    this.parseError.set(false);
    this.job.set(null);
    this.cache.set(null);
    this.archetypeMatch.set(null);
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
          p?.targetArchetypes ?? undefined,
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
      this.scoreStatus.set(`Scored — ${res.tokensInput} in / ${res.tokensOutput} out`);
    } catch (e) {
      this.scoreStatus.set(`Scoring failed: ${String(e)}`);
      this.scoreError.set(true);
    } finally {
      this.scoring.set(false);
    }
  }

  legitimacyNotes(): string[] {
    try {
      return JSON.parse(this.job()?.legitimacyNotes ?? '[]');
    } catch {
      return [];
    }
  }

  hasArchetypes(): boolean {
    try {
      const arr = JSON.parse(this.profile()?.targetArchetypes || '[]');
      return Array.isArray(arr) && arr.length > 0;
    } catch {
      return false;
    }
  }

  // ── Tailoring wizard ────────────────────────────────────────────────────────

  async startTailoring(): Promise<void> {
    this.tailorResults.set([]);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    this.exportStatus.set('');
    this.lastExport.set(null);
    await this.runPass(1);
  }

  async runNextPass(): Promise<void> {
    const next = (this.tailorResults().length + 1) as 2 | 3;
    await this.runPass(next);
  }

  resetWizard(): void {
    this.tailorResults.set([]);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    this.exportStatus.set('');
    this.exportError.set(false);
  }

  async doExport(format: 'docx' | 'pdf'): Promise<void> {
    const j = this.job();
    const pass3 = this.tailorResults().find((r) => r.pass === 3);
    if (!j?.id || !pass3) return;

    this.exporting.set(format);
    this.exportStatus.set('');
    this.exportError.set(false);
    this.lastExport.set(null);
    try {
      const doc =
        format === 'docx'
          ? await this.db.exportDocx(
              j.id,
              pass3.resultMd,
              j.company ?? '',
              j.title ?? '',
              pass3.inputHash,
            )
          : await this.db.exportPdf(
              j.id,
              pass3.resultMd,
              j.company ?? '',
              j.title ?? '',
              pass3.inputHash,
            );
      this.exportStatus.set(`Saved: ${doc.filePath}`);
      this.lastExport.set({ filePath: doc.filePath, format });
    } catch (e) {
      this.exportStatus.set(`Export failed: ${String(e)}`);
      this.exportError.set(true);
    } finally {
      this.exporting.set(false);
    }
  }

  openExportedFile(path: string): void {
    void this.db.openFile(path);
  }

  revealExportedFile(path: string): void {
    void this.db.revealInFolder(path);
  }

  private async runPass(pass: 1 | 2 | 3): Promise<void> {
    this.tailoring.set(true);
    this.tailorStatus.set('');
    this.tailorError.set(false);
    try {
      await this.runTailorPass(pass);
    } catch (e) {
      this.tailorStatus.set(`Pass ${pass} failed: ${String(e)}`);
      this.tailorError.set(true);
    } finally {
      this.tailoring.set(false);
    }
  }

  private async runTailorPass(passNum: 1 | 2 | 3): Promise<void> {
    const j = this.job();
    const p = this.profile();
    const s = this.settings();
    if (!j?.id || !p?.fullMd || !s) return;

    const lang = s.defaultDocLanguage ?? 'en';
    const pass1Md = this.tailorResults().find((r) => r.pass === 1)?.resultMd ?? '';
    const pass2Md = this.tailorResults().find((r) => r.pass === 2)?.resultMd ?? '';

    // Input hash includes all inputs for this pass → correct cache invalidation
    const hashInput = [p.fullMd, this.jdText(), String(passNum), lang, pass1Md, pass2Md].join(
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
      profile_md: p.fullMd,
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

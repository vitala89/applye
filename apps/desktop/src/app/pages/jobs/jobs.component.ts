import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  LucideAngularModule,
  Plus,
  RotateCw,
  Search,
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
          <button class="btn" [disabled]="parsing() || !jdText().trim()" (click)="parseAndFilter()">
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
            <button class="btn-ghost" [disabled]="actionBusy()" (click)="addToPipeline()">
              {{ t()('jobs.add_to_pipeline') }}
            </button>
          }
          <button class="btn-primary" [disabled]="actionBusy()" (click)="markApplied()">
            {{ t()('jobs.mark_applied') }}
          </button>
          <button class="btn-ghost" disabled [title]="t()('common.coming_soon')">
            {{ t()('jobs.archive') }}
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
                  <button class="btn" [disabled]="scoring()" (click)="scoreJob(false)">
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

      <!-- Scoring result -->
      @if (cache(); as c) {
        <section class="section">
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

          @if (!wizardOpen()) {
            <app-scoring-view
              [cache]="cache()"
              [fromCache]="fromCache()"
              [atsPassIcon]="icons.atsPass"
              [atsFailIcon]="icons.atsFail"
            />
            <div class="cta">
              <button class="btn btn--primary" (click)="wizardOpen.set(true)">
                {{ t()('jobs.wizard.start_apply') }}
              </button>
            </div>
          } @else {
            <div class="cta">
              <button class="btn" type="button" (click)="wizardOpen.set(false)">
                {{ t()('jobs.wizard.back_to_summary') }}
              </button>
            </div>
            <app-apply-wizard
              [cache]="cache()"
              [fromCache]="fromCache()"
              [atsPassIcon]="icons.atsPass"
              [atsFailIcon]="icons.atsFail"
            >
              <div wizardPortalStep>
                <!-- Draft portal answers -->
                <details class="card portal">
                  <summary class="eyebrow">{{ t()('jobs.portal_section') }}</summary>
                  <p class="muted">{{ t()('jobs.portal_hint') }}</p>
                  <p class="muted">{{ t()('jobs.portal_never_submits') }}</p>

                  <div class="portal__questions">
                    @for (q of portalQuestions(); track $index) {
                      <div class="row">
                        <input
                          class="editor portal__q-input"
                          type="text"
                          [ngModel]="q"
                          (ngModelChange)="updatePortalQuestion($index, $event)"
                          [attr.aria-label]="t()('jobs.portal_question_label')"
                        />
                        <button
                          class="btn-ghost"
                          type="button"
                          (click)="removePortalQuestion($index)"
                          [attr.aria-label]="t()('jobs.portal_remove_question')"
                        >
                          <lucide-icon [img]="icons.remove" [size]="14" aria-hidden="true" />
                        </button>
                      </div>
                    }
                    <button class="btn-ghost" type="button" (click)="addPortalQuestion()">
                      <lucide-icon [img]="icons.add" [size]="14" aria-hidden="true" />
                      {{ t()('jobs.portal_add_question') }}
                    </button>
                  </div>

                  <label class="portal__lang-label">
                    {{ t()('jobs.portal_language_label') }}
                    <select
                      class="editor portal__lang-select"
                      [ngModel]="portalLanguage()"
                      (ngModelChange)="portalLanguage.set($event)"
                    >
                      @for (lang of portalLanguages; track lang) {
                        <option [value]="lang">{{ lang.toUpperCase() }}</option>
                      }
                    </select>
                  </label>

                  <div class="cta">
                    <button
                      class="btn btn--primary"
                      [disabled]="portalDrafting() || !portalQuestions().length"
                      (click)="draftPortalAnswers()"
                    >
                      {{
                        portalDrafting()
                          ? t()('jobs.portal_drafting')
                          : t()('jobs.portal_draft_btn')
                      }}
                    </button>
                    @if (portalFromCache() && !portalDrafting()) {
                      <span class="badge badge--cache">{{ t()('jobs.portal_cached') }}</span>
                    }
                    @if (portalStatus() && !portalFromCache()) {
                      <span class="status" [class.status--error]="portalError()">{{
                        portalStatus()
                      }}</span>
                    }
                  </div>

                  @if (portalDrafting()) {
                    <div class="state-loading" [attr.aria-label]="t()('jobs.portal_drafting')">
                      <div class="state-loading__bar state-loading__bar--wide"></div>
                      <div class="state-loading__bar state-loading__bar--mid"></div>
                      <div class="state-loading__bar state-loading__bar--short"></div>
                    </div>
                  } @else if (portalError() && !portalAnswers().length) {
                    <div class="state-error" role="alert">
                      <p class="state-error__msg">{{ portalStatus() }}</p>
                    </div>
                  } @else if (portalAnswers().length) {
                    <div class="portal__answers">
                      @for (a of portalAnswers(); track a.question; let i = $index) {
                        <div class="card portal__answer">
                          <h4 class="eyebrow">{{ a.question }}</h4>
                          <textarea
                            class="editor"
                            rows="4"
                            [ngModel]="a.answer"
                            (ngModelChange)="editPortalAnswer(i, $event)"
                          ></textarea>
                          <div class="row">
                            <button class="btn-ghost" type="button" (click)="copyPortalAnswer(i)">
                              <lucide-icon [img]="icons.copy" [size]="14" aria-hidden="true" />
                              {{
                                portalCopiedIndex() === i
                                  ? t()('jobs.portal_copied')
                                  : t()('jobs.portal_copy')
                              }}
                            </button>
                            <button
                              class="btn-ghost"
                              type="button"
                              [disabled]="portalRedrafting() === i"
                              (click)="redraftPortalAnswer(i)"
                            >
                              <lucide-icon [img]="icons.another" [size]="14" aria-hidden="true" />
                              {{
                                portalRedrafting() === i
                                  ? t()('jobs.portal_redrafting')
                                  : t()('jobs.portal_another_version')
                              }}
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="state-empty">
                      <lucide-icon
                        [img]="icons.empty"
                        [size]="32"
                        class="state-empty__icon"
                        aria-hidden="true"
                      />
                      <p class="state-empty__msg">{{ t()('jobs.portal_empty') }}</p>
                    </div>
                  }
                </details>
              </div>

              <div wizardTailorStep>
                <!-- Tailoring wizard -->
                @if (tailorResults().length === 0 && !tailoring()) {
                  <div class="cta">
                    <button
                      class="btn btn--primary"
                      [disabled]="!profile()?.fullMd"
                      (click)="startTailoring()"
                    >
                      {{ t()('jobs.tailor_btn') }}
                    </button>
                    @if (!profile()?.fullMd) {
                      <span class="status status--error">{{
                        t()('jobs.profile_needed_full')
                      }}</span>
                    }
                  </div>
                }

                @if (tailorResults().length > 0 || tailoring()) {
                  <div class="wizard">
                    <!-- Completed pass results -->
                    @for (r of tailorResults(); track r.pass) {
                      <div class="card wizard-card">
                        <div class="wizard-pass-header">
                          <h4 class="eyebrow">
                            Pass {{ r.pass }} —
                            {{ ['XYZ Rewrite', 'Dual Critique', 'Final Build'][r.pass - 1] }}
                          </h4>
                          @if (r.fromCache) {
                            <span class="badge badge--cache">cached · 0 tokens</span>
                          } @else {
                            <span class="token-info"
                              >{{ r.tokensIn }} in / {{ r.tokensOut }} out</span
                            >
                          }
                        </div>

                        <pre class="wizard-result">{{ r.resultMd }}</pre>

                        @if (r.changes.length) {
                          <details class="wizard-changes">
                            <summary class="eyebrow">Changes ({{ r.changes.length }})</summary>
                            <ul class="change-list">
                              @for (c of r.changes; track c) {
                                <li>{{ c }}</li>
                              }
                            </ul>
                          </details>
                        }

                        @if (r.gaps.length) {
                          <div class="wizard-gaps">
                            <h4 class="eyebrow">Gaps — not addressable from profile</h4>
                            <ul class="gap-list">
                              @for (g of r.gaps; track g) {
                                <li>{{ g }}</li>
                              }
                            </ul>
                          </div>
                        }
                      </div>
                    }

                    <!-- Running -->
                    @if (tailoring()) {
                      <div class="card card--running">
                        <p class="muted">
                          Running Pass {{ tailorResults().length + 1 }}:
                          {{
                            ['XYZ Rewrite', 'Dual Critique', 'Final Build'][tailorResults().length]
                          }}…
                        </p>
                      </div>
                    }

                    <!-- Pass CTAs -->
                    @if (!tailoring() && tailorResults().length > 0 && tailorResults().length < 3) {
                      <div class="row row--mt">
                        <button class="btn btn--primary" (click)="runNextPass()">
                          Continue to Pass {{ tailorResults().length + 1 }}:
                          {{ ['Critique', 'Final Build'][tailorResults().length - 1] }}
                          <lucide-icon [img]="icons.next" [size]="16" aria-hidden="true" />
                        </button>
                        <button class="btn" (click)="resetWizard()">
                          {{ t()('jobs.start_over') }}
                        </button>
                        @if (tailorStatus()) {
                          <span class="status" [class.status--error]="tailorError()">{{
                            tailorStatus()
                          }}</span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>

              <div wizardExportStep>
                <!-- Export (pass 3 done) -->
                @if (!tailoring() && tailorResults().length === 3) {
                  <div class="card wizard-export">
                    <h4 class="eyebrow">{{ t()('jobs.export_section') }}</h4>
                    <div class="row">
                      <button
                        class="btn btn--primary"
                        [disabled]="!!exporting()"
                        (click)="doExport('docx')"
                      >
                        {{
                          exporting() === 'docx' ? t()('jobs.exporting') : t()('jobs.export_docx')
                        }}
                      </button>
                      <button class="btn" [disabled]="!!exporting()" (click)="doExport('pdf')">
                        {{ exporting() === 'pdf' ? t()('jobs.exporting') : t()('jobs.export_pdf') }}
                      </button>
                      <button class="btn" (click)="resetWizard()">
                        {{ t()('jobs.start_over') }}
                      </button>
                    </div>
                    @if (exportStatus()) {
                      <p class="export-path" [class.status--error]="exportError()">
                        {{ exportStatus() }}
                      </p>
                    }
                    @if (lastExport(); as exp) {
                      <div class="export-actions">
                        <button class="btn btn--sm" (click)="openExportedFile(exp.filePath)">
                          {{ t()('jobs.open_file') }}
                        </button>
                        <button class="btn btn--sm" (click)="revealExportedFile(exp.filePath)">
                          {{ t()('jobs.show_folder') }}
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>

              <div wizardApplyStep>
                <div class="card">
                  <h4 class="eyebrow">{{ t()('jobs.wizard.step_apply') }}</h4>
                  <div class="cta">
                    <button class="btn-ghost" [disabled]="actionBusy()" (click)="markApplied()">
                      {{ t()('jobs.mark_applied') }}
                    </button>
                    @if (actionMsg()) {
                      <span class="detail-actions__msg">{{ actionMsg() }}</span>
                    }
                  </div>
                </div>
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
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        resize: vertical;
      }
      .editor:focus {
        outline: none;
        border-color: var(--indigo-500, #6366f1);
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
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
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

      /* Gauge */
      .gauge {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .gauge__number {
        font-size: 3rem;
        font-weight: 700;
        color: var(--indigo-500, #6366f1);
        font-family: var(--font-mono);
        line-height: 1;
      }
      .gauge__sep {
        font-size: var(--text-lg);
        color: var(--text-tertiary);
        font-family: var(--font-mono);
      }
      .gauge__stars {
        font-size: var(--text-xl);
        color: var(--indigo-500, #6366f1);
        font-family: var(--font-mono);
      }
      .gauge__bar-wrap {
        height: 8px;
        background: var(--surface-3);
        border-radius: 4px;
        overflow: hidden;
      }
      .gauge__bar {
        height: 100%;
        background: var(--indigo-500, #6366f1);
        border-radius: 4px;
        transition: width 0.6s ease;
      }

      /* Dimensions */
      .dim-table {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .dim-row {
        display: grid;
        grid-template-columns: 160px 64px 1fr;
        gap: var(--space-3);
        align-items: center;
      }
      .dim-name {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .dim-score {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-primary);
      }
      .dim-bar-wrap {
        height: 4px;
        background: var(--surface-3);
        border-radius: 2px;
      }
      .dim-bar {
        height: 100%;
        background: var(--indigo-500, #6366f1);
        border-radius: 2px;
      }
      .dim-comment {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        grid-column: 2 / -1;
      }

      /* Keywords */
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .chip {
        padding: 2px var(--space-2);
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: var(--text-xs);
        font-family: var(--font-mono);
        color: var(--text-secondary);
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

      /* ATS */
      .ats-pass {
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
      }
      .ats-pass--ok {
        color: var(--success, #4ade80);
      }
      .ats-pass--warn {
        color: var(--danger);
      }

      /* Summary */
      .summary {
        font-size: var(--text-sm);
        line-height: 1.7;
        color: var(--text-secondary);
        font-style: italic;
        border-left: 2px solid var(--indigo-500, #6366f1);
        padding-left: var(--space-3);
        margin: 0;
      }

      /* Before you submit */
      .before-submit summary {
        cursor: pointer;
      }
      .before-submit__list {
        margin: var(--space-3) 0 0;
        padding-left: var(--space-4);
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }
      .before-submit__list li {
        margin-bottom: var(--space-2);
      }

      /* Badges */
      .badge {
        padding: 2px var(--space-2);
        border-radius: 999px;
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        font-family: var(--font-mono);
      }
      .badge--pass {
        background: color-mix(in srgb, var(--success, #4ade80) 15%, transparent);
        color: var(--success, #4ade80);
      }
      .badge--cache {
        background: color-mix(in srgb, var(--indigo-500, #6366f1) 15%, transparent);
        color: var(--indigo-500, #6366f1);
      }
      .badge--warn {
        background: color-mix(in srgb, var(--warning, #fb923c) 15%, transparent);
        color: var(--warning, #fb923c);
      }
      .badge--danger {
        background: color-mix(in srgb, var(--danger, #f87171) 15%, transparent);
        color: var(--danger, #f87171);
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
      .cta {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      /* Wizard */
      .wizard {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        margin-top: var(--space-2);
      }
      .wizard-steps {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3) 0;
      }
      .wizard-step {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-1) var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        opacity: 0.45;
      }
      .wizard-step--done {
        opacity: 1;
        border-color: color-mix(in srgb, var(--indigo-500, #6366f1) 60%, transparent);
      }
      .wizard-step--active {
        opacity: 1;
        border-color: var(--indigo-500, #6366f1);
        background: color-mix(in srgb, var(--indigo-500, #6366f1) 10%, transparent);
      }
      .wizard-step__num {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--indigo-500, #6366f1);
      }
      .wizard-step__label {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .wizard-step__sep {
        color: var(--text-quaternary, var(--text-tertiary));
        font-size: var(--text-xs);
      }
      .wizard-card {
        gap: var(--space-3);
      }
      .wizard-pass-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .wizard-result {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        line-height: 1.7;
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        max-height: 320px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
      }
      .wizard-changes summary {
        cursor: pointer;
        user-select: none;
        padding: var(--space-1) 0;
      }
      .change-list,
      .gap-list {
        list-style: none;
        padding: 0;
        margin: var(--space-2) 0 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .change-list li::before {
        content: '✓ ';
        color: var(--success, #4ade80);
      }
      .gap-list li::before {
        content: '⚠ ';
        color: var(--warning, #fb923c);
      }
      .change-list li,
      .gap-list li {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .wizard-gaps {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .wizard-export {
        gap: var(--space-3);
      }
      .export-path {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        word-break: break-all;
        margin: 0;
      }
      .card--running {
        border-style: dashed;
        opacity: 0.8;
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

      .portal__questions,
      .portal__answers {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .portal__q-input {
        flex: 1;
      }
      .portal__lang-label {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .token-info {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
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
        filter: brightness(1.15);
      }
      .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .btn--primary {
        background: var(--indigo-500, #6366f1);
        color: #fff;
        border-color: var(--indigo-500, #6366f1);
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

  protected readonly icons = {
    empty: Search,
    atsPass: Check,
    atsFail: X,
    stepSep: ChevronRight,
    next: ArrowRight,
    copy: Copy,
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
    await this.setApplied(false);
  }

  /** Mark as Applied: same, plus the applied date and an auto follow-up date. */
  async markApplied(): Promise<void> {
    await this.setApplied(true);
  }

  private async setApplied(withDates: boolean): Promise<void> {
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
      if (withDates) {
        const today = new Date().toISOString().slice(0, 10);
        const days = this.settings()?.followupDaysAfterApply ?? 7;
        patch.appliedAt = today;
        patch.followUpAt = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      }
      const app = await this.db.upsertApplication(patch);
      this.application.set(app);
      this.actionMsg.set(this.t()(withDates ? 'jobs.applied_ok' : 'jobs.pipeline_ok'));
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

import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ApplicationStatus, Job, ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { Stepper } from '@applye/ui';
import {
  JobDetailIcons,
  dimensionBand,
  parseDimensions,
  scoreVerdictKey,
  scoreVerdictLabelKey,
} from './scoring.utils';

@Component({
  selector: 'app-apply-wizard',
  standalone: true,
  imports: [LucideAngularModule, Stepper],
  template: `
    <div class="apply-wizard">
      <div class="apply-wizard__rail">
        <lib-stepper [steps]="stepLabels()" [activeIndex]="activeStep()" />
      </div>

      <div class="apply-wizard__content">
        @switch (activeStep()) {
          @case (0) {
            <!-- Compact review — NOT the full Job Detail scoring page. -->
            @if (cache(); as c) {
              <div class="wizard-review">
                <div class="wizard-review__top">
                  <div class="card wizard-review__score">
                    <span class="wizard-review__score-num">{{ c.score }}</span>
                    <span class="wizard-review__score-max">/100</span>
                    <span class="verdict-badge" [class]="'verdict-badge--' + verdictKey(c.score)">
                      <span class="verdict-badge__dot"></span>
                      {{ t()(verdictLabelKey(c.score)) }}
                    </span>
                  </div>
                  <div class="card wizard-review__verdict">
                    <span class="eyebrow">{{ t()('jobs.recruiter_verdict_eyebrow') }}</span>
                    @if (c.summary) {
                      <p class="wizard-review__verdict-quote">{{ c.summary }}</p>
                    }
                    <span class="cache-chip">
                      <lucide-icon [img]="icons().db" [size]="11" aria-hidden="true" />
                      @if (fromCache()) {
                        {{ t()('jobs.cached_badge') }}
                      } @else {
                        {{ (c.tokensInput ?? 0) + (c.tokensOutput ?? 0) }}
                        {{ t()('jobs.tokens_used') }}
                      }
                    </span>
                  </div>
                </div>

                @if (dims(c).length) {
                  <div class="wizard-review__dims">
                    @for (d of dims(c); track d.name) {
                      <div class="card wizard-review__dim">
                        <div class="wizard-review__dim-head">
                          <span class="wizard-review__dim-name">{{ d.name }}</span>
                          <span class="wizard-review__dim-score" [class]="'score-' + band(d.score)"
                            >{{ d.score }}/10</span
                          >
                        </div>
                        <div class="wizard-review__dim-bar-track">
                          <div
                            class="wizard-review__dim-bar-fill"
                            [class]="'score-' + band(d.score)"
                            [style.width.%]="d.score * 10"
                          ></div>
                        </div>
                        @if (d.comment) {
                          <p class="wizard-review__dim-comment">{{ d.comment }}</p>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          }
          @case (1) {
            <ng-content select="[wizardTailorStep]" />
          }
          @case (2) {
            <ng-content select="[wizardExportApplyStep]" />
          }
        }
      </div>

      <footer class="apply-wizard__footer">
        <button class="btn btn--secondary btn--md" type="button" (click)="goBack()">
          <lucide-icon [img]="icons().back" [size]="15" aria-hidden="true" />
          {{ activeStep() === 0 ? t()('jobs.wizard.back_to_summary') : t()('common.back') }}
        </button>
        <span class="apply-wizard__step-of">
          {{ t()('jobs.wizard.step_word') }} {{ activeStep() + 1 }}
          {{ t()('jobs.wizard.step_progress_of') }}
        </span>
        <span class="apply-wizard__spacer"></span>
        @if (activeStep() === lastStep) {
          @if (applicationStatus() === 'applied') {
            <span class="badge badge--pass">
              <lucide-icon [img]="icons().checkCircle" [size]="12" aria-hidden="true" />
              {{ t()('jobs.applied_badge') }}
            </span>
            <button class="btn btn--secondary btn--sm" type="button" (click)="changeStatus.emit()">
              {{ t()('jobs.change_status_action') }}
            </button>
          } @else {
            <button class="btn btn--primary btn--md" type="button" (click)="markApplied.emit()">
              <lucide-icon [img]="icons().checkCircle" [size]="15" aria-hidden="true" />
              {{ t()('jobs.wizard.mark_as_applied') }}
            </button>
          }
        } @else {
          <button class="btn btn--primary btn--md" type="button" (click)="goNext()">
            {{
              activeStep() === lastStep - 1
                ? t()('jobs.wizard.continue_label')
                : t()('jobs.wizard.next_label')
            }}
            <lucide-icon [img]="icons().next" [size]="15" aria-hidden="true" />
          </button>
        }
      </footer>
    </div>
  `,
  styleUrl: './apply-wizard.component.scss',
})
export class ApplyWizard {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  /** 3 steps: Review score (0) → Tailor CV (1) → Export & apply (2). */
  protected readonly lastStep = 2;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  readonly job = input<Job | null>(null);
  readonly jobTitle = input<string>('');
  readonly company = input<string>('');
  readonly applicationStatus = input<ApplicationStatus | null>(null);
  readonly icons = input.required<JobDetailIcons>();

  readonly closeWizard = output<void>();
  readonly markApplied = output<void>();
  readonly changeStatus = output<void>();

  readonly activeStep = signal(0);

  protected readonly stepLabels = computed(() => [
    this.t()('jobs.wizard.step_review_score'),
    this.t()('jobs.wizard.step_tailor_cv'),
    this.t()('jobs.wizard.step_export_apply'),
  ]);

  protected readonly dims = parseDimensions;
  protected readonly band = dimensionBand;
  protected readonly verdictKey = scoreVerdictKey;
  protected readonly verdictLabelKey = scoreVerdictLabelKey;

  protected goBack(): void {
    if (this.activeStep() === 0) {
      this.closeWizard.emit();
      return;
    }
    this.activeStep.update((n) => Math.max(0, n - 1));
  }

  protected goNext(): void {
    this.activeStep.update((n) => Math.min(this.lastStep, n + 1));
  }
}

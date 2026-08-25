import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ApplicationStatus, Job, ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { Stepper } from '@applye/ui';
import {
  JobDetailIcons,
  applicationStatusBadgeClass,
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
            <!-- Compact review - NOT the full Job Detail scoring page. -->
            @if (reviewScore(); as c) {
              <div class="wizard-review">
                <div class="wizard-review__top">
                  <div class="card wizard-review__score">
                    <span class="wizard-review__score-num">{{ c.score }}</span>
                    <span class="wizard-review__score-max">% match</span>
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
                      @if (postTailorScore()) {
                        <lucide-icon [img]="icons().wand" [size]="11" aria-hidden="true" />
                        {{ t()('jobs.wizard.updated_after_tailor') }}
                      } @else {
                        <lucide-icon [img]="icons().db" [size]="11" aria-hidden="true" />
                        @if (fromCache()) {
                          {{ t()('jobs.cached_badge') }}
                        } @else {
                          {{ (c.tokensInput ?? 0) + (c.tokensOutput ?? 0) }}
                          {{ t()('jobs.tokens_used') }}
                        }
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
                            >{{ d.score * 10 }}%</span
                          >
                        </div>
                        <div class="wizard-review__dim-bar-track">
                          <div
                            class="wizard-review__dim-bar-fill"
                            [class]="'score-' + band(d.score)"
                            [style.transform]="'scaleX(' + d.score / 10 + ')'"
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
            <ng-content select="[wizardUpdateScoreStep]" />
          }
          @case (3) {
            <ng-content select="[wizardDocumentsStep]" />
          }
          @case (4) {
            <ng-content select="[wizardExportApplyStep]" />
          }
        }
      </div>

      <footer class="apply-wizard__footer">
        <button
          class="btn btn--secondary btn--md"
          type="button"
          [disabled]="busy()"
          (click)="goBack()"
        >
          <lucide-icon [img]="icons().back" [size]="15" aria-hidden="true" />
          {{ activeStep() === 0 ? t()('jobs.wizard.back_to_summary') : t()('common.back') }}
        </button>
        <button
          class="btn btn--ghost btn--md"
          type="button"
          [disabled]="busy()"
          (click)="discard.emit()"
        >
          {{ t()('jobs.wizard.discard') }}
        </button>
        <span class="apply-wizard__step-of">
          {{ t()('jobs.wizard.step_word') }} {{ activeStep() + 1 }}
          {{ t()('jobs.wizard.step_progress_of') }}
        </span>
        <span class="apply-wizard__spacer"></span>
        @if (activeStep() === lastStep) {
          @if (canMarkApplied()) {
            @if (!busy() && !hasLinkedCv()) {
              <span class="apply-wizard__create-hint">
                {{ t()('jobs.wizard.create_application_needs_cv') }}
                <button class="btn btn--ghost btn--sm" type="button" (click)="goToDocuments()">
                  {{ t()('jobs.wizard.create_application_needs_cv_link') }}
                </button>
              </span>
            }
            <button
              class="btn btn--primary btn--md"
              type="button"
              [disabled]="busy() || !hasLinkedCv()"
              (click)="createApplication.emit()"
            >
              <lucide-icon [img]="icons().checkCircle" [size]="15" aria-hidden="true" />
              {{ busy() ? t()('jobs.wizard.applying') : t()('jobs.wizard.create_application') }}
            </button>
          } @else if (applicationStatus(); as status) {
            <span class="badge" [class]="statusBadgeClass(status)">
              {{ t()('status.' + status) }}
            </span>
            <button
              class="btn btn--primary btn--md"
              type="button"
              [disabled]="busy()"
              (click)="updateApplication.emit()"
            >
              <lucide-icon [img]="icons().checkCircle" [size]="15" aria-hidden="true" />
              {{ busy() ? t()('jobs.wizard.applying') : t()('jobs.wizard.update_application') }}
            </button>
          }
        } @else {
          <button
            class="btn btn--primary btn--md"
            type="button"
            [disabled]="busy()"
            (click)="goNext()"
          >
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplyWizard {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  /** 5 steps: Review score (0) → Tailor CV (1) → Updated score (2) →
   * Review documents (3) → Export & apply (4). */
  protected readonly lastStep = 4;
  private readonly documentsStep = 3;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  /** Post-tailor rescore, if the user ran one - takes over as the review
   * number once present, so Review Score always shows the current best
   * known fit instead of a stale pre-tailor figure. */
  readonly postTailorScore = input<ScoringCache | null>(null);
  protected readonly reviewScore = computed(() => this.postTailorScore() ?? this.cache());
  readonly job = input<Job | null>(null);
  readonly jobTitle = input<string>('');
  readonly company = input<string>('');
  readonly applicationStatus = input<ApplicationStatus | null>(null);
  /** Whether a CV is linked to this application - Create Application needs
   * one to commit; without it there is nothing to attach. */
  readonly hasLinkedCv = input<boolean>(false);
  readonly initialStep = input<number>(0);
  /** True while a step's async work is in flight (tailoring, rescoring,
   * document generation). Blocks Next/Continue so the user cannot advance
   * to a step whose input is not ready yet. */
  readonly busy = input<boolean>(false);
  readonly icons = input.required<JobDetailIcons>();

  readonly closeWizard = output<void>();
  /** Abandon this job's tailoring entirely (the parent confirms first). */
  readonly discard = output<void>();
  /** "Create Application" - saves the application and commits documents.
   * Deliberately not "apply": the user presses Apply themselves, once, on the
   * job summary screen after actually submitting the employer's form (`P1`). */
  readonly createApplication = output<void>();
  /** Commit the re-tailored resume for a job that already has a status
   * (applied/interview/…) - persists the updated score and confirms. */
  readonly updateApplication = output<void>();
  /** Emitted whenever the active step changes - lets the parent kick off
   * work tied to a step (e.g. auto-rescore on entering the Updated score
   * step) without the wizard knowing what that work is. */
  readonly stepChange = output<number>();

  readonly activeStep = signal(0);

  constructor() {
    effect(() => {
      const next = Math.max(0, Math.min(this.lastStep, this.initialStep()));
      if (untracked(() => this.activeStep()) !== next) this.activeStep.set(next);
    });
  }

  protected readonly stepLabels = computed(() => [
    this.t()('jobs.wizard.step_review_score'),
    this.t()('jobs.wizard.step_tailor_cv'),
    this.t()('jobs.wizard.step_updated_score'),
    this.t()('jobs.wizard.step_review_documents'),
    this.t()('jobs.wizard.step_export_apply'),
  ]);

  protected readonly dims = parseDimensions;
  protected readonly band = dimensionBand;
  protected readonly verdictKey = scoreVerdictKey;
  protected readonly verdictLabelKey = scoreVerdictLabelKey;
  protected readonly statusBadgeClass = applicationStatusBadgeClass;

  /** Mirrors JobsComponent.canMarkApplied - same gate, same reasoning. */
  protected readonly canMarkApplied = computed(() => {
    const status = this.applicationStatus();
    return !status || status === 'saved';
  });

  protected goBack(): void {
    if (this.busy()) return;
    if (this.activeStep() === 0) {
      this.closeWizard.emit();
      return;
    }
    const next = Math.max(0, this.activeStep() - 1);
    this.activeStep.set(next);
    this.stepChange.emit(next);
  }

  protected goNext(): void {
    if (this.busy()) return;
    const next = Math.min(this.lastStep, this.activeStep() + 1);
    this.activeStep.set(next);
    this.stepChange.emit(next);
  }

  /** The "link or create a CV" hint's own jump - back to Review documents,
   * from the last step, without walking the Next/Back chain. */
  protected goToDocuments(): void {
    if (this.busy()) return;
    this.activeStep.set(this.documentsStep);
    this.stepChange.emit(this.documentsStep);
  }
}

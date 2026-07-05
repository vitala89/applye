import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Job, ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { Stepper } from '@applye/ui';
import { JobDetailIcons } from './scoring.utils';
import { ScoringView } from './scoring-view.component';

@Component({
  selector: 'app-apply-wizard',
  standalone: true,
  imports: [LucideAngularModule, Stepper, ScoringView],
  template: `
    <div class="apply-wizard">
      <div class="apply-wizard__rail">
        <lib-stepper [steps]="stepLabels()" [activeIndex]="activeStep()" />
        <button
          class="btn btn--secondary btn--sm apply-wizard__close"
          type="button"
          (click)="closeWizard.emit()"
        >
          <lucide-icon [img]="icons().close" [size]="14" aria-hidden="true" />
          {{ t()('jobs.wizard.close') }}
        </button>
      </div>

      <div class="apply-wizard__content">
        @switch (activeStep()) {
          @case (0) {
            <app-scoring-view
              [cache]="cache()"
              [fromCache]="fromCache()"
              [job]="job()"
              [icons]="icons()"
            />
          }
          @case (1) {
            <ng-content select="[wizardTailorStep]" />
          }
          @case (2) {
            <ng-content select="[wizardExportStep]" />
          }
          @case (3) {
            <ng-content select="[wizardApplyStep]" />
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
          <button class="btn btn--primary btn--md" type="button" (click)="markApplied.emit()">
            <lucide-icon [img]="icons().checkCircle" [size]="15" aria-hidden="true" />
            {{ t()('jobs.wizard.mark_as_applied') }}
          </button>
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

  protected readonly lastStep = 3;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  readonly job = input<Job | null>(null);
  readonly jobTitle = input<string>('');
  readonly company = input<string>('');
  readonly icons = input.required<JobDetailIcons>();

  readonly closeWizard = output<void>();
  readonly markApplied = output<void>();

  readonly activeStep = signal(0);

  protected readonly stepLabels = computed(() => [
    this.t()('jobs.wizard.step_review_score'),
    this.t()('jobs.wizard.step_tailor_cv'),
    this.t()('jobs.wizard.step_export'),
    this.t()('jobs.wizard.step_apply'),
  ]);

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

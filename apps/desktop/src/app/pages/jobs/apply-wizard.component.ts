import { Component, computed, inject, input, signal } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';
import { ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { Stepper } from '@applye/ui';
import { ScoringView } from './scoring-view.component';

@Component({
  selector: 'app-apply-wizard',
  standalone: true,
  imports: [LucideAngularModule, Stepper, ScoringView],
  template: `
    <div class="apply-wizard">
      <lib-stepper
        [steps]="stepLabels()"
        [activeIndex]="activeStep()"
        [backLabel]="t()('common.back')"
        [nextLabel]="t()('common.next')"
        (back)="goBack()"
        (next)="goNext()"
      />

      @switch (activeStep()) {
        @case (0) {
          <app-scoring-view
            [cache]="cache()"
            [fromCache]="fromCache()"
            [atsPassIcon]="atsPassIcon()"
            [atsFailIcon]="atsFailIcon()"
          />
        }
        @case (1) {
          <ng-content select="[wizardPortalStep]" />
        }
        @case (2) {
          <ng-content select="[wizardTailorStep]" />
        }
        @case (3) {
          <ng-content select="[wizardExportStep]" />
        }
        @case (4) {
          <ng-content select="[wizardApplyStep]" />
        }
      }
    </div>
  `,
})
export class ApplyWizard {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  readonly atsPassIcon = input.required<LucideIconData>();
  readonly atsFailIcon = input.required<LucideIconData>();

  readonly activeStep = signal(0);

  protected readonly stepLabels = computed(() => [
    this.t()('jobs.wizard.step_review_score'),
    this.t()('jobs.wizard.step_portal_answers'),
    this.t()('jobs.wizard.step_tailor_cv'),
    this.t()('jobs.wizard.step_export'),
    this.t()('jobs.wizard.step_apply'),
  ]);

  protected goBack(): void {
    this.activeStep.update((n) => Math.max(0, n - 1));
  }

  protected goNext(): void {
    this.activeStep.update((n) => Math.min(4, n + 1));
  }
}

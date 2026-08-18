import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Calendar, Check, LucideAngularModule } from 'lucide-angular';
import { stageDone, stageIsCurrent, stageReached } from '@applye/application';
import { InterviewStage } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * The segmented stage rail inside the quick view, and nothing else: the branch
 * that runs when an interview application has stages to draw. The empty, the
 * loading, the failed-read and the quick-add branches all stay on the modal,
 * because they are a decision about what to show rather than a way of showing
 * stages, and `showQuickAdd`'s gate reads the modal's own `card()` input
 * (ADR-0005, amendment thirty-one).
 *
 * **A view with no view of the store.** It takes the ordered list and which
 * stage is current, both already resolved by `QuickViewStore`; the three
 * predicates below are the same pure functions the modal called, kept here
 * because they say how a row is drawn rather than which rows exist.
 */
@Component({
  selector: 'app-interview-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './interview-stepper.component.html',
  styleUrl: './interview-stepper.component.scss',
})
export class InterviewStepperComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly stages = input.required<InterviewStage[]>();
  /** The stage the funnel has reached, as `QuickViewStore` picked it. */
  readonly current = input.required<InterviewStage | null>();

  readonly viewAll = output<void>();

  protected readonly icons = { check: Check, calendar: Calendar };

  protected stageDone(stage: InterviewStage): boolean {
    return stageDone(stage);
  }

  protected stageCurrent(stage: InterviewStage): boolean {
    return stageIsCurrent(stage, this.current());
  }

  protected stageReached(stage: InterviewStage): boolean {
    return stageReached(stage, this.current());
  }

  protected formatStageDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
}

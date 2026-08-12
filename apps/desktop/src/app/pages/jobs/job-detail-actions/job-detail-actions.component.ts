import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Application } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobActionsService } from '@applye/application';
import { JOB_DETAIL_ICONS } from '../job-detail-icons';
import { applicationStatusBadgeClass } from '../scoring.utils';

/**
 * The action row above a job: save it, mark it applied, jump to its documents,
 * delete it - plus the status and tailored badges.
 *
 * `JobActionsService` is injected because the busy flag, the applying flag and
 * the status message are its own, and the page provides it component-scoped.
 * Everything the row can only *ask* for is an output: all four of these either
 * navigate, write page state, or run the document commit, and none of that is
 * a toolbar's business. That is the same split `onboarding-resume-step` uses
 * for its one `fileRequested` output.
 */
@Component({
  selector: 'app-job-detail-actions',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './job-detail-actions.component.html',
  styleUrl: './job-detail-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobDetailActionsComponent {
  protected readonly jobActions = inject(JobActionsService);
  protected readonly t = inject(TranslateService).t;
  protected readonly icons = JOB_DETAIL_ICONS;
  protected readonly statusBadgeClass = applicationStatusBadgeClass;

  readonly application = input<Application | null>(null);
  /** Locked exactly when Mark-as-Applied is not available; the page owns that
   * rule because it also depends on the editing override. */
  readonly canMarkApplied = input(false);
  readonly isTailored = input(false);

  readonly saveRequested = output<void>();
  readonly markAppliedRequested = output<void>();
  readonly deleteRequested = output<void>();
  readonly cvRequested = output<number>();
  readonly coverLetterRequested = output<number>();
}

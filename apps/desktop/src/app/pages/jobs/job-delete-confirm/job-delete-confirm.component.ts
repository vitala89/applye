import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { JobActionsService } from '@applye/application';
import { JOB_DETAIL_ICONS } from '../job-detail-icons';

/**
 * The inline confirm for deleting a job. Not a modal - it is an `.alert` that
 * takes the place of the action row, which is why it does not share the modal
 * shell its neighbours use.
 *
 * Open/close and the in-flight flag come from `JobActionsService`, which the
 * page provides. Deleting itself is the page's: it navigates away afterwards,
 * and routing is not this component's business.
 */
@Component({
  selector: 'app-job-delete-confirm',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './job-delete-confirm.component.html',
  styleUrl: './job-delete-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobDeleteConfirmComponent {
  protected readonly jobActions = inject(JobActionsService);
  protected readonly t = inject(TranslateService).t;
  protected readonly icons = JOB_DETAIL_ICONS;

  readonly confirmed = output<void>();
}

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { WizardNavService } from '../../../shared/wizard-nav.service';

/**
 * "You have unfinished tailoring on another job" - the gate that stops opening
 * the wizard here from silently abandoning it somewhere else.
 *
 * It injects `WizardNavService` rather than taking its state as inputs, the
 * convention this folder already follows (see `job-document-cards`): the page
 * provides that service component-scoped, so a child rendered inside its
 * template inherits the same instance and reads the same signals.
 *
 * The job id is an input because it is the page's, not the service's, and
 * confirming needs it.
 */
@Component({
  selector: 'app-job-cross-job-confirm',
  standalone: true,
  templateUrl: './job-cross-job-confirm.component.html',
  styleUrl: './job-cross-job-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobCrossJobConfirmComponent {
  protected readonly wizardNav = inject(WizardNavService);
  protected readonly t = inject(TranslateService).t;

  readonly jobId = input<number | undefined>(undefined);

  protected confirm(): void {
    this.wizardNav.confirmCrossJob(this.jobId());
  }
}

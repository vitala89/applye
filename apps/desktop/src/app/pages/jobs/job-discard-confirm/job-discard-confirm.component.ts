import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { TailoringDiscardService } from '../../../shared/tailoring-discard.service';

/**
 * Abandoning the tailoring throws away generated drafts, so it asks first and
 * says exactly what is lost.
 *
 * The confirm's own state is `TailoringDiscardService`'s, which the page
 * provides. Discarding is the page's: it also resets the job-scoped state and
 * forgets the wizard's saved progress, neither of which is this dialog's.
 */
@Component({
  selector: 'app-job-discard-confirm',
  standalone: true,
  templateUrl: './job-discard-confirm.component.html',
  styleUrl: './job-discard-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobDiscardConfirmComponent {
  protected readonly discard = inject(TailoringDiscardService);
  protected readonly t = inject(TranslateService).t;

  readonly confirmed = output<void>();
}

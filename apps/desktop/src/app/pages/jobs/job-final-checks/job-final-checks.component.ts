import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { FinalCheckStatus, FinalChecksService } from '../../../shared/final-checks.service';
import { LinkedDocumentsService } from '../../../shared/linked-documents.service';
import { JOB_DETAIL_ICONS } from '../job-detail-icons';

/**
 * The wizard's final-checks card: the three token-free verdicts, their notes,
 * and the two recovery actions a bad verdict offers.
 *
 * Extracted from the jobs page along with the documents step that contains it.
 * Everything it renders comes from `FinalChecksService` and
 * `LinkedDocumentsService`, both provided component-scoped by the page, so it
 * injects them rather than taking eight inputs.
 *
 * All three actions are emitted, not run. `runChecks` needs `FinalCheckInputs`,
 * which carries the job description text the page owns; `rescore` spends
 * tokens; and `retailor` restarts the tailoring pipeline and walks the wizard
 * back to step 1. None of that is this card's to decide.
 */
@Component({
  selector: 'app-job-final-checks',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './job-final-checks.component.html',
  styleUrl: './job-final-checks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobFinalChecksComponent {
  private readonly i18n = inject(TranslateService);
  private readonly finalChecksSvc = inject(FinalChecksService);
  private readonly linkedDocs = inject(LinkedDocumentsService);

  protected readonly t = this.i18n.t;
  protected readonly icons = JOB_DETAIL_ICONS;

  /** True while a tailoring run is in flight, which disables the re-tailor
   * button and swaps its label. Derived on the page from `WizardActivity`. */
  readonly tailoring = input.required<boolean>();

  readonly runChecks = output<void>();
  readonly rescore = output<void>();
  readonly retailor = output<void>();

  protected readonly checks = this.finalChecksSvc.checks;
  protected readonly outdated = this.finalChecksSvc.outdated;
  protected readonly linkedCv = this.linkedDocs.cv;

  protected readonly statusKey = this.finalChecksSvc.statusKey.bind(this.finalChecksSvc);

  protected readonly needRetailor = computed(() =>
    this.finalChecksSvc.needRetailor(this.linkedCv()),
  );

  /** An outdated result reads as "outdated" on every row rather than showing
   * three verdicts that were computed against documents that have since moved. */
  protected rowStatus(status: FinalCheckStatus | undefined): string {
    return this.statusKey(this.outdated() ? 'outdated' : (status ?? 'not_run'));
  }
}

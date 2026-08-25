import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DocumentLibraryItem, Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { TailoringService } from '@applye/application';
import { WizardActivityService } from '@applye/application';
import { classifyChangeType } from '../scoring.utils';
import { currentPhaseKey, tailorPhases } from '../tailor-phases';
import { JOB_DETAIL_ICONS } from '../job-detail-icons';

/**
 * The wizard's tailor step: the three phase cards, the base-CV picker that
 * starts a run, the in-flight line with its cancel, and the change and gap
 * notes a finished run produced.
 *
 * Extracted from the jobs page, which is over budget in its template, its class
 * and its stylesheet at once. Everything this renders comes from
 * `TailoringService`, which the page provides component-scoped, so it injects
 * that directly rather than taking it as inputs - which is what removes the
 * seven declarations the page kept only so its template could name them.
 *
 * Deliberately starts nothing. `startTailoring`, `cancelTailoring` and the
 * re-tailor path each continue into page state this step knows nothing about -
 * the export status, the post-tailor rescore, the linked documents - so the
 * step emits and the page decides.
 */
@Component({
  selector: 'app-job-tailor-step',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './job-tailor-step.component.html',
  styleUrl: './job-tailor-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobTailorStepComponent {
  private readonly i18n = inject(TranslateService);
  private readonly tailorSvc = inject(TailoringService);
  private readonly activity = inject(WizardActivityService);

  protected readonly t = this.i18n.t;
  protected readonly icons = JOB_DETAIL_ICONS;
  protected readonly changeType = classifyChangeType;

  readonly job = input.required<Job | null>();
  /** The base-CV choices for this job, already narrowed by the page. */
  readonly matchingCvs = input.required<DocumentLibraryItem[]>();
  /** Whether the profile carries enough text to tailor from scratch. Without
   * it and without a base CV, there is nothing to tailor. */
  readonly hasProfileText = input.required<boolean>();
  readonly selectedBaseCvId = input.required<number | null>();

  readonly baseCvChange = output<number | null>();
  readonly startTailoring = output<void>();
  readonly cancelTailoring = output<void>();
  /** "Use an existing resume instead" - jumps straight to Review documents so
   * the user can attach a library CV without tailoring at all. The page owns
   * the jump; this step only knows it was asked for. */
  readonly useExisting = output<void>();
  /** "Tailor again" on a finished run: the page resets the wizard, because the
   * rescore and the export state go stale with it. */
  readonly retailor = output<void>();

  protected readonly tailorResults = this.tailorSvc.results;
  protected readonly tailorCancelled = this.tailorSvc.cancelled;
  protected readonly tailorStatus = this.tailorSvc.status;
  protected readonly tailorError = this.tailorSvc.error;
  protected readonly allChanges = this.tailorSvc.allChanges;
  protected readonly allGaps = this.tailorSvc.allGaps;

  /** Open by default: a finished run's changes are the point of the step. */
  protected readonly changesOpen = signal(true);

  protected readonly tailoring = computed(() =>
    this.activity.isRunning(this.job()?.id ?? -1, 'tailoring'),
  );

  protected readonly tailorPhases = computed(() =>
    tailorPhases(this.tailorResults().length, this.tailoring()),
  );

  protected readonly currentPhaseKey = computed(() => currentPhaseKey(this.tailorResults().length));

  /** The select hands back a string, and an empty one means "from scratch"
   * rather than the id 0 a bare `+` would produce. */
  protected onBaseCvChange(value: string | number | null): void {
    this.baseCvChange.emit(value === null || value === '' ? null : +value);
  }
}

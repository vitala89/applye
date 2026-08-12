import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { SkeletonCard } from '@applye/ui';
import { JobScoringService } from '../../../shared/job-scoring.service';
import { TailorScoreService } from '@applye/application';
import { UpdatedScoreView } from '../updated-score-view.component';
import { JOB_DETAIL_ICONS } from '../job-detail-icons';

/**
 * The wizard's updated-score step: the skeleton while the post-tailor rescore
 * runs, the before/after card once it lands, and the retry line when it failed.
 *
 * Extracted from the jobs page, which is over budget in its template and its
 * class at once. The before score and the ATS report come from
 * `JobScoringService`, which the page provides component-scoped; the rescore
 * state comes from the root `TailorScoreService`, keyed by job so an in-flight
 * run survives leaving the page. Injecting both is what retires the page's
 * `atsReport`, `updateScoreStatus` and `updateScoreError` aliases.
 *
 * Retry is emitted rather than run: `updateScoreAfterTailor()` snapshots the
 * profile, the settings, the job description and the third tailoring pass -
 * page state this step knows nothing about.
 */
@Component({
  selector: 'app-job-update-score-step',
  standalone: true,
  imports: [LucideAngularModule, SkeletonCard, UpdatedScoreView],
  templateUrl: './job-update-score-step.component.html',
  styleUrl: './job-update-score-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobUpdateScoreStepComponent {
  private readonly i18n = inject(TranslateService);
  private readonly scoreSvc = inject(JobScoringService);
  private readonly tailorScore = inject(TailorScoreService);

  protected readonly t = this.i18n.t;
  protected readonly icons = JOB_DETAIL_ICONS;

  readonly job = input.required<Job | null>();

  /** Re-running the rescore is the page's - it costs tokens and needs context
   * this step does not hold. */
  readonly retry = output<void>();

  private readonly jobId = computed(() => this.job()?.id ?? -1);

  protected readonly cache = this.scoreSvc.cache;
  protected readonly atsReport = this.scoreSvc.atsReport;
  protected readonly postTailorScore = computed(() => this.tailorScore.resultFor(this.jobId()));
  protected readonly updatingScore = computed(() => this.tailorScore.isRunningFor(this.jobId()));
  protected readonly updateScoreStatus = computed(() => this.tailorScore.statusFor(this.jobId()));
  protected readonly updateScoreError = computed(() => this.tailorScore.isErrorFor(this.jobId()));
}

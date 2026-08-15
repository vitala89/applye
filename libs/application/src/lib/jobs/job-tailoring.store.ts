import { Injectable, inject } from '@angular/core';
import { JobDetailStore } from './job-detail.store';
import { JobScoringService } from './job-scoring.service';
import { TailorContext, TailoringService } from './tailoring.service';

/**
 * The three-pass tailoring pipeline, scoped to the job open on the detail
 * screen.
 *
 * `TailoringService` takes a `TailorContext` on every call and holds none of it,
 * which is the right shape for a service that also runs from other screens - but
 * it means the seven-field record has to be assembled somewhere, and it was
 * assembled on the page. This store is that somewhere.
 *
 * It exists ahead of the rest of the tailoring block moving here, and
 * deliberately: `restoreFromCache` runs during a job load, so the lifecycle
 * store needs the context now. Writing the assembly on the page for one more
 * pull request would mean writing it twice.
 */
@Injectable()
export class JobTailoringStore {
  private readonly detail = inject(JobDetailStore);
  private readonly scoring = inject(JobScoringService);
  private readonly svc = inject(TailoringService);

  /**
   * Re-hydrate `results` from `tailoring_cache`, so returning to a
   * previously-tailored job shows its Tailored state - the badge and the
   * Retailor action - without re-running any AI. Replays the exact per-pass
   * input hashes `runTailorPass` uses and stops at the first pass with no
   * cached row.
   */
  restoreFromCache(): Promise<void> {
    return this.svc.restoreFromCache(this.context());
  }

  /** Run the three passes against the job now open. The state a run
   * invalidates but does not own is the caller's to clear first. */
  run(): Promise<void> {
    return this.svc.run(this.context());
  }

  /**
   * Cancel an in-flight run. The AI pass already in flight cannot be aborted
   * mid-request, so it finishes, but the loop stops before the next pass and
   * every partial result is discarded - the wizard returns to the pre-tailor
   * state so the user can adjust the source and try again.
   */
  cancel(): void {
    this.svc.cancel(this.detail.job()?.id);
  }

  /** Everything tailoring this job depends on, read at call time. */
  private context(): TailorContext {
    return {
      job: this.detail.job(),
      profile: this.detail.profile(),
      settings: this.detail.settings(),
      jdText: this.detail.jdText(),
      scoring: this.scoring.cache(),
      baseCvId: this.detail.selectedBaseCvId(),
      matchingCvs: this.detail.matchingCvs(),
    };
  }

  /**
   * Drop the tailoring state when the screen moves to another job.
   *
   * `cancelled` is cleared separately from `reset()` because it is not part of
   * a run - it records that the **user** stopped one, and it survives the reset
   * that ends that run so the page can say so. Moving to a different job is the
   * one moment that is no longer true.
   */
  reset(): void {
    this.svc.reset();
    this.svc.cancelled.set(false);
  }
}

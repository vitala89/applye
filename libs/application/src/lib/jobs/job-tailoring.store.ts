import { Injectable, inject } from '@angular/core';
import { DocumentExportService } from '../documents/document-export.service';
import { FinalChecksService } from './final-checks.service';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentsStore } from './job-documents.store';
import { JobScoringService } from './job-scoring.service';
import { JobScoringStore } from './job-scoring.store';
import { TailorScoreService } from './tailor-score.service';
import { TailorContext, TailoringService } from './tailoring.service';
import { WizardNavService } from './wizard-nav.service';

/**
 * The three-pass tailoring pipeline, scoped to the job open on the detail
 * screen.
 *
 * `TailoringService` takes a `TailorContext` on every call and holds none of it,
 * which is the right shape for a service that also runs from other screens - but
 * it means the seven-field record has to be assembled somewhere, and it was
 * assembled on the page. This store is that somewhere.
 *
 * It was created ahead of the rest of the tailoring block, deliberately:
 * `restoreFromCache` runs during a job load, so the lifecycle store needed the
 * context one pull request early. The block has now followed it here - the run,
 * the wizard's step machine, and the two resets.
 *
 * The arrow to `JobScoringStore` runs one way. Nothing here is reachable from
 * there: `parseAndFilter` is the one call that spans both, and it stays on the
 * page for exactly that reason.
 */
@Injectable()
export class JobTailoringStore {
  private readonly detail = inject(JobDetailStore);
  private readonly scoring = inject(JobScoringService);
  private readonly svc = inject(TailoringService);
  /** Wizard steps auto-run the rescore and commit it. */
  private readonly score = inject(JobScoringStore);
  /** The documents step prepares its drafts on entry. */
  private readonly docs = inject(JobDocumentsStore);
  private readonly nav = inject(WizardNavService);
  /** The before/after rescore, cleared by a run and by a reset. */
  private readonly tailorScore = inject(TailorScoreService);
  /** The export status line, invalidated by a run and by a reset. */
  private readonly exportSvc = inject(DocumentExportService);
  /** The review step's token-free checks, invalidated by a run. */
  private readonly finalChecks = inject(FinalChecksService);

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
   * Runs the full 3-pass pipeline back-to-back on one click - the phase cards
   * animate through running/done as each pass lands, no manual Continue between
   * passes. Stops on the first failing pass.
   *
   * The clears come first because they are state a run invalidates but does not
   * own: the export status line, the post-tailor rescore, and the final checks.
   */
  async start(): Promise<void> {
    this.exportSvc.status.set('');
    this.exportSvc.lastExport.set(null);
    this.tailorScore.clear(this.detail.job()?.id);
    this.scoring.postTailorSaved.set(false);
    this.finalChecks.reset();

    await this.run();
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
   * Wizard step index: 0 review · 1 tailor · 2 updated score · 3 documents ·
   * 4 export. Entering the Updated score step auto-runs the rescore once (only
   * if the user actually tailored - pass 3 exists - and it hasn't run yet).
   */
  goToStep(step: number): void {
    const jobId = this.detail.job()?.id;
    this.nav.goTo(jobId, step);

    const UPDATED_SCORE_STEP = 2;
    const DOCUMENTS_STEP = 3;
    const EXPORT_STEP = 4;
    if (
      step === UPDATED_SCORE_STEP &&
      this.svc.results().length === 3 &&
      !this.tailorScore.resultFor(jobId ?? -1) &&
      !this.tailorScore.isRunningFor(jobId ?? -1)
    ) {
      void this.score.updateScoreAfterTailor();
    }
    if (step === DOCUMENTS_STEP) {
      void this.docs.prepareStep();
    }
    // Continuing past the Updated score step commits the new score to My Jobs.
    if (step === EXPORT_STEP) {
      void this.score.savePostTailorScore();
    }
  }

  /**
   * Throw away one wizard session: the passes, the export status line and the
   * post-tailor rescore. The job stays open.
   *
   * Distinct from `reset()`, which runs when the screen moves to a **different**
   * job and additionally clears `cancelled` - see its own note for why that
   * flag outlives a session reset but not a job change.
   */
  resetWizard(): void {
    this.svc.reset();
    this.exportSvc.status.set('');
    this.exportSvc.error.set(false);
    this.tailorScore.clear(this.detail.job()?.id);
    this.scoring.postTailorSaved.set(false);
  }

  /**
   * "Start over" on the Export step: discard the tailoring/score/export state
   * and return to step 1 (Tailor) so the user can tailor again from scratch.
   * Previously this only cleared off-screen signals and left the user on the
   * export step, so nothing visible happened.
   */
  startOver(): void {
    this.resetWizard();
    this.nav.goTo(this.detail.job()?.id, 1);
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

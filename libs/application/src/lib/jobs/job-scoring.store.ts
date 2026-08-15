import { Injectable, inject } from '@angular/core';
import { parseArchetypes, parseLegitimacyNotes } from '@applye/core';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { JobDetailStore } from './job-detail.store';
import { ScoreContext } from './job-score-payload';
import { JobScoringService } from './job-scoring.service';
import { TailoringService } from './tailoring.service';

/**
 * Scoring for the job open on the detail screen.
 *
 * `JobScoringService` takes a `ScoreContext` on every call and holds none of it,
 * the same shape `TailoringService` has and for the same reason - it also runs
 * from other screens. The seven-field record still has to be assembled from the
 * job now open, and it was assembled on the page. This store is that somewhere,
 * and `JobTailoringStore` is its sibling.
 *
 * Deliberately not here: `parseAndFilter`. It re-parses the description and then
 * throws away the wizard, so it spans this store and `JobTailoringStore`; the
 * page orchestrates the two rather than either store injecting the other
 * (ADR-0005, and the same call the router keeps on the page).
 */
@Injectable()
export class JobScoringStore {
  private readonly detail = inject(JobDetailStore);
  private readonly svc = inject(JobScoringService);
  /** The market the review step scores against. */
  private readonly targets = inject(DocumentReviewTargetsService);
  /** Read for the third pass only - the tailored CV a rescore runs against. */
  private readonly tailorSvc = inject(TailoringService);

  /** Baseline score for the job now open. `forceRefresh` spends tokens on a
   * fresh run instead of reading `scoring_cache`. */
  scoreJob(forceRefresh = false): Promise<void> {
    return this.svc.score(this.context(''), forceRefresh);
  }

  /** Post-tailor rescore - user-initiated and token-spending. See
   * `JobScoringService.rescoreAfterTailor`. */
  updateScoreAfterTailor(): Promise<void> {
    const pass3 = this.tailorSvc.results().find((r) => r.pass === 3);
    return this.svc.rescoreAfterTailor(this.context(pass3?.resultMd ?? ''));
  }

  /** Commits the post-tailor score to My Jobs. See
   * `JobScoringService.savePostTailor`. */
  savePostTailorScore(): Promise<void> {
    return this.svc.savePostTailor(this.detail.job()?.id);
  }

  /** The legitimacy warnings parsed off the job row, for the scoring view and
   * for `context()` - a score reads them as an input. */
  legitimacyNotes(): string[] {
    return parseLegitimacyNotes(this.detail.job()?.legitimacyNotes);
  }

  /** Whether the profile declares target archetypes, which is what makes the
   * archetype-match line worth rendering at all. */
  hasArchetypes(): boolean {
    return parseArchetypes(this.detail.profile()?.targetArchetypes).length > 0;
  }

  /** Everything a scoring run reads, snapshotted at call time. */
  private context(tailoredResumeMd: string): ScoreContext {
    return {
      job: this.detail.job(),
      profile: this.detail.profile(),
      settings: this.detail.settings(),
      jdText: this.detail.jdText(),
      legitimacyNotes: this.legitimacyNotes(),
      tailoredResumeMd,
      reviewRegion: this.targets.region(),
    };
  }
}

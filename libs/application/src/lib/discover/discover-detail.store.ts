import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type ArchetypeFit,
  type JdBlock,
  computeRawScore,
  detectSkills,
  extractSalaryFromJd,
  parseJdBlocks,
} from '@applye/core';
import { DbService } from '@applye/data';

/** How a raw keyword-fit score reads to the user. Null when it cannot be computed. */
export type DetailVerdict = 'strong' | 'good' | 'partial' | null;

/**
 * What the page knows about a job at the moment it is opened, and what the
 * score is computed against.
 *
 * Captured at `open` rather than read after the load, and that is the point:
 * the score describes the job as the user opened it. Re-reading page signals
 * after an await is the shape of the race the in-flight guard already defends
 * against, and passing them in removes the second half of that problem instead
 * of guarding it twice.
 */
export interface DetailContext {
  /** The profile's derived keywords, already lowercased. */
  keywords: readonly string[];
  /** The row's best-fit archetype tier, or null when it matched none. */
  fit: ArchetypeFit | null;
  /** The row's title. Scored together with the job description. */
  title: string;
}

/**
 * Discover's job-detail screen: the full description, what it names, and how
 * well it fits.
 *
 * **Component-scoped.** The page provides it, so the state lives exactly as
 * long as one Discover page - which is right, because it is the state of one
 * open job and must not survive leaving the page. That is a different case from
 * `LinkedDocumentsService`, whose known bug is a minutes-long generation
 * outliving its page; the only await here is a single read, and the load
 * already refuses to write when the user has moved on.
 *
 * The feed is not in here. `detailRow` stays on the page because it is derived
 * from the feed, which the page owns - this store answers about one job, not
 * about the list it came from.
 */
@Injectable()
export class DiscoverDetailStore {
  private readonly db = inject(DbService);

  private readonly idState = signal<number | null>(null);
  private readonly blocksState = signal<JdBlock[] | null>(null);
  private readonly skillsState = signal<string[]>([]);
  private readonly scoreState = signal<number | null>(null);
  private readonly salaryState = signal<string | null>(null);

  /** The open job, or null when the feed is showing. */
  readonly id = this.idState.asReadonly();
  /** Parsed description blocks; **null means still loading**, `[]` means failed. */
  readonly blocks = this.blocksState.asReadonly();
  readonly skills = this.skillsState.asReadonly();
  /** Raw keyword-fit score, or null when the profile has no keywords. */
  readonly score = this.scoreState.asReadonly();
  /** Salary text found in the description, or null. */
  readonly salary = this.salaryState.asReadonly();

  readonly verdict = computed<DetailVerdict>(() => {
    const score = this.scoreState();
    if (score === null) return null;
    if (score >= 80) return 'strong';
    if (score >= 55) return 'good';
    return 'partial';
  });

  /**
   * Opens a job and loads it. Everything the previous job left behind is
   * cleared first, so the screen never shows one job's skills under another's
   * title while the read is in flight.
   */
  open(jobId: number, context: DetailContext): void {
    this.idState.set(jobId);
    this.blocksState.set(null);
    this.skillsState.set([]);
    this.scoreState.set(null);
    this.salaryState.set(null);
    void this.load(jobId, context);
  }

  close(): void {
    this.idState.set(null);
    this.blocksState.set(null);
  }

  /** Closes only if that job is the one open. Used when a row is dismissed. */
  closeIfOpen(jobId: number): void {
    if (this.idState() === jobId) this.close();
  }

  private async load(jobId: number, context: DetailContext): Promise<void> {
    try {
      const job = await this.db.getJob(jobId);
      if (this.idState() !== jobId) return; // user moved on meanwhile
      const jd = job?.jdText ?? '';
      const skills = detectSkills(jd);
      this.salaryState.set(extractSalaryFromJd(jd));
      this.blocksState.set(parseJdBlocks(jd));
      this.skillsState.set(skills);
      this.scoreState.set(
        computeRawScore(`${context.title}\n${jd}`, context.keywords, skills, context.fit),
      );
    } catch (e) {
      console.error('discover: load detail failed', e);
      // An empty block list is the "nothing to show" state the template renders.
      // Guarded because the failure may arrive after the user opened another job.
      if (this.idState() === jobId) this.blocksState.set([]);
    }
  }
}

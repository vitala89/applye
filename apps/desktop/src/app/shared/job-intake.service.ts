import { Injectable, inject, signal } from '@angular/core';
import { Job, ScoringCache, archetypeNames, parseArchetypes } from '@applye/core';
import { DbService, JobSourceService } from '@applye/data';
import { JobIdentityResolverService } from './job-identity-resolver.service';

/** Everything a parse run reads, snapshotted by the caller at click time. */
export interface JobIntakeInput {
  /** The pasted job description to parse. */
  jdText: string;
  /**
   * The job as it stands, when this is a re-parse rather than a first paste.
   *
   * Its company and title are passed back so re-parsing a header-less JD does
   * not lose them and wrongly report "No company name found", and its id is what
   * keeps an edited description on this job instead of starting a second one
   * beside it. One object rather than three fields, because they are three
   * views of the same thing and every caller reads them together.
   */
  previous?: Job | null;
  /** The active profile's scoring hash, when there is one, for the cache probe. */
  scoringHash?: string;
  /** The profile's raw target-archetypes JSON, for the overlap check. */
  targetArchetypes?: string;
}

/** What the page needs after a successful parse. */
export interface JobIntakeResult {
  job: Job;
  /**
   * A score already computed for this exact job + profile hash, or null. The
   * page owns applying it, because the scoring signals belong to
   * `JobScoringService`, not to intake.
   */
  cached: ScoringCache | null;
}

/**
 * Turning pasted job-description text into a stored job row: the parse itself,
 * its own progress/status/error line, the free cache probe that follows, and
 * the 0-token archetype overlap check.
 *
 * It deliberately does NOT clear the page's job, wizard, or scoring state. Those
 * resets belong to whoever is re-parsing - the page - and doing them here would
 * make intake reach into four other services.
 *
 * Component-scoped via the page's `providers`.
 */
@Injectable()
export class JobIntakeService {
  private readonly db = inject(DbService);
  private readonly source = inject(JobSourceService);
  private readonly identity = inject(JobIdentityResolverService);

  /** Writable so the page can alias them onto the template. */
  readonly parsing = signal(false);
  readonly status = signal('');
  readonly error = signal(false);
  /** False = the JD does not overlap the profile's target archetypes. Warn only. */
  readonly archetypeMatch = signal<boolean | null>(null);

  /**
   * Parse `jdText` into a job row, then - only when it passed the hard filter -
   * probe the score cache and run the archetype check.
   *
   * Returns null when the parse threw; the failure is already on `status`.
   */
  async parse(input: JobIntakeInput): Promise<JobIntakeResult | null> {
    this.parsing.set(true);
    this.status.set('');
    this.error.set(false);
    this.archetypeMatch.set(null);
    try {
      // `fallback`: what the caller passes is what this job already had, so
      // fresh extraction wins and the old values only fill a gap it left. The
      // alternative made a title captured wrongly by an earlier parse permanent,
      // because the page handed it straight back on every re-parse.
      const job = await this.source.jobPaste(
        input.jdText,
        input.previous?.title,
        input.previous?.company,
        'fallback',
        input.previous?.id,
      );
      // The rules have had their turn. Anything still unnamed goes to one AI
      // call and then, if needed, to the user - but NOT on this promise. That
      // phase is an AI round-trip followed by a dialog the user answers in
      // their own time, and awaiting it here would leave Parse & filter
      // spinning on work that is not the parse. It is started and left to run.
      // A blocked job is not worth naming, hence the guard.
      if (job.hardFilterPassed) this.identity.start(job);
      if (!job.hardFilterPassed) {
        this.status.set('Hard filter failed - job blocked.');
        return { job, cached: null };
      }
      this.status.set('');
      const cached =
        input.scoringHash && job.id ? await this.db.scoreCacheGet(job.id, input.scoringHash) : null;
      // Layer-1 archetype overlap check (0 tokens, deterministic) - warn only, never blocks.
      this.archetypeMatch.set(await this.matchesArchetypes(job, input));
      return { job, cached };
    } catch (e) {
      this.status.set(`Failed: ${String(e)}`);
      this.error.set(true);
      return null;
    } finally {
      this.parsing.set(false);
    }
  }

  private matchesArchetypes(job: Job, input: JobIntakeInput): Promise<boolean> {
    return this.db.checkArchetypeMatch(
      job.title ?? undefined,
      job.jdText ?? '',
      input.targetArchetypes
        ? JSON.stringify(archetypeNames(parseArchetypes(input.targetArchetypes)))
        : undefined,
    );
  }
}

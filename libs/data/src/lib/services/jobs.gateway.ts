import { Injectable } from '@angular/core';
import { Job, JobOverview, ScoringCache } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Jobs and the score cache keyed on them.
 *
 * Application tracking lives on `ApplicationsGateway`. Tracker field edits
 * live on `TrackerGateway`. This gateway does not grow those methods back.
 *
 * The score cache is here because its readers are. All three `scoreCache*`
 * methods are read by `job-scoring.service.ts` and `job-intake.service.ts`,
 * and by nothing in the tracker.
 *
 * `checkArchetypeMatch` reads no profile row. The archetypes come in as an
 * argument, already parsed, and its only caller is `job-intake.service.ts`.
 *
 * Four commands carry no `db_` prefix: `check_archetype_match` and the three
 * `score_cache_*` commands. `scoreCacheSave` sends `{ input }`. `upsertJob`
 * sends `{ job }`.
 */
@Injectable({ providedIn: 'root' })
export class JobsGateway {
  async listJobs(): Promise<Job[]> {
    return tauriInvoke<Job[]>('db_list_jobs');
  }

  async upsertJob(job: Omit<Job, 'id' | 'jdHash' | 'createdAt'>): Promise<Job> {
    return tauriInvoke<Job>('db_upsert_job', { job });
  }

  /** My Jobs table rows: job columns + latest score + current status. */
  async listJobsOverview(): Promise<JobOverview[]> {
    return tauriInvoke<JobOverview[]>('db_list_jobs_overview');
  }

  async getJob(id: number): Promise<Job | null> {
    return tauriInvoke<Job | null>('db_get_job', { id });
  }

  /** Layer-1 archetype overlap (0 tokens). True = on-archetype or no archetypes defined. */
  checkArchetypeMatch(
    title: string | undefined,
    jdText: string,
    archetypesJson: string | undefined,
  ): Promise<boolean> {
    return tauriInvoke<boolean>('check_archetype_match', { title, jdText, archetypesJson });
  }

  /** Hard delete - removes the job and every dependent row (applications,
   *  scoring, tailoring, interview data). Irreversible; caller must confirm
   *  with the user first. */
  async deleteJob(id: number): Promise<void> {
    return tauriInvoke<void>('db_delete_job', { id });
  }

  async scoreCacheGet(jobId: number, profileHash: string): Promise<ScoringCache | null> {
    return tauriInvoke<ScoringCache | null>('score_cache_get', { jobId, profileHash });
  }

  /** Newest score for a job regardless of which profile version produced it -
   * the fallback that keeps an earlier result visible (marked stale) after a
   * profile edit changes the hash. */
  async scoreCacheLatest(jobId: number): Promise<ScoringCache | null> {
    return tauriInvoke<ScoringCache | null>('score_cache_latest', { jobId });
  }

  async scoreCacheSave(input: {
    jobId: number;
    profileHash: string;
    language: string;
    score: number;
    dimensionsJson: string;
    missingKeywordsJson: string;
    redFlagsJson: string;
    atsPass: boolean;
    atsNotes: string;
    summary: string;
    beforeYouSubmitJson: string;
    modelUsed: string;
    tokensInput: number;
    tokensOutput: number;
  }): Promise<ScoringCache> {
    return tauriInvoke<ScoringCache>('score_cache_save', { input });
  }
}

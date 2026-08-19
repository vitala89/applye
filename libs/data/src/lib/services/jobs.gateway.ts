import { Injectable } from '@angular/core';
import { AnalyticsFacts, Job, JobOverview, ScoringCache } from '@applye/core';
import {
  Application,
  ApplicationStatus,
  ApplicationTrackerFieldsInput,
  Comment,
  PipelineCard,
  Priority,
} from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Jobs and their applications: the job rows, the score cache keyed on them, the
 * pipeline and analytics projections, and the per-application edits the tracker
 * and the quick view make.
 *
 * **The seventh per-domain gateway** - see `CODE_QUALITY.md` for the migration
 * and `DraftsGateway` for the pattern.
 *
 * **The score cache is here because its readers are.** `TrackerGateway`'s pull
 * request corrected the domain list on that point: all three `scoreCache*`
 * methods are read by `job-scoring.service.ts` and `job-intake.service.ts`, and
 * by nothing in the tracker.
 *
 * **`checkArchetypeMatch` arrived from the Profile banner**, the fourth gateway
 * in a row to find a method mis-filed. It reads no profile row - the archetypes
 * come in as an argument, already parsed - and its only caller is
 * `job-intake.service.ts`, which uses it as a zero-token screen on a pasted job
 * description. It is a job predicate that happens to take profile data.
 *
 * Two naming traps live in this domain, both pinned by the spec: three commands
 * carry no `db_` prefix (`set_application_priority`, `add_application_comment`,
 * `list_application_comments`, plus the three `score_cache_*` and
 * `check_archetype_match`), and the two sibling setters disagree about their
 * first argument - `db_set_application_status` sends `id`, while
 * `set_application_priority` sends `applicationId`.
 */
@Injectable({ providedIn: 'root' })
export class JobsGateway {
  // --- Jobs ---
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

  // --- Score cache ---
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

  // --- Applications ---
  async listApplications(): Promise<Application[]> {
    return tauriInvoke<Application[]>('db_list_applications');
  }

  async listPipelineCards(): Promise<PipelineCard[]> {
    return tauriInvoke<PipelineCard[]>('db_pipeline_cards');
  }

  /** Raw per-application signals + follow-up timestamps for the Analytics
   *  screen; all aggregation happens client-side via `computeAnalytics`. */
  async getAnalyticsFacts(): Promise<AnalyticsFacts> {
    return tauriInvoke<AnalyticsFacts>('db_analytics_facts');
  }

  async upsertApplication(
    application: Partial<Application> & Pick<Application, 'jobId' | 'status'>,
  ): Promise<Application> {
    return tauriInvoke<Application>('db_upsert_application', { application });
  }

  async setApplicationStatus(id: number, status: ApplicationStatus): Promise<Application> {
    return tauriInvoke<Application>('db_set_application_status', { id, status });
  }

  /** Job Tracker inline edit - patches only contact/next-action/salary/notes. */
  async updateApplicationTrackerFields(input: ApplicationTrackerFieldsInput): Promise<Application> {
    return tauriInvoke<Application>('db_update_application_tracker_fields', { input });
  }

  /** Pipeline quick-view priority flag - distinct from the legitimacy tier. */
  async setApplicationPriority(applicationId: number, priority: Priority): Promise<Application> {
    return tauriInvoke<Application>('set_application_priority', { applicationId, priority });
  }

  async addApplicationComment(applicationId: number, commentText: string): Promise<Comment> {
    return tauriInvoke<Comment>('add_application_comment', { applicationId, commentText });
  }

  /** Oldest → newest, for the quick-view comment feed. */
  async listApplicationComments(applicationId: number): Promise<Comment[]> {
    return tauriInvoke<Comment[]>('list_application_comments', { applicationId });
  }
}

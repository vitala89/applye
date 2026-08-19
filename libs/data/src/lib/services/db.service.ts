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
import { Profile } from '@applye/core';
import { Settings } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/** Typed wrappers over the Rust db_* commands. The frontend stays SQL-free. */
@Injectable({ providedIn: 'root' })
export class DbService {
  // --- Profile (source of truth) ---
  async getProfile(): Promise<Profile | null> {
    return tauriInvoke<Profile | null>('db_get_profile');
  }

  async upsertProfile(
    profile: Partial<
      Pick<
        Profile,
        'fullMd' | 'scoringJson' | 'scoringHash' | 'pitchMd' | 'pitchHash' | 'targetArchetypes'
      >
    >,
  ): Promise<Profile> {
    return tauriInvoke<Profile>('db_upsert_profile', { profile });
  }

  /** Set (or, with `null`, remove) the reusable profile photo. Separate from
   * `upsertProfile` so an ordinary profile save cannot wipe it. */
  async setProfilePhoto(photoDataUri: string | null): Promise<Profile> {
    return tauriInvoke<Profile>('db_set_profile_photo', { photoDataUri });
  }

  /** Layer-1 archetype overlap (0 tokens). True = on-archetype or no archetypes defined. */
  checkArchetypeMatch(
    title: string | undefined,
    jdText: string,
    archetypesJson: string | undefined,
  ): Promise<boolean> {
    return tauriInvoke<boolean>('check_archetype_match', { title, jdText, archetypesJson });
  }

  // --- Settings ---
  async getSettings(): Promise<Settings> {
    return tauriInvoke<Settings>('db_get_settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    return tauriInvoke<Settings>('db_update_settings', { settings });
  }

  /**
   * Factory reset - wipe every user-data table and reset settings to defaults
   * (including `onboardingSeen = false`). Destructive and irreversible; the UI
   * gates it behind an explicit confirm. Does NOT touch OS-keychain API keys -
   * the caller clears those separately via KeysService.
   */
  async resetAllData(): Promise<void> {
    return tauriInvoke<void>('db_reset_all_data');
  }

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

  /** Hard delete - removes the job and every dependent row (applications,
   *  scoring, tailoring, interview data). Irreversible; caller must confirm
   *  with the user first. */
  async deleteJob(id: number): Promise<void> {
    return tauriInvoke<void>('db_delete_job', { id });
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

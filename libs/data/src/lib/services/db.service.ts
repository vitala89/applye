import { Injectable } from '@angular/core';
import { Job, JobOverview, ScoringCache } from '@applye/core';
import { Application, ApplicationStatus, PipelineCard } from '@applye/core';
import { Profile } from '@applye/core';
import { Settings } from '@applye/core';
import { GeneratedDoc, SaveTailoringInput, TailoringCache } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/** Typed wrappers over the Rust db_* commands. The frontend stays SQL-free. */
@Injectable({ providedIn: 'root' })
export class DbService {
  // --- Profile (source of truth) ---
  async getProfile(): Promise<Profile | null> {
    return tauriInvoke<Profile | null>('db_get_profile');
  }

  async upsertProfile(
    profile: Partial<Pick<Profile, 'fullMd' | 'scoringJson' | 'scoringHash' | 'pitchMd'>>,
  ): Promise<Profile> {
    return tauriInvoke<Profile>('db_upsert_profile', { profile });
  }

  hashText(text: string): Promise<string> {
    return tauriInvoke<string>('hash_text', { text });
  }

  // --- Settings ---
  async getSettings(): Promise<Settings> {
    return tauriInvoke<Settings>('db_get_settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    return tauriInvoke<Settings>('db_update_settings', { settings });
  }

  // --- Jobs ---
  async listJobs(): Promise<Job[]> {
    return tauriInvoke<Job[]>('db_list_jobs');
  }

  async upsertJob(job: Omit<Job, 'id' | 'jdHash' | 'createdAt'>): Promise<Job> {
    return tauriInvoke<Job>('db_upsert_job', { job });
  }

  async jobPaste(jdText: string): Promise<Job> {
    return tauriInvoke<Job>('job_paste', { jdText });
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

  async upsertApplication(
    application: Partial<Application> & Pick<Application, 'jobId' | 'status'>,
  ): Promise<Application> {
    return tauriInvoke<Application>('db_upsert_application', { application });
  }

  async setApplicationStatus(id: number, status: ApplicationStatus): Promise<Application> {
    return tauriInvoke<Application>('db_set_application_status', { id, status });
  }

  // --- Tailoring cache ---
  async tailoringCacheGet(
    jobId: number,
    pass: number,
    inputHash: string,
  ): Promise<TailoringCache | null> {
    return tauriInvoke<TailoringCache | null>('tailoring_cache_get', { jobId, pass, inputHash });
  }

  async tailoringCacheSave(input: SaveTailoringInput): Promise<TailoringCache> {
    return tauriInvoke<TailoringCache>('tailoring_cache_save', { input });
  }

  // --- Document export ---
  async generatedDocGet(
    jobId: number,
    inputHash: string,
    exportFormat: string,
  ): Promise<GeneratedDoc | null> {
    return tauriInvoke<GeneratedDoc | null>('generated_doc_get', {
      jobId,
      inputHash,
      exportFormat,
    });
  }

  async exportDocx(
    jobId: number,
    contentMd: string,
    company: string,
    jobTitle: string,
    inputHash: string,
  ): Promise<GeneratedDoc> {
    return tauriInvoke<GeneratedDoc>('export_docx', {
      jobId,
      contentMd,
      company,
      jobTitle,
      inputHash,
    });
  }

  async exportPdf(
    jobId: number,
    contentMd: string,
    company: string,
    jobTitle: string,
    inputHash: string,
  ): Promise<GeneratedDoc> {
    return tauriInvoke<GeneratedDoc>('export_pdf', {
      jobId,
      contentMd,
      company,
      jobTitle,
      inputHash,
    });
  }

  openFile(path: string): Promise<void> {
    return tauriInvoke<void>('open_file', { path });
  }

  revealInFolder(path: string): Promise<void> {
    return tauriInvoke<void>('reveal_in_folder', { path });
  }

  // --- Backup / export ---
  async exportDatabase(targetPath: string): Promise<string> {
    return tauriInvoke<string>('db_export', { targetPath });
  }
}

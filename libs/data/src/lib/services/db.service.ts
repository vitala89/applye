import { Injectable } from '@angular/core';
import { Job } from '@applye/core';
import { Application, ApplicationStatus } from '@applye/core';
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
    profile: Partial<Pick<Profile, 'fullMd' | 'scoringJson' | 'scoringHash'>>,
  ): Promise<Profile> {
    return tauriInvoke<Profile>('db_upsert_profile', { profile });
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

  // --- Applications ---
  async listApplications(): Promise<Application[]> {
    return tauriInvoke<Application[]>('db_list_applications');
  }

  async upsertApplication(
    application: Partial<Application> & Pick<Application, 'jobId' | 'status'>,
  ): Promise<Application> {
    return tauriInvoke<Application>('db_upsert_application', { application });
  }

  async setApplicationStatus(
    id: number,
    status: ApplicationStatus,
  ): Promise<Application> {
    return tauriInvoke<Application>('db_set_application_status', { id, status });
  }

  // --- Backup / export ---
  async exportDatabase(targetPath: string): Promise<string> {
    return tauriInvoke<string>('db_export', { targetPath });
  }
}

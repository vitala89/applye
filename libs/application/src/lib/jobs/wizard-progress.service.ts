import { Injectable, signal } from '@angular/core';

export interface WizardProgress {
  jobId: number;
  step: number;
}

/**
 * Tracks an in-flight apply-wizard session so the user can leave the job
 * page (sidebar nav, the document editor) and come back to the same step
 * instead of being dumped at the job list and forced to retailor.
 *
 * The value is session-scoped by design: a full app restart is a fresh start.
 * Remembering it across navigations inside one session is the desktop's
 * `BrowserUiState`, which hydrates this signal and mirrors later writes.
 * This service only owns the value (ADR-0005, amendment sixty-six).
 */
@Injectable({ providedIn: 'root' })
export class WizardProgressService {
  readonly progress = signal<WizardProgress | null>(null);

  hydrate(progress: WizardProgress | null): void {
    this.progress.set(progress);
  }

  /** Record that the wizard for `jobId` is open on `step`. */
  set(jobId: number, step: number): void {
    this.progress.set({ jobId, step });
  }

  /**
   * Drop the recorded progress. When `jobId` is given, only clears if the
   * stored progress belongs to that job, so finishing one job never wipes an
   * unrelated in-flight session.
   */
  clear(jobId?: number): void {
    if (jobId != null && this.progress()?.jobId !== jobId) return;
    this.progress.set(null);
  }
}

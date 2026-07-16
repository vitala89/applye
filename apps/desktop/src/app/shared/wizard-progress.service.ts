import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export interface WizardProgress {
  jobId: number;
  step: number;
}

const STORAGE_KEY = 'applye:wizardProgress';

/**
 * Tracks an in-flight apply-wizard session so the user can leave the job
 * page (sidebar nav, the document editor) and come back to the same step
 * instead of being dumped at the job list and forced to retailor.
 *
 * Backed by `sessionStorage` so the progress survives navigation within one
 * app session; the floating "resume" button in the shell reads the same
 * signal. Session-scoped by design: a full app restart is a fresh start.
 */
@Injectable({ providedIn: 'root' })
export class WizardProgressService {
  private readonly document = inject(DOCUMENT);
  readonly progress = signal<WizardProgress | null>(this.read());

  private storage(): Storage | undefined {
    return this.document.defaultView?.sessionStorage ?? undefined;
  }

  private read(): WizardProgress | null {
    const raw = this.storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as WizardProgress;
      return typeof p?.jobId === 'number' && typeof p?.step === 'number' ? p : null;
    } catch {
      return null;
    }
  }

  /** Record that the wizard for `jobId` is open on `step`. */
  set(jobId: number, step: number): void {
    const p: WizardProgress = { jobId, step };
    this.progress.set(p);
    this.storage()?.setItem(STORAGE_KEY, JSON.stringify(p));
  }

  /**
   * Drop the recorded progress. When `jobId` is given, only clears if the
   * stored progress belongs to that job, so finishing one job never wipes an
   * unrelated in-flight session.
   */
  clear(jobId?: number): void {
    if (jobId != null && this.progress()?.jobId !== jobId) return;
    this.progress.set(null);
    this.storage()?.removeItem(STORAGE_KEY);
  }
}

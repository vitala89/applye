import { Injectable, signal } from '@angular/core';

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
 *
 * Storage is reached through `globalThis` rather than through the injected
 * `DOCUMENT`, which is what lets this live in `libs/application`. That is not a
 * loosening of the layer's DOM rule but the rule as `ADR-0005` amendment
 * thirty-three already settled it for `sidebarCollapsed`: browser storage is
 * screen state that happens to outlive the session, not view. The optional
 * chain is load-bearing - a non-browser environment falls through to "no
 * progress" instead of throwing at construction.
 */
@Injectable({ providedIn: 'root' })
export class WizardProgressService {
  readonly progress = signal<WizardProgress | null>(this.read());

  private storage(): Storage | undefined {
    return globalThis.sessionStorage ?? undefined;
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

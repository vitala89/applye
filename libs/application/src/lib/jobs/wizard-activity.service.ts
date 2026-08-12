import { Injectable, computed, signal } from '@angular/core';

/** The long-running wizard steps that must survive leaving the job page. */
export type WizardActivity = 'tailoring' | 'scoring' | 'reviewing';

interface ActivityState {
  jobId: number;
  activity: WizardActivity;
}

/**
 * Tracks which long-running apply-wizard step (tailor · rescore · document
 * review) is currently in flight for a job, hoisted out of the jobs page
 * component so the flag survives navigation. The step's async closure keeps
 * running after the page is destroyed and calls `end()` on this root
 * singleton when it finishes; the shell badge reads `active()` to show a live
 * "processing…" state, and a returning page reacts to the flag flipping off
 * to pull the finished result from its cache/DB instead of appearing reset.
 *
 * Only one step runs at a time per job (the wizard is sequential), so a single
 * slot is enough. In-memory only: an app restart is a fresh start.
 */
@Injectable({ providedIn: 'root' })
export class WizardActivityService {
  private readonly state = signal<ActivityState | null>(null);

  /** The running step and its job, or null - drives the shell badge. */
  readonly active = computed(() => this.state());

  /** The step running for `jobId`, or null. */
  runningActivityFor(jobId: number): WizardActivity | null {
    const s = this.state();
    return s && s.jobId === jobId ? s.activity : null;
  }

  isRunning(jobId: number, activity: WizardActivity): boolean {
    return this.runningActivityFor(jobId) === activity;
  }

  /** Mark `activity` as started for `jobId`, replacing any prior slot. */
  begin(jobId: number, activity: WizardActivity): void {
    this.state.set({ jobId, activity });
  }

  /** Clear the slot, but only if it still holds this exact (job, activity). */
  end(jobId: number, activity: WizardActivity): void {
    const s = this.state();
    if (s && s.jobId === jobId && s.activity === activity) this.state.set(null);
  }

  /** Drop the slot. With `jobId`, only when the slot belongs to that job. */
  clear(jobId?: number): void {
    if (jobId != null && this.state()?.jobId !== jobId) return;
    this.state.set(null);
  }
}

import { Injectable, computed, signal } from '@angular/core';
import { ScoringCache } from '@applye/core';

export interface TailorScoreState {
  jobId: number;
  running: boolean;
  error: boolean;
  status: string;
  result: ScoringCache | null;
}

/**
 * Holds the post-tailor "update score" run for one job, hoisted out of the
 * jobs page component so it survives navigation. The rescore is an async AI
 * call kicked off inside the wizard; if the user leaves for another tab the
 * page component is destroyed, but the in-flight closure keeps writing here
 * (a root singleton), so on return the finished score is present instead of
 * the step resetting to "skipped". The shell badge reads `running` to show a
 * live indicator while it works.
 *
 * In-memory only by design: the tailored score must not touch `scoring_cache`
 * (that would overwrite the pre-tailor baseline the before/after view needs),
 * and a full app restart is a fresh start.
 */
@Injectable({ providedIn: 'root' })
export class TailorScoreService {
  private readonly state = signal<TailorScoreState | null>(null);

  /** True while any job's rescore is running - drives the shell badge. */
  readonly running = computed(() => this.state()?.running ?? false);
  /** The job whose rescore is currently running, or null. */
  readonly runningJobId = computed(() => {
    const s = this.state();
    return s?.running ? s.jobId : null;
  });

  private stateFor(jobId: number): TailorScoreState | null {
    const s = this.state();
    return s && s.jobId === jobId ? s : null;
  }

  resultFor(jobId: number): ScoringCache | null {
    return this.stateFor(jobId)?.result ?? null;
  }
  isRunningFor(jobId: number): boolean {
    return this.stateFor(jobId)?.running ?? false;
  }
  isErrorFor(jobId: number): boolean {
    return this.stateFor(jobId)?.error ?? false;
  }
  statusFor(jobId: number): string {
    return this.stateFor(jobId)?.status ?? '';
  }

  /** Mark the rescore for `jobId` as started - clears any prior result/error. */
  begin(jobId: number): void {
    this.state.set({ jobId, running: true, error: false, status: '', result: null });
  }
  /** Store a finished rescore result. */
  succeed(jobId: number, result: ScoringCache, status: string): void {
    this.state.set({ jobId, running: false, error: false, status, result });
  }
  /** Mark the rescore as failed, keeping any prior result for context. */
  fail(jobId: number, status: string): void {
    const prev = this.stateFor(jobId);
    this.state.set({ jobId, running: false, error: true, status, result: prev?.result ?? null });
  }

  /**
   * Drop the recorded state. With `jobId`, only clears when the stored state
   * belongs to that job, so resetting one job never wipes another's run.
   */
  clear(jobId?: number): void {
    if (jobId != null && this.state()?.jobId !== jobId) return;
    this.state.set(null);
  }
}

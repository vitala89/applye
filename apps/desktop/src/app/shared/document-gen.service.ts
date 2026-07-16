import { Injectable, computed, signal } from '@angular/core';

export type ReviewDocumentKind = 'cv' | 'cover_letter';

interface DocGenState {
  jobId: number;
  cv: boolean;
  cover_letter: boolean;
}

/**
 * Tracks which document drafts (CV · cover letter) are generating for a job,
 * hoisted out of the jobs page component so the in-flight flag survives leaving
 * the page. The two kinds are independent booleans, so a CV and a cover letter
 * can generate at the same time and each button reflects only its own run
 * instead of one silently blocking the other. The generating closure keeps
 * running after the page is destroyed and clears its flag when done; a reopened
 * page reads these flags to show the correct spinner/disabled state instead of
 * offering "Create" again mid-run, and the shell badge reads `anyPreparing`.
 *
 * In-memory only: an app restart is a fresh start.
 */
@Injectable({ providedIn: 'root' })
export class DocumentGenService {
  private readonly state = signal<DocGenState | null>(null);

  /** True while any document is generating for any job - drives the badge. */
  readonly busy = computed(() => {
    const s = this.state();
    return !!s && (s.cv || s.cover_letter);
  });

  private stateFor(jobId: number): DocGenState | null {
    const s = this.state();
    return s && s.jobId === jobId ? s : null;
  }

  isPreparing(jobId: number, kind: ReviewDocumentKind): boolean {
    return this.stateFor(jobId)?.[kind] ?? false;
  }
  anyPreparing(jobId: number): boolean {
    const s = this.stateFor(jobId);
    return !!s && (s.cv || s.cover_letter);
  }

  /** Mark `kind` as generating for `jobId`, preserving the other kind's flag. */
  begin(jobId: number, kind: ReviewDocumentKind): void {
    const s = this.stateFor(jobId);
    const base: DocGenState = s ?? { jobId, cv: false, cover_letter: false };
    this.state.set({ ...base, [kind]: true });
  }

  /** Clear `kind`'s flag; drops the slot once neither kind is generating. */
  end(jobId: number, kind: ReviewDocumentKind): void {
    const s = this.stateFor(jobId);
    if (!s) return;
    const next: DocGenState = { ...s, [kind]: false };
    this.state.set(next.cv || next.cover_letter ? next : null);
  }

  clear(jobId?: number): void {
    if (jobId != null && this.state()?.jobId !== jobId) return;
    this.state.set(null);
  }
}

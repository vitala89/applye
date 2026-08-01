import { Injectable, signal } from '@angular/core';

/** What the dialog is being asked about, and what it starts out holding. */
export interface JobIdentityRequest {
  /** True when this field is the reason the dialog opened. */
  missingCompany: boolean;
  missingTitle: boolean;
  /** Anything already known, so the user is not retyping a field that is fine. */
  company: string;
  title: string;
}

/** What the user answered, or null when they skipped. */
export interface JobIdentityAnswer {
  company: string;
  title: string;
}

/**
 * The "we could not name this job" dialog's state.
 *
 * The dialog itself is mounted once at the shell beside `UnsavedJobPromptComponent`:
 * the jobs page is over its size budget and cannot host it, and the parse chain
 * that raises it is a service, which has nowhere to render.
 */
@Injectable({ providedIn: 'root' })
export class JobIdentityPromptService {
  private readonly request = signal<JobIdentityRequest | null>(null);
  private decide: ((answer: JobIdentityAnswer | null) => void) | null = null;

  readonly open = this.request.asReadonly();

  /**
   * Raise the dialog. Resolves with what the user typed, or null when they
   * skipped - which Escape and a backdrop click also mean, because they mean
   * "not now".
   */
  ask(request: JobIdentityRequest): Promise<JobIdentityAnswer | null> {
    // A second ask while one is open would strand the first caller waiting on a
    // promise nothing will settle, so the earlier one is answered first.
    this.decide?.(null);
    this.request.set(request);
    return new Promise<JobIdentityAnswer | null>((resolve) => {
      this.decide = resolve;
    });
  }

  save(answer: JobIdentityAnswer): void {
    this.answer(answer);
  }

  skip(): void {
    this.answer(null);
  }

  private answer(answer: JobIdentityAnswer | null): void {
    this.request.set(null);
    const decide = this.decide;
    this.decide = null;
    decide?.(answer);
  }
}

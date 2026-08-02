import { Injectable, signal } from '@angular/core';

/** What the dialog is being asked about, and what it starts out holding. */
export interface JobIdentityRequest {
  /** True when this field is the reason the dialog opened. */
  missingCompany: boolean;
  missingTitle: boolean;
  /** Anything already known, so the user is not retyping a field that is fine. */
  company: string;
  title: string;
  /** Why the AI step did not settle it, when that is the reason we are asking.
   * The user is owed the difference between "the posting does not say" and
   * "nothing read the posting". */
  aiOutcome?: 'answered' | 'no-provider' | 'failed';
  /** What the failure actually said. Shown verbatim, because a generic "could
   * not be reached" costs another round trip to diagnose. */
  aiError?: string;
}

/** What the user typed. */
export interface JobIdentityAnswer {
  company: string;
  title: string;
}

/**
 * How one raised dialog ended.
 *
 * `superseded` is not `skipped`, and conflating them cost a whole evening: a
 * second `ask` while one was open resolved the first with the skip value, the
 * resolver wrote `identity_prompt_skipped` for the job, and from then on every
 * parse of that posting quietly did nothing - a first paste dedupes on the
 * text's hash, so re-pasting landed on the same flagged row. The user never
 * pressed Skip once.
 */
export type JobIdentityOutcome = JobIdentityAnswer | 'skipped' | 'superseded';

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
  private decide: ((outcome: JobIdentityOutcome) => void) | null = null;

  readonly open = this.request.asReadonly();

  /**
   * What is currently typed in the two fields.
   *
   * Held here rather than in the component so that opening the dialog seeds
   * them, in `ask`, which is an ordinary method call. The first cut seeded them
   * from a `computed` in the component and Angular rejected it outright with
   * NG0600 - so the dialog never rendered, the promise never settled, and the
   * job went unnamed with two error toasts to show for it.
   */
  private readonly companyDraft = signal('');
  private readonly titleDraft = signal('');

  readonly company = this.companyDraft.asReadonly();
  readonly title = this.titleDraft.asReadonly();

  /**
   * Raise the dialog. Resolves with what the user typed, or null when they
   * skipped - which Escape and a backdrop click also mean, because they mean
   * "not now".
   */
  ask(request: JobIdentityRequest): Promise<JobIdentityOutcome> {
    // A second ask while one is open would strand the first caller waiting on a
    // promise nothing will settle, so the earlier one is answered first - as
    // superseded, which is emphatically not the user declining.
    this.decide?.('superseded');
    this.companyDraft.set(request.company);
    this.titleDraft.set(request.title);
    this.request.set(request);
    return new Promise<JobIdentityOutcome>((resolve) => {
      this.decide = resolve;
    });
  }

  setCompany(value: string): void {
    this.companyDraft.set(value);
  }

  setTitle(value: string): void {
    this.titleDraft.set(value);
  }

  save(): void {
    this.answer({ company: this.companyDraft().trim(), title: this.titleDraft().trim() });
  }

  skip(): void {
    this.answer('skipped');
  }

  private answer(outcome: JobIdentityOutcome): void {
    this.request.set(null);
    const decide = this.decide;
    this.decide = null;
    decide?.(outcome);
  }
}

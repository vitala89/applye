import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobUpdateScoreStepComponent } from './job-update-score-step.component';
import { JobScoringService } from '@applye/application';
import { TailorScoreService } from '@applye/application';

const JOB = { id: 7, title: 'Senior Frontend Engineer' } as Job;

/** The post-tailor rescore is keyed by job id, so the stub is too - reading
 * another job's run is the failure this component's computeds have to avoid. */
function stubs() {
  const state = signal<{ jobId: number; running: boolean; error: boolean; status: string } | null>(
    null,
  );
  return {
    state,
    scoreSvc: {
      cache: signal<{ total: number } | null>({ total: 40 }),
      atsReport: signal<{ verdict: string } | null>(null),
      atsError: signal<string | null>(null),
    },
    tailorScore: {
      resultFor: (id: number) =>
        state()?.jobId === id && !state()?.running && !state()?.error ? { total: 80 } : null,
      isRunningFor: (id: number) => state()?.jobId === id && !!state()?.running,
      isErrorFor: (id: number) => state()?.jobId === id && !!state()?.error,
      statusFor: (id: number) => (state()?.jobId === id ? (state()?.status ?? '') : ''),
    },
  };
}

function setup(s: ReturnType<typeof stubs>) {
  TestBed.configureTestingModule({
    imports: [JobUpdateScoreStepComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: JobScoringService, useValue: s.scoreSvc },
      { provide: TailorScoreService, useValue: s.tailorScore },
    ],
  });
  const fixture = TestBed.createComponent(JobUpdateScoreStepComponent);
  fixture.componentRef.setInput('job', JOB);
  fixture.detectChanges();
  return fixture;
}

describe('JobUpdateScoreStepComponent', () => {
  /// Nothing has run yet: the step says so rather than showing an empty card.
  it('shows the skip line before any rescore has run', () => {
    const fixture = setup(stubs());
    expect(fixture.nativeElement.textContent).toContain('jobs.wizard.updated_score_skip');
  });

  /// The rescore state is a root singleton keyed by job. Another job's in-flight
  /// run must not put this step into its loading state, which is what the
  /// `jobId` computed protects.
  it('ignores a rescore running for a different job', () => {
    const s = stubs();
    const fixture = setup(s);

    s.state.set({ jobId: 99, running: true, error: false, status: '' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rescore-loading')).toBeNull();

    s.state.set({ jobId: 7, running: true, error: false, status: '' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rescore-loading')).not.toBeNull();
  });

  /// The failure branch is the only one with an action in it, and the action is
  /// the page's - it spends tokens and needs context the step does not hold.
  it('emits retry rather than re-running the rescore itself', () => {
    const s = stubs();
    const fixture = setup(s);
    let emitted = 0;
    fixture.componentInstance.retry.subscribe(() => (emitted += 1));

    s.state.set({ jobId: 7, running: false, error: true, status: 'jobs.rescore_failed' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('jobs.rescore_failed');
    fixture.nativeElement.querySelector('.row button')?.click();
    expect(emitted).toBe(1);
  });

  /// The before/after card reads the baseline score and the ATS report straight
  /// off JobScoringService, with nothing passed down from the page.
  it('renders the result card from the injected services', () => {
    const s = stubs();
    const fixture = setup(s);

    s.state.set({ jobId: 7, running: false, error: false, status: '' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-updated-score-view')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.status--error')).toBeNull();
  });

  /**
   * A null ATS report means either "no ATS check was run" or "the ATS check
   * failed", and the card shows the AI's advisory verdict for both. The failure
   * used to reach the console only, so a permanently broken check looked like a
   * deliberate design. The reason is rendered beside the card now.
   */
  it('shows why the ATS report is missing when the check failed', () => {
    const s = stubs();
    const fixture = setup(s);

    s.scoreSvc.atsError.set('ATS check unavailable - showing the advisory verdict only. boom');
    s.state.set({ jobId: 7, running: false, error: false, status: '' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-updated-score-view')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.status--error').textContent).toContain(
      'ATS check unavailable',
    );
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { UnsavedJobPromptService } from '../../shared/unsaved-job-prompt/unsaved-job-prompt.service';
import { AnalysedJobPage, unsavedJobGuard } from './unsaved-job.guard';

describe('unsavedJobGuard', () => {
  let prompt: UnsavedJobPromptService;

  /** The guard only reads these two, which is the whole of its contract. */
  const page = (job: unknown, application: unknown): AnalysedJobPage => ({
    job: () => job as { id?: number } | null,
    application: () => application,
  });

  const run = (p: AnalysedJobPage) =>
    TestBed.runInInjectionContext(() =>
      unsavedJobGuard(
        p,
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    );

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [UnsavedJobPromptService] });
    prompt = TestBed.inject(UnsavedJobPromptService);
  });

  it('lets the user leave a job they saved', () => {
    expect(run(page({ id: 1 }, { id: 9, status: 'saved' }))).toBe(true);
    expect(prompt.isOpen()).toBe(false);
  });

  it('lets the user leave when no job was analysed at all', () => {
    // Typed-but-never-parsed text is not worth a prompt: nothing has been
    // computed for it, and prompting would fire on every change of mind.
    expect(run(page(null, null))).toBe(true);
    expect(prompt.isOpen()).toBe(false);
  });

  it('asks before leaving a job that was analysed and never claimed', async () => {
    const answer = run(page({ id: 1 }, null));

    expect(prompt.isOpen()).toBe(true);
    prompt.leave();

    await expect(answer).resolves.toBe(true);
    expect(prompt.isOpen()).toBe(false);
  });

  it('keeps the user in place when they choose to stay', async () => {
    const answer = run(page({ id: 1 }, null));

    prompt.stay();

    await expect(answer).resolves.toBe(false);
  });

  it('answers an earlier prompt rather than stranding its navigation', async () => {
    // Two navigations racing would otherwise leave the first awaiting a promise
    // nothing settles, which blocks the router for the rest of the session.
    const first = run(page({ id: 1 }, null));
    const second = run(page({ id: 1 }, null));

    await expect(first).resolves.toBe(false);

    prompt.leave();
    await expect(second).resolves.toBe(true);
  });
});

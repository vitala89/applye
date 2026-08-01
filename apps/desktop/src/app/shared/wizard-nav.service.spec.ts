import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { JobsStore } from '@applye/data';
import { WizardNavService } from './wizard-nav.service';
import { WizardProgressService } from './wizard-progress.service';

describe('WizardNavService', () => {
  let svc: WizardNavService;
  let progress: WizardProgressService;
  let scrolled: number;

  const overview = signal<{ id: number; company?: string; title?: string }[]>([]);

  beforeEach(() => {
    scrolled = 0;
    const doc = {
      defaultView: null,
      querySelector: () => ({ scrollTo: () => (scrolled += 1) }),
      scrollingElement: null,
      documentElement: null,
    };

    TestBed.configureTestingModule({
      providers: [
        WizardNavService,
        WizardProgressService,
        { provide: JobsStore, useValue: { overview } },
        { provide: DOCUMENT, useValue: doc },
      ],
    });

    svc = TestBed.inject(WizardNavService);
    progress = TestBed.inject(WizardProgressService);
    progress.clear();
    overview.set([]);
  });

  describe('opening', () => {
    it('opens at step 0 and records the session', () => {
      expect(svc.requestOpen(7)).toBe(true);
      expect(svc.open()).toBe(true);
      expect(svc.initialStep()).toBe(0);
      expect(progress.progress()).toEqual({ jobId: 7, step: 0 });
    });

    it('refuses to open over another job and raises the confirm instead', () => {
      progress.set(4, 2);

      expect(svc.requestOpen(9)).toBe(false);
      expect(svc.crossJobConfirmOpen()).toBe(true);
      expect(svc.open()).toBe(false);
      // The other job's session is intact until the user answers.
      expect(progress.progress()).toEqual({ jobId: 4, step: 2 });
    });

    it('opens without a confirm when the saved session is this job', () => {
      progress.set(9, 2);

      expect(svc.requestOpen(9)).toBe(true);
      expect(svc.crossJobConfirmOpen()).toBe(false);
      expect(progress.progress()).toEqual({ jobId: 9, step: 0 });
    });

    it('confirming the cross-job prompt drops the other session and opens here', () => {
      progress.set(4, 2);
      svc.requestOpen(9);

      svc.confirmCrossJob(9);

      expect(svc.crossJobConfirmOpen()).toBe(false);
      expect(svc.open()).toBe(true);
      expect(progress.progress()).toEqual({ jobId: 9, step: 0 });
    });

    it('cancelling leaves both the other session and the closed wizard alone', () => {
      progress.set(4, 2);
      svc.requestOpen(9);

      svc.cancelCrossJob();

      expect(svc.crossJobConfirmOpen()).toBe(false);
      expect(svc.open()).toBe(false);
      expect(progress.progress()).toEqual({ jobId: 4, step: 2 });
    });
  });

  describe('cross-job label', () => {
    it('names the other job from the loaded overview', () => {
      overview.set([{ id: 4, company: 'Acme', title: 'Engineer' }]);
      progress.set(4, 1);

      expect(svc.crossJobLabel()).toBe('Acme - Engineer');
    });

    it('is empty with no session, and with a session the overview has not loaded', () => {
      expect(svc.crossJobLabel()).toBe('');

      progress.set(404, 1);
      expect(svc.crossJobLabel()).toBe('');
    });
  });

  describe('stepping', () => {
    it('records each step against the job and scrolls to the top', () => {
      svc.goTo(7, 3);

      expect(svc.initialStep()).toBe(3);
      expect(progress.progress()).toEqual({ jobId: 7, step: 3 });
      expect(scrolled).toBe(1);
    });

    it('still moves the step for a job with no id, recording nothing', () => {
      svc.goTo(undefined, 2);

      expect(svc.initialStep()).toBe(2);
      expect(progress.progress()).toBeNull();
    });
  });

  describe('leaving', () => {
    it('closing ends the session so the resume affordance stops offering it', () => {
      svc.requestOpen(7);

      svc.close(7);

      expect(svc.open()).toBe(false);
      expect(progress.progress()).toBeNull();
    });

    it('forget drops the session without closing the wizard', () => {
      svc.requestOpen(7);

      svc.forget(7);

      expect(svc.open()).toBe(true);
      expect(progress.progress()).toBeNull();
    });

    it('reset returns to closed at step 0 but leaves the saved session alone', () => {
      svc.goTo(7, 3);
      svc.open.set(true);

      svc.reset();

      expect(svc.open()).toBe(false);
      expect(svc.initialStep()).toBe(0);
      expect(progress.progress()).toEqual({ jobId: 7, step: 3 });
    });
  });

  describe('restoring', () => {
    it('returning from the document editor wins over any saved progress', () => {
      progress.set(7, 1);

      expect(svc.restore(7, true)).toBe('return');
      expect(svc.open()).toBe(true);
      expect(svc.initialStep()).toBe(3);
    });

    it('reopens at the saved step, owing document work only on the documents step', () => {
      progress.set(7, 3);
      expect(svc.restore(7, false)).toBe('restore-docs');
      expect(svc.initialStep()).toBe(3);

      svc.reset();
      progress.set(7, 1);
      expect(svc.restore(7, false)).toBeNull();
      expect(svc.initialStep()).toBe(1);
      expect(svc.open()).toBe(true);
    });

    it('ignores a session saved for a different job', () => {
      progress.set(4, 3);

      expect(svc.restore(7, false)).toBeNull();
      expect(svc.open()).toBe(false);
    });

    it('does not re-restore over an already open wizard', () => {
      progress.set(7, 3);
      svc.open.set(true);
      svc.initialStep.set(1);

      expect(svc.restore(7, false)).toBeNull();
      expect(svc.initialStep()).toBe(1);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Application, Job, Profile, Settings } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DocumentExportService } from '../documents/document-export.service';
import { ToastService } from '../shell/toast.service';
import { DocumentReviewStatusService } from './document-review-status.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { FinalChecksService } from './final-checks.service';
import { JobActionsService } from './job-actions.service';
import { JobDetailLifecycleStore, JobRouteEntry } from './job-detail-lifecycle.store';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentsStore } from './job-documents.store';
import { JobFinalChecksStore } from './job-final-checks.store';
import { JobScoringService } from './job-scoring.service';
import { JobTailoringStore } from './job-tailoring.store';
import { PortalAnswersService } from './portal-answers.service';
import { WizardNavService } from './wizard-nav.service';

const entry = (over: Partial<JobRouteEntry> = {}): JobRouteEntry => ({
  returningFromEditor: false,
  documentSaved: false,
  reviewHash: null,
  ...over,
});

describe('JobDetailLifecycleStore', () => {
  let store: JobDetailLifecycleStore;
  let order: string[];
  let restoreAnswer: 'return' | 'restore-docs' | null;
  let restoreCalls: { id: number; returning: boolean }[];
  let jobLoads: number[];
  let loadJobAnswer: boolean;
  let job: ReturnType<typeof signal<Job | null>>;
  let currentHash: string;
  let restoredChecks: { ats: string } | null;
  let checksSignal: ReturnType<typeof signal<{ ats: string } | null>>;
  let outdated: ReturnType<typeof signal<boolean>>;
  let postTailorSaved: ReturnType<typeof signal<boolean>>;
  let deleteConfirmOpen: ReturnType<typeof signal<boolean>>;
  let crossJobConfirmOpen: ReturnType<typeof signal<boolean>>;
  let successes: string[];
  let errors: string[];
  let invalidated: number;
  let loadLinkedThrows: boolean;

  beforeEach(() => {
    order = [];
    restoreAnswer = null;
    restoreCalls = [];
    jobLoads = [];
    loadJobAnswer = true;
    job = signal<Job | null>({ id: 4, title: 'Angular dev' } as Job);
    currentHash = 'hash-same';
    restoredChecks = { ats: 'pass' };
    checksSignal = signal<{ ats: string } | null>(null);
    outdated = signal(true);
    postTailorSaved = signal(true);
    deleteConfirmOpen = signal(true);
    crossJobConfirmOpen = signal(true);
    successes = [];
    errors = [];
    invalidated = 0;
    loadLinkedThrows = false;

    TestBed.configureTestingModule({
      providers: [
        JobDetailLifecycleStore,
        TranslateService,
        {
          provide: JobDetailStore,
          useValue: {
            job,
            profile: signal({ scoringHash: 'h1' } as Profile),
            settings: signal({ defaultDocLanguage: 'en' } as Settings),
            application: signal({ id: 1, docLanguage: 'de' } as Application),
            loadJob: (id: number) => {
              jobLoads.push(id);
              order.push('loadJob');
              return Promise.resolve(loadJobAnswer);
            },
          },
        },
        {
          provide: JobDocumentsStore,
          useValue: {
            prepareStep: () => {
              order.push('prepareStep');
              return Promise.resolve();
            },
            loadLinked: () => {
              if (loadLinkedThrows) return Promise.reject(new Error('linked docs failed'));
              order.push('loadLinked');
              return Promise.resolve();
            },
          },
        },
        {
          provide: JobFinalChecksStore,
          useValue: {
            checks: checksSignal,
            outdated,
            documentsHash: () => Promise.resolve(currentHash),
            invalidate: () => {
              invalidated += 1;
            },
          },
        },
        {
          provide: JobTailoringStore,
          useValue: {
            reset: () => order.push('tailoringReset'),
            restoreFromCache: () => {
              order.push('restoreTailoring');
              return Promise.resolve();
            },
          },
        },
        {
          provide: JobScoringService,
          useValue: {
            postTailorSaved,
            reset: () => order.push('scoringReset'),
            loadCached: () => {
              order.push('loadCachedScore');
              return Promise.resolve();
            },
          },
        },
        {
          provide: FinalChecksService,
          useValue: {
            reset: () => order.push('finalChecksReset'),
            restoreAfterReturn: () => restoredChecks,
          },
        },
        {
          provide: WizardNavService,
          useValue: {
            crossJobConfirmOpen,
            reset: () => order.push('wizardReset'),
            restore: (id: number, returning: boolean) => {
              restoreCalls.push({ id, returning });
              return restoreAnswer;
            },
          },
        },
        {
          provide: DocumentReviewStatusService,
          useValue: {
            reset: () => order.push('reviewStatusReset'),
            succeed: (m: string) => successes.push(m),
          },
        },
        {
          provide: DocumentReviewTargetsService,
          useValue: { language: signal('en'), region: signal('generic') },
        },
        {
          provide: DocumentExportService,
          useValue: { resetStatus: () => order.push('exportReset') },
        },
        {
          provide: PortalAnswersService,
          useValue: {
            reset: () => order.push('portalReset'),
            loadFromCache: () => Promise.resolve(),
          },
        },
        { provide: JobActionsService, useValue: { deleteConfirmOpen } },
        { provide: ToastService, useValue: { error: (m: string) => errors.push(m) } },
      ],
    });
    store = TestBed.inject(JobDetailLifecycleStore);
  });

  describe('enterJob', () => {
    // Resetting on the very first entry would wipe the state the wizard restore
    // is about to depend on. `loadedJobId` starting null is what distinguishes
    // "first job on this screen" from "switching away from one".
    it('does not reset on the first entry', async () => {
      await store.enterJob(4, entry());

      expect(order).not.toContain('wizardReset');
      expect(jobLoads).toEqual([4]);
    });

    it('resets before loading when the route points at a different job', async () => {
      await store.enterJob(4, entry());
      order.length = 0;

      await store.enterJob(5, entry());

      expect(order.indexOf('wizardReset')).toBeLessThan(order.indexOf('loadJob'));
      expect(jobLoads).toEqual([4, 5]);
    });

    // A query-param-only navigation - returning from the document editor - keeps
    // the same id. Reloading there would throw away everything the editor just
    // produced and re-read the whole screen for nothing.
    it('skips the reload when re-entering the same job, but still runs the follow-up', async () => {
      await store.enterJob(4, entry());
      order.length = 0;
      restoreAnswer = 'restore-docs';

      await store.enterJob(4, entry());

      expect(jobLoads).toEqual([4]);
      expect(order).toEqual(['prepareStep']);
    });

    // The blink: if the wizard decision waited on a load, the detail view would
    // paint for a frame before the wizard replaced it.
    it('decides the view synchronously, before the first await', () => {
      const pending = store.enterJob(4, entry({ returningFromEditor: true }));

      expect(restoreCalls).toEqual([{ id: 4, returning: true }]);

      return pending;
    });

    it('loads the score, the targets, the linked documents and the tailoring in order', async () => {
      await store.enterJob(4, entry());

      expect(order).toEqual([
        'loadJob',
        'loadCachedScore',
        'loadLinked',
        'portalReset',
        'restoreTailoring',
      ]);
    });

    it('stops after a job read that came back empty', async () => {
      loadJobAnswer = false;

      await store.enterJob(4, entry());

      expect(order).toEqual(['loadJob']);
    });

    it('reports a partial load rather than leaving the screen half-built in silence', async () => {
      loadLinkedThrows = true;

      await store.enterJob(4, entry());

      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('linked docs failed');
      expect(order).not.toContain('restoreTailoring');
    });
  });

  describe('resetJobScopedState', () => {
    // `JobScoringService.reset()` drops cache, fromCache and stale - and stops
    // there. Leaving `postTailorSaved` set would tell the next job that its
    // rescore had already been committed to My Jobs.
    it('clears the committed-rescore flag, which the scoring reset does not', () => {
      store.resetJobScopedState();

      expect(order).toContain('scoringReset');
      expect(postTailorSaved()).toBe(false);
    });

    it('closes both confirmations', () => {
      store.resetJobScopedState();

      expect(crossJobConfirmOpen()).toBe(false);
      expect(deleteConfirmOpen()).toBe(false);
    });
  });

  describe('returning from the document editor', () => {
    beforeEach(() => {
      restoreAnswer = 'return';
    });

    it('does nothing beyond the prep when the editor saved nothing', async () => {
      await store.enterJob(4, entry({ documentSaved: false }));

      expect(successes).toEqual([]);
      expect(invalidated).toBe(0);
    });

    it('restores the checks when the documents came back unchanged', async () => {
      await store.enterJob(4, entry({ documentSaved: true, reviewHash: 'hash-same' }));

      expect(checksSignal()).toEqual({ ats: 'pass' });
      expect(outdated()).toBe(false);
      expect(successes).toEqual([
        'Saved. No document changes detected, so the previous check can stand.',
      ]);
    });

    it('throws the checks away when the documents changed under them', async () => {
      currentHash = 'hash-different';

      await store.enterJob(4, entry({ documentSaved: true, reviewHash: 'hash-same' }));

      expect(invalidated).toBe(1);
      expect(successes).toEqual([
        'Saved. This document changed; run Final checks again before exporting.',
      ]);
    });
  });
});

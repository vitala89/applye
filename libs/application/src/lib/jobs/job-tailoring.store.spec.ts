import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocumentLibraryItem, Job, Profile, Settings } from '@applye/core';
import { DocumentExportService } from '../documents/document-export.service';
import { FinalChecksService } from './final-checks.service';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentsStore } from './job-documents.store';
import { JobScoringService } from './job-scoring.service';
import { JobScoringStore } from './job-scoring.store';
import { JobTailoringStore } from './job-tailoring.store';
import { TailorScoreService } from './tailor-score.service';
import { TailorContext, TailoringService } from './tailoring.service';
import { WizardNavService } from './wizard-nav.service';

describe('JobTailoringStore', () => {
  let store: JobTailoringStore;
  let restored: TailorContext[];
  let ran: TailorContext[];
  let cancelled: number[];
  let resets: number;
  let cancelledFlag: ReturnType<typeof signal<boolean>>;
  let cache: ReturnType<typeof signal<{ total: number } | null>>;
  let job: ReturnType<typeof signal<Job | null>>;
  let results: ReturnType<typeof signal<{ pass: number; resultMd: string }[]>>;
  let postTailorSaved: ReturnType<typeof signal<boolean>>;
  let exportStatus: ReturnType<typeof signal<string>>;
  let exportError: ReturnType<typeof signal<boolean>>;
  let lastExport: ReturnType<typeof signal<string | null>>;
  let rescoreResult: ReturnType<typeof signal<{ total: number } | null>>;
  let rescoreRunning: ReturnType<typeof signal<boolean>>;
  /** Everything the wizard steps drive, in call order, so a step's side effects
   * can be asserted as a sequence rather than one flag at a time. */
  let calls: string[];

  beforeEach(() => {
    restored = [];
    ran = [];
    cancelled = [];
    resets = 0;
    calls = [];
    cancelledFlag = signal(false);
    cache = signal<{ total: number } | null>(null);
    job = signal<Job | null>({ id: 4, title: 'Angular dev' } as Job);
    results = signal<{ pass: number; resultMd: string }[]>([]);
    postTailorSaved = signal(false);
    exportStatus = signal('written');
    exportError = signal(true);
    lastExport = signal<string | null>('/tmp/cv.pdf');
    rescoreResult = signal<{ total: number } | null>(null);
    rescoreRunning = signal(false);

    TestBed.configureTestingModule({
      providers: [
        JobTailoringStore,
        {
          provide: JobScoringStore,
          useValue: {
            updateScoreAfterTailor: () => {
              calls.push('rescore');
              return Promise.resolve();
            },
            savePostTailorScore: () => {
              calls.push('save');
              return Promise.resolve();
            },
          },
        },
        {
          provide: JobDocumentsStore,
          useValue: {
            prepareStep: () => {
              calls.push('prepareDocuments');
              return Promise.resolve();
            },
          },
        },
        {
          provide: WizardNavService,
          useValue: {
            goTo: (id: number | undefined, step: number) => calls.push(`goTo:${id}:${step}`),
          },
        },
        {
          provide: TailorScoreService,
          useValue: {
            clear: (id: number | undefined) => calls.push(`clearScore:${id}`),
            resultFor: () => rescoreResult(),
            isRunningFor: () => rescoreRunning(),
          },
        },
        {
          provide: DocumentExportService,
          useValue: { status: exportStatus, error: exportError, lastExport },
        },
        {
          provide: FinalChecksService,
          useValue: {
            reset: () => calls.push('resetFinalChecks'),
          },
        },
        {
          provide: JobDetailStore,
          useValue: {
            job,
            profile: signal({ fullMd: '# me' } as Profile),
            settings: signal({ provider: 'openai' } as Settings),
            jdText: signal('the description'),
            selectedBaseCvId: signal(12),
            matchingCvs: signal<DocumentLibraryItem[]>([]),
          },
        },
        { provide: JobScoringService, useValue: { cache, postTailorSaved } },
        {
          provide: TailoringService,
          useValue: {
            results,
            cancelled: cancelledFlag,
            reset: () => {
              resets += 1;
            },
            run: (c: TailorContext) => {
              ran.push(c);
              return Promise.resolve();
            },
            restoreFromCache: (c: TailorContext) => {
              restored.push(c);
              return Promise.resolve();
            },
            cancel: (id: number | undefined) => cancelled.push(id ?? -1),
          },
        },
      ],
    });
    store = TestBed.inject(JobTailoringStore);
  });

  it('assembles the context the passes read, including the score from another service', async () => {
    cache.set({ total: 71 });

    await store.run();

    expect(ran).toEqual([
      {
        job: { id: 4, title: 'Angular dev' },
        profile: { fullMd: '# me' },
        settings: { provider: 'openai' },
        jdText: 'the description',
        scoring: { total: 71 },
        baseCvId: 12,
        matchingCvs: [],
      },
    ]);
  });

  it('reads the context at call time, so a restore after a rescore sees the new score', async () => {
    await store.restoreFromCache();
    cache.set({ total: 88 });
    await store.restoreFromCache();

    expect(restored[0].scoring).toBeNull();
    expect(restored[1].scoring).toEqual({ total: 88 });
  });

  it('cancels against the job now open', () => {
    store.cancel();

    expect(cancelled).toEqual([4]);
  });

  // `cancelled` is not part of a run: it records that the user stopped one, and
  // it survives the reset that ends that run so the page can say so. Moving to
  // another job is the one moment that stops being true, which is why clearing
  // it lives here rather than inside `TailoringService.reset()`.
  it('clears the user-cancelled flag as well as the run state', () => {
    cancelledFlag.set(true);

    store.reset();

    expect(resets).toBe(1);
    expect(cancelledFlag()).toBe(false);
  });

  describe('start', () => {
    it('clears the state a run invalidates but does not own, before running', async () => {
      postTailorSaved.set(true);

      await store.start();

      expect(exportStatus()).toBe('');
      expect(lastExport()).toBeNull();
      expect(postTailorSaved()).toBe(false);
      expect(calls).toEqual(['clearScore:4', 'resetFinalChecks']);
      expect(ran.length).toBe(1);
    });
  });

  describe('goToStep', () => {
    it('auto-runs the rescore once on the updated-score step, after three passes', () => {
      results.set([1, 2, 3].map((pass) => ({ pass, resultMd: `pass ${pass}` })));

      store.goToStep(2);

      expect(calls).toEqual(['goTo:4:2', 'rescore']);
    });

    // Entering the step mid-tailor would otherwise spend tokens rescoring a CV
    // the pipeline has not finished writing.
    it('does not rescore when the third pass has not landed', () => {
      results.set([{ pass: 1, resultMd: 'pass 1' }]);

      store.goToStep(2);

      expect(calls).toEqual(['goTo:4:2']);
    });

    it('does not rescore twice when a result is already in hand or a run is in flight', () => {
      results.set([1, 2, 3].map((pass) => ({ pass, resultMd: `pass ${pass}` })));
      rescoreResult.set({ total: 81 });

      store.goToStep(2);
      rescoreResult.set(null);
      rescoreRunning.set(true);
      store.goToStep(2);

      expect(calls).toEqual(['goTo:4:2', 'goTo:4:2']);
    });

    it('prepares the drafts on the documents step', () => {
      store.goToStep(3);

      expect(calls).toEqual(['goTo:4:3', 'prepareDocuments']);
    });

    // Continuing past the updated-score step is what commits the new score to
    // My Jobs - the rescore itself stays in memory until then.
    it('commits the post-tailor score on the export step', () => {
      store.goToStep(4);

      expect(calls).toEqual(['goTo:4:4', 'save']);
    });
  });

  describe('resetWizard', () => {
    it('throws away one session without clearing the user-cancelled flag', () => {
      cancelledFlag.set(true);
      postTailorSaved.set(true);

      store.resetWizard();

      expect(resets).toBe(1);
      expect(exportStatus()).toBe('');
      expect(exportError()).toBe(false);
      expect(postTailorSaved()).toBe(false);
      expect(calls).toEqual(['clearScore:4']);
      // The job did not change, so "the user stopped a run" is still true.
      expect(cancelledFlag()).toBe(true);
    });

    it('start over resets and returns to the tailor step', () => {
      store.startOver();

      expect(resets).toBe(1);
      expect(calls).toEqual(['clearScore:4', 'goTo:4:1']);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Application, DocumentLibraryItem, Job } from '@applye/core';
import { JobActionsService } from './job-actions.service';
import { JobActionsStore } from './job-actions.store';
import { JobDetailLifecycleStore } from './job-detail-lifecycle.store';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentsStore } from './job-documents.store';
import { JobScoringStore } from './job-scoring.store';
import { JobTailoringStore } from './job-tailoring.store';
import { TailoringDiscardService } from './tailoring-discard.service';
import { TailoringPassDraftsService } from './tailoring-pass-drafts.service';
import { WizardNavService } from './wizard-nav.service';

describe('JobActionsStore', () => {
  let store: JobActionsStore;
  let passDrafts: TailoringPassDraftsService;
  let job: ReturnType<typeof signal<Job | null>>;
  let application: ReturnType<typeof signal<Application | null>>;
  let jdText: ReturnType<typeof signal<string>>;
  let busy: ReturnType<typeof signal<boolean>>;
  let wizardOpen: ReturnType<typeof signal<boolean>>;
  let saveResult: Application | null;
  let createApplicationResult: Application | null;
  let applyResult: Application | null;
  let removeResult: boolean;
  let discardResult: boolean;
  let committed: string[];
  /** Every collaborator call, in order, so an action's effects read as one list. */
  let calls: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    job = signal<Job | null>({ id: 3, title: 'Angular dev', jdText: 'saved text' } as Job);
    application = signal<Application | null>(null);
    jdText = signal('edited text');
    busy = signal(false);
    wizardOpen = signal(true);
    saveResult = { id: 9, status: 'saved' } as Application;
    createApplicationResult = { id: 9, status: 'saved' } as Application;
    applyResult = { id: 9, status: 'applied' } as Application;
    removeResult = true;
    discardResult = true;
    committed = [];
    calls = [];

    TestBed.configureTestingModule({
      providers: [
        JobActionsStore,
        TailoringPassDraftsService,
        {
          provide: JobDetailStore,
          useValue: { job, application, jdText },
        },
        {
          provide: JobActionsService,
          useValue: {
            busy,
            deleteConfirmOpen: signal(false),
            openDeleteConfirm: () => calls.push('openDeleteConfirm'),
            save: (id: number) => {
              calls.push(`save:${id}`);
              return Promise.resolve(saveResult);
            },
            createApplication: async (ensure: () => Promise<void>, commit: () => Promise<void>) => {
              calls.push('createApplication');
              await ensure();
              await commit();
              return createApplicationResult;
            },
            apply: (id: number, jobId: number) => {
              calls.push(`apply:${id}:${jobId}`);
              return Promise.resolve(applyResult);
            },
            remove: (id: number) => {
              calls.push(`remove:${id}`);
              return Promise.resolve(removeResult);
            },
          },
        },
        {
          provide: JobDocumentsStore,
          useValue: {
            cv: () => ({ id: 1 }) as DocumentLibraryItem,
            coverLetter: () => null,
            ensureApplicationDraft: () => {
              calls.push('ensureDraft');
              return Promise.resolve();
            },
            commit: (md: string) => {
              committed.push(md);
              return Promise.resolve();
            },
          },
        },
        { provide: JobTailoringStore, useValue: { finalCvMd: () => 'the tailored CV' } },
        {
          provide: JobScoringStore,
          useValue: {
            savePostTailorScore: () => {
              calls.push('saveScore');
              return Promise.resolve();
            },
          },
        },
        {
          provide: JobDetailLifecycleStore,
          useValue: {
            resetJobScopedState: () => calls.push('resetJobScoped'),
            loadJob: (id: number) => {
              calls.push(`loadJob:${id}`);
              return Promise.resolve();
            },
          },
        },
        {
          provide: WizardNavService,
          useValue: {
            open: wizardOpen,
            forget: (id: number | undefined) => calls.push(`forget:${id}`),
            close: (id: number | undefined) => calls.push(`close:${id}`),
            requestOpen: (id: number | undefined) => calls.push(`requestOpen:${id}`),
            requestScrollTop: () => calls.push('scrollTop'),
          },
        },
        {
          provide: TailoringDiscardService,
          useValue: {
            ask: () => calls.push('askDiscard'),
            discard: () => {
              calls.push('discard');
              return Promise.resolve(discardResult);
            },
          },
        },
      ],
    });
    store = TestBed.inject(JobActionsStore);
    passDrafts = TestBed.inject(TailoringPassDraftsService);
    passDrafts.record(3, 11);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('saveJob', () => {
    it('writes the returned application back onto the screen', async () => {
      await store.saveJob();

      expect(calls).toEqual(['save:3']);
      expect(application()).toEqual({ id: 9, status: 'saved' });
    });

    // A save that failed already reported itself; overwriting the row with null
    // would additionally erase the status the screen is showing.
    it('leaves the application alone when the save came back empty', async () => {
      saveResult = null;
      application.set({ id: 9, status: 'saved' } as Application);

      await store.saveJob();

      expect(application()).toEqual({ id: 9, status: 'saved' });
    });

    it('does nothing without a job', async () => {
      job.set(null);

      await store.saveJob();

      expect(calls).toEqual([]);
    });
  });

  describe('createApplication', () => {
    it('commits the tailored CV and asks the caller to leave', async () => {
      const leave = await store.createApplication();

      expect(leave).toBe(true);
      expect(calls).toEqual(['createApplication', 'ensureDraft', 'forget:3']);
      expect(committed).toEqual(['the tailored CV']);
      expect(application()).toEqual({ id: 9, status: 'saved' });
    });

    // The navigation is the page's, so a failed write must not report a move
    // the user should make - it would leave a job with no application at all.
    it('does not ask the caller to leave when the write failed', async () => {
      createApplicationResult = null;

      expect(await store.createApplication()).toBe(false);
    });
  });

  describe('applyNow', () => {
    it('flips the status and writes no documents', async () => {
      application.set({ id: 9, status: 'saved' } as Application);

      await store.applyNow();

      expect(calls).toEqual(['apply:9:3']);
      expect(committed).toEqual([]);
      expect(application()).toEqual({ id: 9, status: 'applied' });
    });

    it('does nothing without an application to flip', async () => {
      await store.applyNow();

      expect(calls).toEqual([]);
    });

    it('leaves the application alone when the write failed', async () => {
      application.set({ id: 9, status: 'saved' } as Application);
      applyResult = null;

      await store.applyNow();

      expect(application()).toEqual({ id: 9, status: 'saved' });
    });
  });

  describe('confirmDeleteJob', () => {
    it('reports the delete so the caller can leave a screen with no job', async () => {
      expect(await store.confirmDeleteJob()).toBe(true);
      expect(calls).toEqual(['remove:3']);
    });

    it('reports nothing to leave for when the delete failed', async () => {
      removeResult = false;

      expect(await store.confirmDeleteJob()).toBe(false);
    });
  });

  describe('discardTailoring', () => {
    // `B1`, the visible half: the reset empties the screen and `enterJob` will
    // not re-read - the route param has not changed, so the id it loaded is
    // still the id it is on. Without the reload the job rendered blank, and its
    // cached score and linked documents only came back by leaving and
    // re-entering from My Jobs.
    it('resets the job-scoped state, re-reads the job, and returns to the top', async () => {
      await store.discardTailoring();

      expect(calls).toEqual(['discard', 'resetJobScoped', 'loadJob:3', 'forget:3', 'scrollTop']);
    });

    // Nothing was destroyed, so nothing on the page should move: the reason is
    // already on the status line and the confirmation is still open.
    it('moves nothing when the discard was refused', async () => {
      discardResult = false;

      await store.discardTailoring();

      expect(calls).toEqual(['discard']);
    });
  });

  describe('updateApplication', () => {
    it('commits, saves the score, then reloads the job after the success card', async () => {
      await store.updateApplication();

      expect(committed).toEqual(['the tailored CV']);
      expect(calls).toEqual(['saveScore', 'forget:3']);
      expect(store.applyResult()).toBe('updated');
      expect(store.busy()).toBe(true);
      expect(wizardOpen()).toBe(true);

      jest.runAllTimers();
      await Promise.resolve();

      expect(store.applyResult()).toBeNull();
      expect(store.busy()).toBe(false);
      expect(wizardOpen()).toBe(false);
      expect(calls).toEqual(['saveScore', 'forget:3', 'loadJob:3', 'scrollTop']);
    });

    // Re-entrancy: the success card is on screen for over two seconds, and the
    // button behind it stays mounted.
    it('ignores a second call while one is still in flight', async () => {
      busy.set(true);

      await store.updateApplication();

      expect(calls).toEqual([]);
      expect(committed).toEqual([]);
    });
  });

  describe('canMarkApplied', () => {
    it('is true with no application, and while one is still saved', () => {
      expect(store.canMarkApplied()).toBe(true);

      application.set({ id: 9, status: 'saved' } as Application);

      expect(store.canMarkApplied()).toBe(true);
    });

    it('is false once the application has left saved - applied is terminal (P2)', () => {
      application.set({ id: 9, status: 'interview' } as Application);

      expect(store.canMarkApplied()).toBe(false);
      expect(store.jobLocked()).toBe(true);
    });
  });

  describe('the wizard passthroughs', () => {
    it('open, close and ask-discard address the job now open', () => {
      store.openWizard();
      store.closeWizard();
      store.askDiscardTailoring();
      store.openDeleteConfirm();

      expect(calls).toEqual(['requestOpen:3', 'close:3', 'askDiscard', 'openDeleteConfirm']);
    });
  });

  // Every way a pass can end has to disown its drafts, or the next pass's
  // discard inherits authority over documents it did not create - which is the
  // shape of `B1` all over again. The discard path disowns them inside
  // `TailoringDiscardService`, where the delete succeeds or does not.
  describe('ending a tailoring pass disowns its drafts', () => {
    it('on closing the wizard back to the summary', () => {
      store.closeWizard();

      expect(passDrafts.ids(3)).toEqual([]);
    });

    it('on creating the application', async () => {
      await store.createApplication();

      expect(passDrafts.ids(3)).toEqual([]);
    });

    it('on updating an application that already has a status', async () => {
      await store.updateApplication();

      expect(passDrafts.ids(3)).toEqual([]);
    });

    it('leaves the pass alone when the write failed', async () => {
      createApplicationResult = null;

      await store.createApplication();

      expect(passDrafts.ids(3)).toEqual([11]);
    });
  });
});

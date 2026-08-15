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
import { WizardNavService } from './wizard-nav.service';

describe('JobActionsStore', () => {
  let store: JobActionsStore;
  let job: ReturnType<typeof signal<Job | null>>;
  let application: ReturnType<typeof signal<Application | null>>;
  let jdText: ReturnType<typeof signal<string>>;
  let editingLocked: ReturnType<typeof signal<boolean>>;
  let busy: ReturnType<typeof signal<boolean>>;
  let wizardOpen: ReturnType<typeof signal<boolean>>;
  let saveResult: Application | null;
  let markAppliedResult: Application | null;
  let removeResult: boolean;
  let discardResult: boolean;
  let committed: string[];
  /** Every collaborator call, in order, so an action's effects read as one list. */
  let calls: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    job = signal<Job | null>({ id: 3, title: 'Angular dev', jdText: 'saved text' } as Job);
    application = signal<Application | null>(null);
    jdText = signal('edited text');
    editingLocked = signal(true);
    busy = signal(false);
    wizardOpen = signal(true);
    saveResult = { id: 9, status: 'saved' } as Application;
    markAppliedResult = { id: 9, status: 'applied' } as Application;
    removeResult = true;
    discardResult = true;
    committed = [];
    calls = [];

    TestBed.configureTestingModule({
      providers: [
        JobActionsStore,
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
            markApplied: async (ensure: () => Promise<void>, commit: () => Promise<void>) => {
              calls.push('markApplied');
              await ensure();
              await commit();
              return markAppliedResult;
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
            editingLocked,
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

  describe('markApplied', () => {
    it('commits the tailored CV, unlocks editing, and asks the caller to leave', async () => {
      const leave = await store.markApplied();

      expect(leave).toBe(true);
      expect(calls).toEqual(['markApplied', 'ensureDraft', 'forget:3']);
      expect(committed).toEqual(['the tailored CV']);
      expect(application()).toEqual({ id: 9, status: 'applied' });
      expect(editingLocked()).toBe(false);
    });

    // The navigation is the page's, so a failed transition must not report a
    // move the user should make - it would leave a job that is still 'saved'.
    it('does not ask the caller to leave when the transition failed', async () => {
      markAppliedResult = null;

      expect(await store.markApplied()).toBe(false);
      expect(editingLocked()).toBe(true);
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

  describe('cancelEditingLocked', () => {
    it('drops the override and reverts the in-progress description edit', () => {
      store.cancelEditingLocked();

      expect(editingLocked()).toBe(false);
      expect(jdText()).toBe('saved text');
    });
  });

  describe('discardTailoring', () => {
    it('resets the job-scoped state and returns to the top of the summary', async () => {
      await store.discardTailoring();

      expect(calls).toEqual(['discard', 'resetJobScoped', 'forget:3', 'scrollTop']);
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
      editingLocked.set(false);

      expect(store.canMarkApplied()).toBe(true);

      application.set({ id: 9, status: 'saved' } as Application);

      expect(store.canMarkApplied()).toBe(true);
    });

    it('is false once the application has left saved, unless the user overrode it', () => {
      editingLocked.set(false);
      application.set({ id: 9, status: 'interview' } as Application);

      expect(store.canMarkApplied()).toBe(false);
      expect(store.jobLocked()).toBe(true);

      editingLocked.set(true);

      expect(store.canMarkApplied()).toBe(true);
      expect(store.jobLocked()).toBe(false);
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
});

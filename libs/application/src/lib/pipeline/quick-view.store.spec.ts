import { TestBed } from '@angular/core/testing';
import type { Application, Comment, InterviewStage } from '@applye/core';
import { DbService, DocumentsGateway, InterviewGateway, JobsGateway } from '@applye/data';
import { QuickViewStore } from './quick-view.store';

const comment = (over: Partial<Comment> = {}): Comment =>
  ({ id: 1, commentText: 'Called back', ...over }) as Comment;

const stage = (over: Partial<InterviewStage> = {}): InterviewStage =>
  ({
    id: 1,
    stageOrder: 1,
    stageLabel: 'HR screen',
    status: 'scheduled',
    ...over,
  }) as InterviewStage;

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    listApplicationComments: jest.fn().mockResolvedValue([comment()]),
    listInterviewStages: jest.fn().mockResolvedValue([stage()]),
    setApplicationStatus: jest.fn().mockResolvedValue({ id: 7, status: 'offer' } as Application),
    setApplicationPriority: jest.fn().mockResolvedValue(undefined),
    addApplicationComment: jest.fn().mockResolvedValue(comment({ id: 2, commentText: 'New' })),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      QuickViewStore,
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: InterviewGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(QuickViewStore), db };
}

describe('QuickViewStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('comments', () => {
    it('loads the application comments', async () => {
      const { store } = createStore();
      expect(await store.loadComments(7)).toBe(true);
      expect(store.comments()).toHaveLength(1);
      expect(store.commentsLoading()).toBe(false);
    });

    it('keeps the error text when the comments cannot be read', async () => {
      const { store } = createStore({
        listApplicationComments: jest.fn().mockRejectedValue(new Error('db down')),
      });
      expect(await store.loadComments(7)).toBe(false);
      expect(store.commentsError()).toBe('Error: db down');
      expect(store.commentsLoading()).toBe(false);
    });

    it('appends the new comment and clears the box', async () => {
      const { store } = createStore();
      await store.loadComments(7);
      store.commentText.set('  New  ');

      expect(await store.addComment(7)).toBe(true);
      expect(store.comments().map((c) => c.id)).toEqual([1, 2]);
      expect(store.commentText()).toBe('');
    });

    it('trims before writing, so a space-only comment never reaches the gateway', async () => {
      const { store, db } = createStore();
      store.commentText.set('   ');
      expect(await store.addComment(7)).toBe(false);
      expect(db.addApplicationComment).not.toHaveBeenCalled();
      expect(store.commentsError()).toBe('');
    });

    /** A failed write must not lose what the user typed - retyping a comment
     * because the database blinked is the worst outcome available here. */
    it('keeps the text when the write fails', async () => {
      const { store } = createStore({
        addApplicationComment: jest.fn().mockRejectedValue(new Error('locked')),
      });
      store.commentText.set('Worth keeping');

      expect(await store.addComment(7)).toBe(false);
      expect(store.commentText()).toBe('Worth keeping');
      expect(store.commentsError()).toBe('Error: locked');
    });
  });

  describe('stages', () => {
    it('sorts the stage list and picks the current one', async () => {
      const { store } = createStore({
        listInterviewStages: jest
          .fn()
          .mockResolvedValue([stage({ id: 2, stageOrder: 2 }), stage({ id: 1, stageOrder: 1 })]),
      });
      await store.refreshStages(7, 'interview');

      expect(store.stages().map((s) => s.id)).toEqual([1, 2]);
      expect(store.stageSummary()?.id).toBe(2);
      expect(store.stagesLoading()).toBe(false);
    });

    /**
     * An application that is not at `interview` has no stage state to show, so
     * asking for it would be a read that can only return nothing.
     */
    it('clears the stage state without a call when the card is not at interview', async () => {
      const { store, db } = createStore();
      await store.refreshStages(7, 'offer');

      expect(db.listInterviewStages).not.toHaveBeenCalled();
      expect(store.stages()).toEqual([]);
      expect(store.stageSummary()).toBeNull();
      expect(store.stagesLoading()).toBe(false);
    });

    /**
     * The stepper renders an empty `stages` as "no stages yet". That is true of
     * an application that has none and false of one whose read failed, and this
     * used to be a `try`/`finally` with no `catch` called as
     * `void refreshStages(...)` from an effect - so the rejection surfaced as a
     * bare global toast while the stepper went on claiming there were no
     * stages. Reports like `loadComments` does now.
     */
    it('reports a failed stage read instead of leaving the stepper empty and silent', async () => {
      const { store } = createStore({
        listInterviewStages: jest.fn().mockRejectedValue(new Error('db gone')),
      });

      expect(await store.refreshStages(7, 'interview')).toBe(false);
      expect(store.stagesError()).toContain('db gone');
      expect(store.error()).toContain('db gone');
      expect(store.stagesLoading()).toBe(false);
    });

    it('clears a previous stage error on the next successful read', async () => {
      const { store } = createStore({
        listInterviewStages: jest
          .fn()
          .mockRejectedValueOnce(new Error('db gone'))
          .mockResolvedValue([stage({ id: 1, stageOrder: 1 })]),
      });
      await store.refreshStages(7, 'interview');
      expect(store.stagesError()).not.toBe('');

      expect(await store.refreshStages(7, 'interview')).toBe(true);
      expect(store.stagesError()).toBe('');
    });

    it('records a stage the quick-add form just created', () => {
      const { store } = createStore();
      store.noteStageAdded(stage({ id: 9, stageOrder: 1 }));
      expect(store.stageSummary()?.id).toBe(9);
    });
  });

  describe('status', () => {
    it('returns the whole written row, not just the status', async () => {
      const { store } = createStore();
      const updated = await store.setStatus(7, 'applied', 'offer');
      expect(updated?.status).toBe('offer');
      expect(store.statusBusy()).toBe(false);
    });

    /** Selecting the status a card already has is not a write. */
    it('refuses without an error when the status is unchanged', async () => {
      const { store, db } = createStore();
      expect(await store.setStatus(7, 'offer', 'offer')).toBeNull();
      expect(db.setApplicationStatus).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('reports a failed write through error and clears busy', async () => {
      const { store } = createStore({
        setApplicationStatus: jest.fn().mockRejectedValue(new Error('locked')),
      });
      expect(await store.setStatus(7, 'applied', 'offer')).toBeNull();
      expect(store.error()).toBe('Error: locked');
      expect(store.statusBusy()).toBe(false);
    });
  });

  describe('priority', () => {
    it('writes a changed priority', async () => {
      const { store, db } = createStore();
      expect(await store.setPriority(7, null, 'high')).toBe(true);
      expect(db.setApplicationPriority).toHaveBeenCalledWith(7, 'high');
    });

    /** A card with no priority and a click on "none" is the same value, and
     * `undefined` must compare equal to `null` or clearing an unset priority
     * would write every time. */
    it('treats an unset priority and null as the same value', async () => {
      const { store, db } = createStore();
      expect(await store.setPriority(7, undefined as never, null)).toBe(false);
      expect(db.setApplicationPriority).not.toHaveBeenCalled();
    });

    it('reports a failed write through error', async () => {
      const { store } = createStore({
        setApplicationPriority: jest.fn().mockRejectedValue(new Error('locked')),
      });
      expect(await store.setPriority(7, null, 'low')).toBe(false);
      expect(store.error()).toBe('Error: locked');
      expect(store.priorityBusy()).toBe(false);
    });
  });
});

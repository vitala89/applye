import { TestBed } from '@angular/core/testing';
import type { InterviewStage } from '@applye/core';
import { DbService, DocumentsGateway, InterviewGateway, JobsGateway } from '@applye/data';
import { InterviewStagesStore } from './interview-stages.store';

const stage = (over: Partial<InterviewStage> = {}): InterviewStage =>
  ({
    id: 1,
    applicationId: 7,
    stageOrder: 1,
    stageType: 'hr_screen',
    stageLabel: 'HR screen',
    status: 'scheduled',
    ...over,
  }) as InterviewStage;

function createStore(over: Record<string, jest.Mock> = {}, stages: InterviewStage[] = [stage()]) {
  const db = {
    listPipelineCards: jest.fn().mockResolvedValue([{ id: 7, company: 'Acme' }]),
    listInterviewStages: jest.fn().mockResolvedValue(stages),
    createInterviewStage: jest
      .fn()
      .mockImplementation(async (input) => stage({ id: 99, ...input })),
    updateInterviewStage: jest
      .fn()
      .mockImplementation(async (input) => stage({ ...input, id: input.stageId })),
    deleteInterviewStage: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      InterviewStagesStore,
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: InterviewGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(InterviewStagesStore), db };
}

describe('InterviewStagesStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('loading', () => {
    it('finds the application among the pipeline cards', async () => {
      const { store } = createStore();

      expect(await store.load(7)).toBe(true);
      expect(store.application()?.id).toBe(7);
      expect(store.applicationId()).toBe(7);
      expect(store.loading()).toBe(false);
    });

    /** A card that is not in the pipeline is null rather than an error - the
     * timeline still renders, it just has no header row to name. */
    it('leaves the application null when no card matches', async () => {
      const { store } = createStore({ listPipelineCards: jest.fn().mockResolvedValue([]) });

      expect(await store.load(7)).toBe(true);
      expect(store.application()).toBeNull();
    });

    it('records a failure and leaves the timeline empty', async () => {
      const { store } = createStore({
        listInterviewStages: jest.fn().mockRejectedValue(new Error('gone')),
      });

      expect(await store.load(7)).toBe(false);
      expect(store.error()).toContain('gone');
      expect(store.stages()).toEqual([]);
    });
  });

  describe('the modal', () => {
    it('opens add on a clean form', async () => {
      const { store } = createStore();
      await store.load(7);
      store.updateForm('stageLabel', 'typed earlier');

      store.openAdd();

      expect(store.form().stageLabel).toBe('');
      expect(store.modalMode()).toBe('add');
      expect(store.labelError()).toBe(false);
    });

    it('fills the form from the stage being edited, nulls becoming blanks', async () => {
      const { store } = createStore();
      await store.load(7);

      store.openEdit(stage({ id: 3, stageLabel: 'Technical', interviewerName: undefined }));

      expect(store.modalMode()).toBe('edit');
      expect(store.editingId()).toBe(3);
      expect(store.form().stageLabel).toBe('Technical');
      expect(store.form().interviewerName).toBe('');
    });

    /** A blank label is a refusal: the field says so itself, so there is
     * nothing for the page to toast and `error` stays clear. */
    it('refuses a blank label without reaching the gateway', async () => {
      const { store, db } = createStore();
      await store.load(7);
      store.openAdd();
      store.updateForm('stageLabel', '   ');

      expect(await store.saveModal()).toBeNull();
      expect(store.labelError()).toBe(true);
      expect(store.error()).toBe('');
      expect(db.createInterviewStage).not.toHaveBeenCalled();
    });

    it('clears the label error as soon as something is typed', async () => {
      const { store } = createStore();
      await store.load(7);
      store.openAdd();
      await store.saveModal();

      store.updateForm('stageLabel', 'H');

      expect(store.labelError()).toBe(false);
    });

    it('appends a created stage after the highest order in the list', async () => {
      const { store, db } = createStore({}, [stage({ id: 1, stageOrder: 3 })]);
      await store.load(7);
      store.openAdd();
      store.updateForm('stageLabel', '  Final  ');

      expect(await store.saveModal()).toBe(true);
      expect(db.createInterviewStage).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: 7, stageOrder: 4, stageLabel: 'Final' }),
      );
      expect(store.stages()).toHaveLength(2);
      expect(store.modalOpen()).toBe(false);
    });

    /** An untouched optional must be absent from the write, not written as ''. */
    it('sends unset optionals as undefined', async () => {
      const { store, db } = createStore();
      await store.load(7);
      store.openAdd();
      store.updateForm('stageLabel', 'HR');

      await store.saveModal();

      expect(db.createInterviewStage).toHaveBeenCalledWith(
        expect.objectContaining({ interviewerEmail: undefined, notes: undefined }),
      );
    });

    it('replaces the edited stage in place', async () => {
      const { store } = createStore({}, [stage({ id: 1 }), stage({ id: 2 })]);
      await store.load(7);
      store.openEdit(stage({ id: 2 }));
      store.updateForm('stageLabel', 'Renamed');

      expect(await store.saveModal()).toBe(true);
      expect(store.stages().map((s) => s.id)).toEqual([1, 2]);
      expect(store.stages()[1].stageLabel).toBe('Renamed');
    });

    it('keeps the modal open and records a failed save', async () => {
      const { store } = createStore({
        createInterviewStage: jest.fn().mockRejectedValue(new Error('locked')),
      });
      await store.load(7);
      store.openAdd();
      store.updateForm('stageLabel', 'HR');

      expect(await store.saveModal()).toBe(false);
      expect(store.error()).toContain('locked');
      expect(store.modalOpen()).toBe(true);
      expect(store.saving()).toBe(false);
    });
  });

  /**
   * Found on a rendered screen: the load had failed, and a refusal afterwards
   * left that message standing in `error`. Nothing showed it - the page reads
   * `error` only on `false` - but a store whose `error` does not describe its
   * last answer is one nobody can reason about.
   */
  it('clears an earlier failure when the next call is a refusal', async () => {
    const { store } = createStore({
      listInterviewStages: jest.fn().mockRejectedValue(new Error('gone')),
    });
    await store.load(7);
    expect(store.error()).toContain('gone');

    store.openAdd();
    expect(await store.saveModal()).toBeNull();

    expect(store.error()).toBe('');
  });

  describe('status', () => {
    /** Choosing the status a stage already has is not a write. */
    it('refuses an unchanged status', async () => {
      const { store, db } = createStore();
      await store.load(7);

      expect(await store.setStatus(stage({ status: 'scheduled' }), 'scheduled')).toBeNull();
      expect(db.updateInterviewStage).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('closes the menu and replaces the row on success', async () => {
      const { store } = createStore();
      await store.load(7);
      store.toggleStatusMenu(stage({ id: 1 }));

      expect(await store.setStatus(stage({ id: 1 }), 'passed')).toBe(true);
      expect(store.statusMenuId()).toBeNull();
      expect(store.stages()[0].status).toBe('passed');
    });

    it('records a failed status write', async () => {
      const { store } = createStore({
        updateInterviewStage: jest.fn().mockRejectedValue(new Error('nope')),
      });
      await store.load(7);

      expect(await store.setStatus(stage({ id: 1 }), 'passed')).toBe(false);
      expect(store.error()).toContain('nope');
      expect(store.stages()[0].status).toBe('scheduled');
    });
  });

  describe('deleting', () => {
    it('refuses when nothing is targeted', async () => {
      const { store, db } = createStore();
      await store.load(7);

      expect(await store.confirmDelete()).toBeNull();
      expect(db.deleteInterviewStage).not.toHaveBeenCalled();
    });

    it('removes the stage and closes the confirmation', async () => {
      const { store } = createStore({}, [stage({ id: 1 }), stage({ id: 2 })]);
      await store.load(7);
      store.askDelete(stage({ id: 1 }));

      expect(await store.confirmDelete()).toBe(true);
      expect(store.stages().map((s) => s.id)).toEqual([2]);
      expect(store.confirmStage()).toBeNull();
    });

    it('closes the confirmation after a failure too, having recorded it', async () => {
      const { store } = createStore({
        deleteInterviewStage: jest.fn().mockRejectedValue(new Error('busy')),
      });
      await store.load(7);
      store.askDelete(stage({ id: 1 }));

      expect(await store.confirmDelete()).toBe(false);
      expect(store.error()).toContain('busy');
      expect(store.stages()).toHaveLength(1);
      expect(store.confirmStage()).toBeNull();
    });
  });

  describe('reordering', () => {
    it('refuses at both ends of the list', async () => {
      const { store, db } = createStore({}, [stage({ id: 1 }), stage({ id: 2, stageOrder: 2 })]);
      await store.load(7);

      expect(await store.moveUp(0)).toBeNull();
      expect(await store.moveDown(1)).toBeNull();
      expect(db.updateInterviewStage).not.toHaveBeenCalled();
    });

    it('swaps the two orders and re-sorts', async () => {
      const { store } = createStore({}, [
        stage({ id: 1, stageOrder: 1 }),
        stage({ id: 2, stageOrder: 2 }),
      ]);
      await store.load(7);

      expect(await store.moveDown(0)).toBe(true);
      expect(store.stages().map((s) => s.id)).toEqual([2, 1]);
    });

    /**
     * Nothing moves until both writes come back, so a failure leaves the
     * timeline as it was rather than showing an order the database does not
     * have.
     */
    it('leaves the order untouched when a swap fails', async () => {
      const { store } = createStore(
        { updateInterviewStage: jest.fn().mockRejectedValue(new Error('conflict')) },
        [stage({ id: 1, stageOrder: 1 }), stage({ id: 2, stageOrder: 2 })],
      );
      await store.load(7);

      expect(await store.moveDown(0)).toBe(false);
      expect(store.error()).toContain('conflict');
      expect(store.stages().map((s) => s.id)).toEqual([1, 2]);
    });
  });
});

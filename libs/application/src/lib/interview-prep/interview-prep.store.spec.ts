import { TestBed } from '@angular/core/testing';
import type { PipelineCard } from '@applye/core';
import { DbService } from '@applye/data';
import { InterviewPrepStore } from './interview-prep.store';

const card = (over: Partial<PipelineCard> = {}): PipelineCard =>
  ({ id: 1, company: 'Acme', title: 'Engineer', ...over }) as PipelineCard;

/** A card with a stage, which is what puts it on this list at all. */
const staged = (over: Partial<PipelineCard> = {}): PipelineCard =>
  card({ currentStageOrder: 1, currentStageStatus: 'scheduled', ...over });

function createStore(cards: PipelineCard[], over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    listPipelineCards: jest.fn().mockResolvedValue(cards),
    listInterviewStages: jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]),
    deleteInterviewStage: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [InterviewPrepStore, { provide: DbService, useValue: db }],
  });
  return { store: TestBed.inject(InterviewPrepStore), db };
}

describe('InterviewPrepStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists only applications that have a stage', async () => {
    const { store } = createStore([
      staged({ id: 1 }),
      card({ id: 2 }), // no stage - belongs to Pipeline, not here
    ]);
    await store.load();
    expect(store.rows().map((r) => r.id)).toEqual([1]);
  });

  /** A date the user has not set should not outrank one they have, so
   * unscheduled rows sink rather than sorting as "empty string first". */
  it('sorts soonest first and sinks the unscheduled', async () => {
    const { store } = createStore([
      staged({ id: 1, currentStageScheduledAt: '2026-09-10' }),
      staged({ id: 2 }),
      staged({ id: 3, currentStageScheduledAt: '2026-09-01' }),
    ]);
    await store.load();
    expect(store.rows().map((r) => r.id)).toEqual([3, 1, 2]);
  });

  /**
   * `nextAt` stays the stored ISO string: formatting is presentation and
   * locale-dependent, and this layer holds neither.
   */
  it('reports the next scheduled stage as a raw date, not formatted text', async () => {
    const { store } = createStore([
      staged({ id: 1, currentStageScheduledAt: '2026-09-10', company: 'Acme' }),
      staged({ id: 2, currentStageStatus: 'done', currentStageScheduledAt: '2026-08-01' }),
    ]);
    await store.load();
    expect(store.stats()).toEqual({
      tracking: 2,
      upcoming: 1,
      nextAt: '2026-09-10',
      nextCompany: 'Acme',
    });
  });

  it('reports no next stage when nothing is scheduled', async () => {
    const { store } = createStore([staged({ id: 1, currentStageStatus: 'done' })]);
    await store.load();
    expect(store.stats().nextAt).toBeNull();
    expect(store.stats().nextCompany).toBe('');
  });

  it('keeps the error text when the list cannot be read', async () => {
    const { store } = createStore([], {
      listPipelineCards: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect(await store.load()).toBe(false);
    expect(store.error()).toBe('Error: db down');
    expect(store.loading()).toBe(false);
  });

  it('opens and closes one row menu at a time', async () => {
    const { store } = createStore([staged({ id: 1 }), staged({ id: 2 })]);
    await store.load();

    store.toggleMenu(1);
    expect(store.menuId()).toBe(1);
    store.toggleMenu(2);
    expect(store.menuId()).toBe(2);
    store.toggleMenu(2);
    expect(store.menuId()).toBeNull();
  });

  it('closes the menu when the confirmation opens', async () => {
    const { store } = createStore([staged({ id: 1 })]);
    await store.load();
    store.toggleMenu(1);
    store.askRemove(1);
    expect(store.menuId()).toBeNull();
    expect(store.confirmRow()?.id).toBe(1);
  });

  it('deletes every stage of the confirmed application', async () => {
    const { store, db } = createStore([staged({ id: 1, currentStageScheduledAt: '2026-09-10' })]);
    await store.load();
    store.askRemove(1);

    expect(await store.confirmRemove()).toBe(true);
    expect(db.listInterviewStages).toHaveBeenCalledWith(1);
    expect(db.deleteInterviewStage).toHaveBeenCalledTimes(2);
  });

  /**
   * The row is cleared in place rather than by reloading: a reload would
   * re-sort every other row under the user while they are looking at it.
   */
  it('drops the row from the list without reloading it', async () => {
    const { store, db } = createStore([staged({ id: 1 }), staged({ id: 2 })]);
    await store.load();
    store.askRemove(1);
    await store.confirmRemove();

    expect(store.rows().map((r) => r.id)).toEqual([2]);
    expect(db.listPipelineCards).toHaveBeenCalledTimes(1);
  });

  it('refuses when nothing is confirmed, and says nothing about it', async () => {
    const { store, db } = createStore([staged({ id: 1 })]);
    await store.load();
    expect(await store.confirmRemove()).toBe(false);
    expect(store.error()).toBe('');
    expect(db.listInterviewStages).not.toHaveBeenCalled();
  });

  it('reports a failed delete through error and closes the confirmation', async () => {
    const { store } = createStore([staged({ id: 1 })], {
      deleteInterviewStage: jest.fn().mockRejectedValue(new Error('locked')),
    });
    await store.load();
    store.askRemove(1);

    expect(await store.confirmRemove()).toBe(false);
    expect(store.error()).toBe('Error: locked');
    expect(store.removing()).toBe(false);
    expect(store.confirmId()).toBeNull();
    // The row survives a failed delete - the list must not lie about what was removed.
    expect(store.rows().map((r) => r.id)).toEqual([1]);
  });
});

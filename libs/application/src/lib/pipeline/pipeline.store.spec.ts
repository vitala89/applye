import { TestBed } from '@angular/core/testing';
import type { Application, ApplicationStatus, InterviewStage, PipelineCard } from '@applye/core';
import { DbService, DocumentsGateway, InterviewGateway } from '@applye/data';
import { PipelineStore } from './pipeline.store';

const COLUMNS: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'cancelled'];

const card = (over: Partial<PipelineCard> = {}): PipelineCard =>
  ({ id: 1, status: 'applied', company: 'Acme', title: 'Engineer', ...over }) as PipelineCard;

const app = (over: Partial<Application> = {}): Application =>
  ({ id: 1, status: 'interview', ...over }) as Application;

/** Yesterday and tomorrow, so `overdue` is exercised against a real clock
 * rather than a date frozen into the test. */
const shift = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function createStore(cards: PipelineCard[], over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    listPipelineCards: jest.fn().mockResolvedValue(cards),
    setApplicationStatus: jest.fn().mockResolvedValue(app()),
    listInterviewStages: jest.fn().mockResolvedValue([]),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PipelineStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: InterviewGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(PipelineStore), db };
}

describe('PipelineStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('files each card under the column its status names', async () => {
    const { store } = createStore([
      card({ id: 1, status: 'applied' }),
      card({ id: 2, status: 'offer' }),
      card({ id: 3, status: 'applied' }),
    ]);
    await store.load(COLUMNS);

    expect(store.cards.applied.map((c) => c.id)).toEqual([1, 3]);
    expect(store.cards.offer.map((c) => c.id)).toEqual([2]);
    expect(store.totalCards()).toBe(3);
  });

  it('keeps the error text when the board cannot be read', async () => {
    const { store } = createStore([], {
      listPipelineCards: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect(await store.load(COLUMNS)).toBe(false);
    expect(store.error()).toBe('Error: db down');
    expect(store.loading()).toBe(false);
  });

  it('counts only the active columns as active, not the archive', async () => {
    const { store } = createStore([
      card({ id: 1, status: 'applied' }),
      card({ id: 2, status: 'interview' }),
      card({ id: 3, status: 'offer' }),
      card({ id: 4, status: 'rejected' }),
      card({ id: 5, status: 'cancelled' }),
    ]);
    await store.load(COLUMNS);
    expect(store.activeCount()).toBe(3);
    expect(store.totalCards()).toBe(5);
  });

  it('searches company, title and location together, case-insensitively', async () => {
    const { store } = createStore([
      card({ id: 1, company: 'Acme', title: 'Engineer', location: 'Berlin' }),
      card({ id: 2, company: 'Globex', title: 'Designer', location: 'Munich' }),
    ]);
    await store.load(COLUMNS);

    store.search.set('BERLIN');
    expect(store.visibleCards('applied').map((c) => c.id)).toEqual([1]);
    store.search.set('design');
    expect(store.matchCount()).toBe(1);
    store.search.set('   ');
    expect(store.matchCount()).toBe(2);
  });

  it('collapses and reveals each terminal column independently', () => {
    const { store } = createStore([]);
    expect(store.isCollapsed('rejected')).toBe(true);
    expect(store.isCollapsed('cancelled')).toBe(true);
    expect(store.isCollapsed('applied')).toBe(false);

    store.toggleCollapsed('rejected');
    expect(store.isCollapsed('rejected')).toBe(false);
    expect(store.isCollapsed('cancelled')).toBe(true);
  });

  /**
   * The card is refreshed from the row the database wrote, not from the status
   * alone: entering `applied` or `interview` recomputes `follow_up_at` in SQL,
   * and `overdue` is derived from it. Mutating only `status` would leave the
   * footer badge stale until a reload.
   */
  it('mirrors the written row onto the card, including derived overdue', async () => {
    const moved = card({ id: 1, status: 'applied' });
    const { store } = createStore([moved], {
      setApplicationStatus: jest
        .fn()
        .mockResolvedValue(app({ id: 1, status: 'interview', followUpAt: shift(-1) })),
    });
    await store.load(COLUMNS);

    expect(await store.persistStatus(moved, 'interview')).toBe(true);
    expect(moved.status).toBe('interview');
    expect(moved.followUpAt).toBe(shift(-1));
    expect(moved.overdue).toBe(true);
  });

  it('does not mark a future follow-up overdue', async () => {
    const moved = card({ id: 1 });
    const { store } = createStore([moved], {
      setApplicationStatus: jest
        .fn()
        .mockResolvedValue(app({ id: 1, status: 'interview', followUpAt: shift(3) })),
    });
    await store.load(COLUMNS);
    await store.persistStatus(moved, 'interview');
    expect(moved.overdue).toBe(false);
  });

  it('reports a failed status write so the caller can put the card back', async () => {
    const moved = card({ id: 1 });
    const { store } = createStore([moved], {
      setApplicationStatus: jest.fn().mockRejectedValue(new Error('locked')),
    });
    await store.load(COLUMNS);

    expect(await store.persistStatus(moved, 'offer')).toBe(false);
    expect(store.error()).toBe('Error: locked');
    // The card is untouched - the board must not show a move the database refused.
    expect(moved.status).toBe('applied');
  });

  it('offers the first-stage prompt only when the application has none', async () => {
    const { store, db } = createStore([]);
    expect(await store.hasNoStages(7)).toBe(true);

    db.listInterviewStages.mockResolvedValue([{ id: 1 } as InterviewStage]);
    expect(await store.hasNoStages(7)).toBe(false);
  });

  /** A failed read must not produce a prompt on an application that may
   * already have stages - the prompt writes, and re-prompting is worse than
   * not prompting. */
  it('does not prompt when the stage check itself fails', async () => {
    const { store } = createStore([], {
      listInterviewStages: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect(await store.hasNoStages(7)).toBe(false);
    expect(store.error()).toBe('Error: db down');
  });

  it('moves a card between columns when the modal changes its status', async () => {
    const { store } = createStore([card({ id: 1, status: 'applied' })]);
    await store.load(COLUMNS);

    store.applyModalStatus(app({ id: 1, status: 'offer' }));

    expect(store.cards.applied).toHaveLength(0);
    expect(store.cards.offer.map((c) => c.id)).toEqual([1]);
    // It stays selected, so the open modal keeps showing the card it was showing.
    expect(store.selectedCard()?.id).toBe(1);
  });

  it('records a stage added from the modal, growing the track if needed', async () => {
    const subject = card({ id: 1, currentStageTotal: 1 });
    const { store } = createStore([subject]);
    await store.load(COLUMNS);

    store.applyModalStage(1, {
      stageOrder: 3,
      stageLabel: 'Final',
      status: 'scheduled',
    } as InterviewStage);

    expect(subject.currentStageOrder).toBe(3);
    expect(subject.currentStageLabel).toBe('Final');
    expect(subject.currentStageTotal).toBe(3);
  });

  it('ignores modal events for a card the board does not hold', async () => {
    const { store } = createStore([card({ id: 1 })]);
    await store.load(COLUMNS);

    expect(() => store.applyModalPriority(999, 'high')).not.toThrow();
    expect(() => store.applyModalStage(999, { stageOrder: 1 } as InterviewStage)).not.toThrow();
    expect(store.selectedCard()).toBeNull();
  });
});

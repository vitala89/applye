import { TestBed } from '@angular/core/testing';
import type { InterviewStage } from '@applye/core';
import { InterviewGateway } from '@applye/data';
import { StageQuickAddStore } from './stage-quick-add.store';

const stage = (over: Partial<InterviewStage> = {}): InterviewStage =>
  ({ id: 3, applicationId: 9, stageOrder: 1, stageType: 'hr_screen', ...over }) as InterviewStage;

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    createInterviewStage: jest.fn().mockResolvedValue(stage()),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [StageQuickAddStore, { provide: InterviewGateway, useValue: db }],
  });
  return { store: TestBed.inject(StageQuickAddStore), db };
}

describe('StageQuickAddStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('writes the first stage with the form it was given', async () => {
    const { store, db } = createStore();
    store.stageLabel.set('Recruiter call');
    store.stageType.set('technical');
    store.scheduledAt.set('2026-09-01');

    const created = await store.submit(9);

    expect(created).not.toBeNull();
    expect(db.createInterviewStage).toHaveBeenCalledWith({
      applicationId: 9,
      stageOrder: 1,
      stageType: 'technical',
      stageLabel: 'Recruiter call',
      scheduledAt: '2026-09-01',
    });
  });

  it('sends no date rather than an empty one', async () => {
    const { store, db } = createStore();
    store.stageLabel.set('Screen');
    await store.submit(9);
    expect(db.createInterviewStage.mock.calls[0][0].scheduledAt).toBeUndefined();
  });

  it('trims the label, so a space-only entry never reaches the gateway', async () => {
    const { store, db } = createStore();
    store.stageLabel.set('   ');
    expect(await store.submit(9)).toBeNull();
    expect(db.createInterviewStage).not.toHaveBeenCalled();
  });

  /**
   * Refusing and failing are different, and the component tells them apart by
   * `error`: a refusal leaves it empty and says nothing to the user, a failure
   * fills it and is toasted.
   */
  it('refuses without an error when there is nothing to save', async () => {
    const { store } = createStore();
    expect(await store.submit(9)).toBeNull();
    expect(store.error()).toBe('');
  });

  it('reports a failed write through error and clears busy', async () => {
    const { store } = createStore({
      createInterviewStage: jest.fn().mockRejectedValue(new Error('locked')),
    });
    store.stageLabel.set('Screen');

    expect(await store.submit(9)).toBeNull();
    expect(store.error()).toBe('Error: locked');
    expect(store.busy()).toBe(false);
  });

  it('does not start a second write while one is in flight', async () => {
    let release: (v: InterviewStage) => void = () => undefined;
    const createInterviewStage = jest.fn(
      () => new Promise<InterviewStage>((resolve) => (release = resolve)),
    );
    const { store } = createStore({ createInterviewStage });
    store.stageLabel.set('Screen');

    const first = store.submit(9);
    expect(await store.submit(9)).toBeNull();
    expect(createInterviewStage).toHaveBeenCalledTimes(1);

    release(stage());
    await first;
  });

  it('clears a previous error when a retry succeeds', async () => {
    const createInterviewStage = jest
      .fn()
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce(stage());
    const { store } = createStore({ createInterviewStage });
    store.stageLabel.set('Screen');

    await store.submit(9);
    await store.submit(9);

    expect(store.error()).toBe('');
  });
});

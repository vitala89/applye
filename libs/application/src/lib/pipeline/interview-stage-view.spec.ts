import type { InterviewStage } from '@applye/core';
import {
  pickCurrentStage,
  sortStages,
  stageDone,
  stageIsCurrent,
  stageReached,
} from './interview-stage-view';

const stage = (over: Partial<InterviewStage> = {}): InterviewStage =>
  ({
    id: 1,
    stageOrder: 1,
    stageLabel: 'HR screen',
    status: 'scheduled',
    ...over,
  }) as InterviewStage;

describe('pickCurrentStage', () => {
  it('has no current stage when there are no stages', () => {
    expect(pickCurrentStage([])).toBeNull();
  });

  it('picks the furthest stage the funnel has reached', () => {
    const current = pickCurrentStage([
      stage({ id: 1, stageOrder: 1 }),
      stage({ id: 3, stageOrder: 3 }),
      stage({ id: 2, stageOrder: 2 }),
    ]);
    expect(current?.id).toBe(3);
  });

  /**
   * A funnel that reached a later stage has moved past a rejected earlier one,
   * so the rejection is not where the application "is".
   */
  it('ignores rejected and cancelled stages while anything is still open', () => {
    const current = pickCurrentStage([
      stage({ id: 1, stageOrder: 1, status: 'passed' }),
      stage({ id: 2, stageOrder: 2, status: 'scheduled' }),
      stage({ id: 3, stageOrder: 3, status: 'rejected' }),
      stage({ id: 4, stageOrder: 4, status: 'cancelled' }),
    ]);
    expect(current?.id).toBe(2);
  });

  /** A fully closed funnel still has to show something, and the furthest it
   * got is the honest answer. */
  it('falls back to the furthest closed stage when every stage is closed', () => {
    const current = pickCurrentStage([
      stage({ id: 1, stageOrder: 1, status: 'cancelled' }),
      stage({ id: 2, stageOrder: 2, status: 'rejected' }),
    ]);
    expect(current?.id).toBe(2);
  });

  it('does not care what order the stages arrive in', () => {
    const shuffled = [stage({ id: 2, stageOrder: 2 }), stage({ id: 1, stageOrder: 1 })];
    expect(pickCurrentStage(shuffled)?.id).toBe(2);
    expect(pickCurrentStage([...shuffled].reverse())?.id).toBe(2);
  });
});

describe('sortStages', () => {
  it('orders by stage order without mutating the input', () => {
    const input = [stage({ id: 2, stageOrder: 2 }), stage({ id: 1, stageOrder: 1 })];
    expect(sortStages(input).map((s) => s.id)).toEqual([1, 2]);
    expect(input.map((s) => s.id)).toEqual([2, 1]);
  });
});

describe('stepper predicates', () => {
  /** Done and reached are different: a stage the funnel has moved past is
   * reached, but only a passed one is done. */
  it('marks only a passed stage as done', () => {
    expect(stageDone(stage({ status: 'passed' }))).toBe(true);
    expect(stageDone(stage({ status: 'scheduled' }))).toBe(false);
    expect(stageDone(stage({ status: 'rejected' }))).toBe(false);
  });

  it('marks the current stage by identity, not by position', () => {
    const current = stage({ id: 7, stageOrder: 2 });
    expect(stageIsCurrent(stage({ id: 7, stageOrder: 2 }), current)).toBe(true);
    expect(stageIsCurrent(stage({ id: 8, stageOrder: 2 }), current)).toBe(false);
    expect(stageIsCurrent(stage({ id: 7 }), null)).toBe(false);
  });

  it('fills the track up to and including the current stage', () => {
    const current = stage({ id: 2, stageOrder: 2 });
    expect(stageReached(stage({ stageOrder: 1 }), current)).toBe(true);
    expect(stageReached(stage({ stageOrder: 2 }), current)).toBe(true);
    expect(stageReached(stage({ stageOrder: 3 }), current)).toBe(false);
  });

  it('fills nothing when there is no current stage', () => {
    expect(stageReached(stage({ stageOrder: 1 }), null)).toBe(false);
  });
});

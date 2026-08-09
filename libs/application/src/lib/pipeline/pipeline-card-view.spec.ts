import type { PipelineCard } from '@applye/core';
import { companyInitials, scoreClass, stageSegments, stageTotal } from './pipeline-card-view';

const card = (over: Partial<PipelineCard> = {}): PipelineCard =>
  ({ id: 1, ...over }) as PipelineCard;

describe('companyInitials', () => {
  it('takes one letter from each of the first two words', () => {
    expect(companyInitials('Acme Corporation')).toBe('AC');
  });

  it('takes two letters from a single word', () => {
    expect(companyInitials('Globex')).toBe('GL');
  });

  it('ignores the extra whitespace a pasted company name arrives with', () => {
    expect(companyInitials('  Initech   Systems  ')).toBe('IS');
  });

  it('falls back to a dash rather than an empty avatar', () => {
    expect(companyInitials(undefined)).toBe('-');
    expect(companyInitials('   ')).toBe('-');
  });
});

describe('stageTotal', () => {
  it('counts the stages the card reports', () => {
    expect(stageTotal(card({ currentStageTotal: 4, currentStageOrder: 2 }))).toBe(4);
  });

  /**
   * The max rather than the total: a card sitting at stage 3 of a total that
   * has not caught up would otherwise draw a track too short to hold its own
   * position, and the current stage would fall off the end of it.
   */
  it('never reports fewer stages than the card has already reached', () => {
    expect(stageTotal(card({ currentStageTotal: 2, currentStageOrder: 3 }))).toBe(3);
  });

  it('is zero for a card with no stages at all', () => {
    expect(stageTotal(card())).toBe(0);
  });
});

describe('stageSegments', () => {
  it('fills up to the current stage and leaves the rest empty', () => {
    expect(stageSegments(card({ currentStageTotal: 4, currentStageOrder: 2 }))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('draws nothing for a card with no stages', () => {
    expect(stageSegments(card())).toEqual([]);
  });

  it('fills every segment once the card reaches the last stage', () => {
    expect(stageSegments(card({ currentStageTotal: 3, currentStageOrder: 3 }))).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe('scoreClass', () => {
  it('bands a score into high, mid and low', () => {
    expect(scoreClass(90)).toBe('score--high');
    expect(scoreClass(75)).toBe('score--high');
    expect(scoreClass(60)).toBe('score--mid');
    expect(scoreClass(50)).toBe('score--mid');
    expect(scoreClass(49)).toBe('score--low');
  });

  /** An unscored card must not read as a low-scoring one. */
  it('gives an unscored card no band at all', () => {
    expect(scoreClass(undefined)).toBe('');
  });

  it('bands a zero score rather than treating it as missing', () => {
    expect(scoreClass(0)).toBe('score--low');
  });
});

import type { InterviewStage } from '@applye/core';

/**
 * Which stage a card is "at", and how the stepper draws the rest.
 *
 * A pure module beside `QuickViewStore`, like `pipeline-card-view` beside
 * `PipelineStore` (ADR-0005, amendment thirty-one). `pickCurrentStage` is the
 * valuable one: it **mirrors the SQL in `db_pipeline_cards`**, and until now
 * nothing tested that claim - if the two drift, the modal's headline and the
 * board's card footer disagree about the same application, which reads as data
 * corruption rather than as a bug in a predicate.
 */

/**
 * The highest open stage, or the highest closed one when every stage is
 * closed.
 *
 * Rejected and cancelled stages do not count while anything is still open,
 * because a funnel that reached a later stage has moved past a rejected
 * earlier one - but a fully closed funnel still has to show something, and the
 * furthest it got is the honest answer.
 */
export function pickCurrentStage(stages: InterviewStage[]): InterviewStage | null {
  if (!stages.length) return null;
  const open = stages.filter((s) => s.status !== 'rejected' && s.status !== 'cancelled');
  const pool = open.length ? open : stages;
  return pool.reduce((max, s) => (s.stageOrder > max.stageOrder ? s : max), pool[0]);
}

/** Stages in the order the stepper draws them. */
export function sortStages(stages: InterviewStage[]): InterviewStage[] {
  return [...stages].sort((a, b) => a.stageOrder - b.stageOrder);
}

/** A stage counts as done once it has passed - not merely once the funnel has
 * moved beyond it, which is what `stageReached` means. */
export function stageDone(stage: InterviewStage): boolean {
  return stage.status === 'passed';
}

export function stageIsCurrent(stage: InterviewStage, current: InterviewStage | null): boolean {
  return current?.id === stage.id;
}

/** A step, and the connector into it, is reached once the funnel has advanced
 * to at least its position. This fills the track up to the current stage. */
export function stageReached(stage: InterviewStage, current: InterviewStage | null): boolean {
  return stage.stageOrder <= (current?.stageOrder ?? 0);
}

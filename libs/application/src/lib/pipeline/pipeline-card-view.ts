import type { PipelineCard } from '@applye/core';

/**
 * The pure parts of drawing a pipeline card: its avatar text, its progress
 * track and its score band.
 *
 * Beside `PipelineStore` rather than on it, the way `tracker-columns` and
 * `cover-letter-generation` sit beside theirs - these are functions of a card
 * and nothing else, and being injectable would buy them nothing (ADR-0005,
 * amendment thirty). Being plain functions is what makes them testable without
 * constructing a component, which is the point: two of them encode rules rather
 * than formatting.
 *
 * `formatDate` is deliberately **not** here. It is locale-dependent, and this
 * layer holds no locales - the same reason `InterviewPrepStore` returns a raw
 * date and lets the page render it.
 */

/** Up to two letters for the card's avatar: one word gives two letters, two or
 * more give one each. `-` when there is no company to abbreviate. */
export function companyInitials(company?: string): string {
  if (!company) return '-';
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '-';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * How many segments the progress track has.
 *
 * The max of the two counts, not just the total: a card whose current stage is
 * 3 of a total the row has not caught up with would otherwise draw a track too
 * short to hold its own position.
 */
export function stageTotal(card: PipelineCard): number {
  return Math.max(card.currentStageTotal ?? 0, card.currentStageOrder ?? 0);
}

/** One boolean per logged stage, filled up to the current stage's position. */
export function stageSegments(card: PipelineCard): boolean[] {
  const total = stageTotal(card);
  const done = card.currentStageOrder ?? 0;
  return Array.from({ length: total }, (_, i) => i < done);
}

/** The score band's class, or none at all when the card has no score - an
 * unscored card must not read as a low-scoring one. */
export function scoreClass(score?: number): string {
  if (score == null) return '';
  if (score >= 75) return 'score--high';
  if (score >= 50) return 'score--mid';
  return 'score--low';
}

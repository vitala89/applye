import { COVER_LETTER_LENGTH_TARGET, CoverLetterLength } from '@applye/core';

/** How the draft's body length compares with the selected length's budget. */
export type CoverLetterLengthStatus = 'under' | 'ok' | 'over';

/** Words in the letter's body. Only the body counts: the recipient block, the
 * date and the signature are not prose the length budget is about. */
export function countBodyWords(paragraphs: readonly string[] | undefined): number {
  return (paragraphs ?? []).join(' ').trim().split(/\s+/).filter(Boolean).length;
}

/** Drives the badge colour, so the user sees at a glance whether the draft
 * fits. The bounds are inclusive on both sides: a letter that lands exactly on
 * the minimum or the maximum is inside its budget, not outside it. */
export function bodyLengthStatus(
  words: number,
  length: CoverLetterLength,
): CoverLetterLengthStatus {
  const target = COVER_LETTER_LENGTH_TARGET[length];
  if (words < target.min) return 'under';
  if (words > target.max) return 'over';
  return 'ok';
}

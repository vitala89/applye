import { COVER_LETTER_LENGTH_TARGET } from '@applye/core';
import { bodyLengthStatus, countBodyWords } from './cover-letter-length.util';

describe('countBodyWords', () => {
  it('counts across paragraphs, not within one', () => {
    expect(countBodyWords(['one two', 'three'])).toBe(3);
  });

  /// The signal it reads is optional on the model and a fresh letter has no
  /// body at all, so this is the state the badge renders on first open.
  it('treats a missing body as empty rather than one word', () => {
    expect(countBodyWords(undefined)).toBe(0);
    expect(countBodyWords([])).toBe(0);
    expect(countBodyWords([''])).toBe(0);
    expect(countBodyWords(['   '])).toBe(0);
  });

  it('does not count runs of whitespace as words', () => {
    expect(countBodyWords(['  one   two  '])).toBe(2);
  });
});

describe('bodyLengthStatus', () => {
  const concise = COVER_LETTER_LENGTH_TARGET.Concise;

  /// Both bounds are inclusive: a letter that lands exactly on the minimum or
  /// the maximum is inside its budget. An exclusive bound would paint the badge
  /// as a problem at the exact word count the budget asks for.
  it('counts both bounds as inside the budget', () => {
    expect(bodyLengthStatus(concise.min, 'Concise')).toBe('ok');
    expect(bodyLengthStatus(concise.max, 'Concise')).toBe('ok');
  });

  it('reports under and over outside them', () => {
    expect(bodyLengthStatus(concise.min - 1, 'Concise')).toBe('under');
    expect(bodyLengthStatus(concise.max + 1, 'Concise')).toBe('over');
  });

  it('reads the budget of the length it was given', () => {
    const detailed = COVER_LETTER_LENGTH_TARGET.Detailed;
    expect(bodyLengthStatus(detailed.min, 'Detailed')).toBe('ok');
    // The same count against a shorter budget is over it.
    expect(bodyLengthStatus(detailed.max, 'Concise')).toBe('over');
  });
});

import type { CoverLetterContent, CvSectionStyle } from '@applye/core';
import {
  addCoverLetterParagraph,
  paragraphStyleKey,
  reindexParagraphStyleKeys,
  removeCoverLetterParagraph,
  updateCoverLetterAddress,
  updateCoverLetterField,
  updateCoverLetterParagraph,
} from './cover-letter-content';

function letter(over: Partial<CoverLetterContent> = {}): CoverLetterContent {
  return {
    address: {},
    date: '',
    subject: '',
    greeting: '',
    bodyParagraphs: [],
    closing: '',
    signature: '',
    ...over,
  };
}

/** A distinguishable override, so a shifted one can be told from a fresh one. */
function style(fontSizePt: number): CvSectionStyle {
  return { fontSizePt } as CvSectionStyle;
}

describe('paragraphStyleKey', () => {
  it('keys a paragraph by its index', () => {
    expect(paragraphStyleKey(0)).toBe('body_0');
    expect(paragraphStyleKey(12)).toBe('body_12');
  });
});

describe('the content transforms', () => {
  it('replaces one address field and leaves the rest alone', () => {
    const before = letter({ address: { company: 'Aiven', city: 'Berlin' } });
    const after = updateCoverLetterAddress(before, 'city', 'Hamburg');

    expect(after.address).toEqual({ company: 'Aiven', city: 'Hamburg' });
    expect(before.address.city).toBe('Berlin');
  });

  it('replaces one text field without touching the others', () => {
    const before = letter({ subject: 'old', greeting: 'kept' });
    const after = updateCoverLetterField(before, 'subject', 'new');

    expect(after).toMatchObject({ subject: 'new', greeting: 'kept' });
    expect(before.subject).toBe('old');
  });

  it('replaces one paragraph', () => {
    const after = updateCoverLetterParagraph(letter({ bodyParagraphs: ['a', 'b'] }), 1, 'B');
    expect(after.bodyParagraphs).toEqual(['a', 'B']);
  });

  it('appends an empty paragraph', () => {
    expect(addCoverLetterParagraph(letter({ bodyParagraphs: ['a'] })).bodyParagraphs).toEqual([
      'a',
      '',
    ]);
  });

  it('starts the body from nothing when there is none', () => {
    expect(addCoverLetterParagraph(letter()).bodyParagraphs).toEqual(['']);
  });

  it('removes one paragraph and closes the gap', () => {
    const after = removeCoverLetterParagraph(letter({ bodyParagraphs: ['a', 'b', 'c'] }), 1);
    expect(after.bodyParagraphs).toEqual(['a', 'c']);
  });

  // Every transform returns a new letter, so a signal set with the result is
  // always a change and an OnPush child taking one as an input always re-reads.
  it('never mutates the letter it was given', () => {
    const before = letter({ bodyParagraphs: ['a', 'b'], subject: 's' });

    updateCoverLetterParagraph(before, 0, 'A');
    addCoverLetterParagraph(before);
    removeCoverLetterParagraph(before, 0);
    updateCoverLetterField(before, 'subject', 'x');

    expect(before.bodyParagraphs).toEqual(['a', 'b']);
    expect(before.subject).toBe('s');
  });
});

describe('reindexParagraphStyleKeys', () => {
  it('has nothing to do when the letter has no overrides', () => {
    expect(reindexParagraphStyleKeys(undefined, 0, 2)).toBeUndefined();
  });

  it('drops the removed paragraph’s own override', () => {
    const next = reindexParagraphStyleKeys({ body_0: style(10) }, 0, 0);
    expect(next).toEqual({});
  });

  // The point of the whole function: an override set on paragraph 2 has to
  // follow that paragraph down to index 1 when paragraph 0 goes.
  it('shifts every override above the removal down one', () => {
    const next = reindexParagraphStyleKeys(
      { body_0: style(10), body_1: style(11), body_2: style(12) },
      0,
      2,
    );

    expect(next).toEqual({ body_0: style(11), body_1: style(12) });
  });

  it('leaves overrides below the removal where they are', () => {
    const next = reindexParagraphStyleKeys(
      { body_0: style(10), body_1: style(11), body_2: style(12) },
      2,
      2,
    );

    expect(next).toEqual({ body_0: style(10), body_1: style(11) });
  });

  // Asymmetric on the two branches of the loop: paragraph 1 has an override and
  // paragraph 2 does not. Fixtures where every paragraph is styled never reach
  // the `else`, and the removed paragraph's styling would then be inherited by
  // whichever paragraph moved into its place.
  it('clears the destination when the paragraph shifting down has no override', () => {
    const next = reindexParagraphStyleKeys({ body_0: style(10), body_1: style(11) }, 0, 2);

    expect(next).toEqual({ body_0: style(11) });
    expect(next).not.toHaveProperty('body_1');
  });

  it('clears a trailing override left behind by the last paragraph', () => {
    const next = reindexParagraphStyleKeys({ body_0: style(10), body_1: style(11) }, 0, 1);

    expect(next).toEqual({ body_0: style(11) });
  });

  // Block-level overrides are keyed by name, not by index, and must survive a
  // paragraph removal untouched.
  it('leaves whole-block overrides alone', () => {
    const next = reindexParagraphStyleKeys(
      { greeting: style(9), body: style(10), body_0: style(11), body_1: style(12) },
      0,
      1,
    );

    expect(next).toMatchObject({ greeting: style(9), body: style(10), body_0: style(12) });
  });

  it('does not mutate the map it was given', () => {
    const before = { body_0: style(10), body_1: style(11) };
    reindexParagraphStyleKeys(before, 0, 1);

    expect(before).toEqual({ body_0: style(10), body_1: style(11) });
  });

  it('handles removing the only paragraph', () => {
    expect(reindexParagraphStyleKeys({ body_0: style(10) }, 0, 0)).toEqual({});
  });
});

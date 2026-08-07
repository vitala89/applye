import type { CoverLetterContent } from '@applye/core';
import {
  COVER_LETTER_GENERIC_JD,
  CoverLetterNoProfileError,
  applyCoverLetterBlock,
  applyCoverLetterDraft,
  coverLetterHashInput,
  coverLetterJobDescription,
  coverLetterSectionName,
  currentBlockHash,
  resolveLetterLanguage,
} from './cover-letter-generation';

const details = {
  earliest_start: 'ab sofort',
  salary_expectation: '75.000 EUR',
  notice_period: '3 Monate',
};

function letter(over: Partial<CoverLetterContent> = {}): CoverLetterContent {
  return {
    address: { company: 'ACME' },
    date: '2026-01-02',
    subject: 'Old subject',
    greeting: 'Old greeting',
    bodyParagraphs: ['Old one.', 'Old two.'],
    closing: 'Old closing',
    signature: 'Old signature',
    tone: 'Formal',
    length: 'Standard',
    earliestStart: 'ab sofort',
    salaryExpectation: '75.000 EUR',
    noticePeriod: '3 Monate',
    jobDescription: 'Old JD',
    ...over,
  } as CoverLetterContent;
}

describe('coverLetterSectionName', () => {
  it('addresses a body paragraph by position', () => {
    expect(coverLetterSectionName('body', 2)).toBe('body_2');
  });

  it('addresses index 0, which is falsy but a real paragraph', () => {
    expect(coverLetterSectionName('body', 0)).toBe('body_0');
  });

  it('uses the block key when there is no index', () => {
    expect(coverLetterSectionName('greeting')).toBe('greeting');
  });
});

describe('coverLetterJobDescription', () => {
  it('keeps what the user pasted', () => {
    expect(coverLetterJobDescription('Senior Angular dev')).toBe('Senior Angular dev');
  });

  it('substitutes the generic posting for an empty description', () => {
    expect(coverLetterJobDescription('')).toBe(COVER_LETTER_GENERIC_JD);
  });

  it('substitutes the generic posting when there is none at all', () => {
    expect(coverLetterJobDescription(undefined)).toBe(COVER_LETTER_GENERIC_JD);
  });
});

describe('coverLetterHashInput', () => {
  const base = coverLetterHashInput('md', 'jd', 'de', 'greeting', 'Formal', 'Standard', details);

  it('is stable for identical inputs', () => {
    expect(coverLetterHashInput('md', 'jd', 'de', 'greeting', 'Formal', 'Standard', details)).toBe(
      base,
    );
  });

  it('changes with the tone, which changes what the model is asked', () => {
    expect(
      coverLetterHashInput('md', 'jd', 'de', 'greeting', 'Friendly', 'Standard', details),
    ).not.toBe(base);
  });

  it('changes with the length', () => {
    expect(
      coverLetterHashInput('md', 'jd', 'de', 'greeting', 'Formal', 'Detailed', details),
    ).not.toBe(base);
  });

  it('changes with each of the three availability answers', () => {
    for (const key of ['earliest_start', 'salary_expectation', 'notice_period'] as const) {
      expect(
        coverLetterHashInput('md', 'jd', 'de', 'greeting', 'Formal', 'Standard', {
          ...details,
          [key]: 'changed',
        }),
      ).not.toBe(base);
    }
  });

  it('changes with the profile, the posting, the language and the section', () => {
    expect(
      coverLetterHashInput('x', 'jd', 'de', 'greeting', 'Formal', 'Standard', details),
    ).not.toBe(base);
    expect(
      coverLetterHashInput('md', 'x', 'de', 'greeting', 'Formal', 'Standard', details),
    ).not.toBe(base);
    expect(
      coverLetterHashInput('md', 'jd', 'en', 'greeting', 'Formal', 'Standard', details),
    ).not.toBe(base);
    expect(
      coverLetterHashInput('md', 'jd', 'de', 'closing', 'Formal', 'Standard', details),
    ).not.toBe(base);
  });

  /** Documents the known limit rather than asserting a guarantee the separator
   * does not give. Two different tuples whose `|`-joins coincide collide, and a
   * collision means one skipped regeneration. Left as-is deliberately: the
   * fields come from unrelated sources, and changing the separator would
   * invalidate every hash already stored in every user's database and force a
   * full regeneration of every letter. Carried over unchanged from the page, and
   * shared with `regenerationHashInput` for CVs. */
  it('is a `|` join, so a field containing `|` can shift the boundary', () => {
    expect(coverLetterHashInput('a|b', 'jd', 'de', 'g', 'Formal', 'Standard', details)).toBe(
      coverLetterHashInput('a', 'b|jd', 'de', 'g', 'Formal', 'Standard', details),
    );
  });
});

describe('resolveLetterLanguage', () => {
  it("prefers the document's own language", () => {
    expect(resolveLetterLanguage('de', 'pl')).toBe('de');
  });

  it("falls back to the user's default", () => {
    expect(resolveLetterLanguage(undefined, 'pl')).toBe('pl');
  });

  it('falls back to English when neither is set', () => {
    expect(resolveLetterLanguage(undefined, undefined)).toBe('en');
  });
});

describe('currentBlockHash', () => {
  const hashes = { greeting: 'g-hash', bodyParagraphs: ['p0', 'p1'] };

  it('reads a named block by its key', () => {
    expect(currentBlockHash(hashes, 'greeting')).toBe('g-hash');
  });

  it('reads a body paragraph by position', () => {
    expect(currentBlockHash(hashes, 'body', 1)).toBe('p1');
  });

  it('reads position 0 rather than treating it as absent', () => {
    expect(currentBlockHash(hashes, 'body', 0)).toBe('p0');
  });

  it('is undefined for a paragraph that has never been generated', () => {
    expect(currentBlockHash(hashes, 'body', 5)).toBeUndefined();
  });

  it('is undefined for a letter with no hashes at all', () => {
    expect(currentBlockHash(undefined, 'greeting')).toBeUndefined();
    expect(currentBlockHash(undefined, 'body', 0)).toBeUndefined();
  });
});

describe('applyCoverLetterDraft', () => {
  const parsed: Partial<CoverLetterContent> = {
    address: { company: 'New Corp' },
    date: '2026-06-01',
    subject: 'New subject',
    greeting: 'New greeting',
    bodyParagraphs: ['New one.'],
    closing: 'New closing',
    signature: 'New signature',
    // The model is asked for the letter, but nothing stops it echoing the
    // user's own answers back. Every one of these is present on purpose: a
    // fixture that omitted them could not tell "kept from prev" apart from
    // "taken from the model".
    tone: 'Enthusiastic',
    length: 'Detailed',
    jobDescription: 'model invented this',
    earliestStart: 'model invented this',
    salaryExpectation: 'model invented this',
    noticePeriod: 'model invented this',
  };
  const drafted = applyCoverLetterDraft(letter(), parsed);

  it('takes every generated block from the model', () => {
    expect(drafted.subject).toBe('New subject');
    expect(drafted.greeting).toBe('New greeting');
    expect(drafted.bodyParagraphs).toEqual(['New one.']);
    expect(drafted.closing).toBe('New closing');
    expect(drafted.signature).toBe('New signature');
    expect(drafted.address).toEqual({ company: 'New Corp' });
    expect(drafted.date).toBe('2026-06-01');
  });

  it("keeps the user's own answers, which are choices and not generated text", () => {
    expect(drafted.tone).toBe('Formal');
    expect(drafted.length).toBe('Standard');
    expect(drafted.earliestStart).toBe('ab sofort');
    expect(drafted.salaryExpectation).toBe('75.000 EUR');
    expect(drafted.noticePeriod).toBe('3 Monate');
    expect(drafted.jobDescription).toBe('Old JD');
  });

  it('drops every per-block hash, because every block was just rewritten', () => {
    expect(applyCoverLetterDraft(letter({ hashes: { greeting: 'stale' } }), parsed).hashes).toEqual(
      {},
    );
  });

  it('keeps the existing date when the model returns an empty one', () => {
    expect(applyCoverLetterDraft(letter(), { ...parsed, date: '' }).date).toBe('2026-01-02');
  });

  it('blanks a missing block rather than keeping the old text', () => {
    const empty = applyCoverLetterDraft(letter(), {});
    expect(empty.subject).toBe('');
    expect(empty.greeting).toBe('');
    expect(empty.closing).toBe('');
    expect(empty.signature).toBe('');
    expect(empty.bodyParagraphs).toEqual([]);
    expect(empty.address).toEqual({});
  });

  it('does not mutate the letter it was given', () => {
    const prev = letter();
    applyCoverLetterDraft(prev, parsed);
    expect(prev.subject).toBe('Old subject');
  });
});

describe('applyCoverLetterBlock', () => {
  it.each([
    ['subject', { subject: 'Fresh' }, 'subject'],
    ['greeting', { greeting: 'Fresh' }, 'greeting'],
    ['closing', { closing: 'Fresh' }, 'closing'],
  ] as const)('replaces %s and records its hash', (key, parsed, field) => {
    const next = applyCoverLetterBlock(letter(), key, undefined, parsed, 'h1');
    expect(next[field]).toBe('Fresh');
    expect(next.hashes?.[field]).toBe('h1');
  });

  it('blanks a named block the model returned empty', () => {
    expect(applyCoverLetterBlock(letter(), 'subject', undefined, {}, 'h1').subject).toBe('');
  });

  it('sanitizes the signature rather than trusting it', () => {
    const next = applyCoverLetterBlock(
      letter(),
      'signature',
      undefined,
      { signature: 'Vitalii Kasap\nvitala@example.com' },
      'h1',
    );
    expect(next.signature).toBe('Vitalii Kasap');
    expect(next.hashes?.signature).toBe('h1');
  });

  it('replaces one body paragraph and leaves its neighbours alone', () => {
    const next = applyCoverLetterBlock(
      letter(),
      'body',
      1,
      { bodyParagraphs: [undefined as unknown as string, 'Fresh two.'] },
      'h1',
    );
    expect(next.bodyParagraphs).toEqual(['Old one.', 'Fresh two.']);
    expect(next.hashes?.bodyParagraphs?.[1]).toBe('h1');
  });

  it('keeps the existing paragraph but still records the hash when the model returned nothing', () => {
    const next = applyCoverLetterBlock(letter(), 'body', 0, {}, 'h1');
    expect(next.bodyParagraphs).toEqual(['Old one.', 'Old two.']);
    expect(next.hashes?.bodyParagraphs?.[0]).toBe('h1');
  });

  it('preserves the hashes of the other body paragraphs', () => {
    const next = applyCoverLetterBlock(
      letter({ hashes: { bodyParagraphs: ['p0-hash', 'p1-hash'] } }),
      'body',
      1,
      { bodyParagraphs: ['x', 'Fresh two.'] },
      'h1',
    );
    // Losing p0's hash costs the user a regeneration they already paid for.
    expect(next.hashes?.bodyParagraphs).toEqual(['p0-hash', 'h1']);
  });

  it('preserves the hashes of blocks it did not touch', () => {
    const next = applyCoverLetterBlock(
      letter({ hashes: { closing: 'keep-me', bodyParagraphs: ['p0'] } }),
      'subject',
      undefined,
      { subject: 'Fresh' },
      'h1',
    );
    expect(next.hashes?.closing).toBe('keep-me');
    expect(next.hashes?.bodyParagraphs).toEqual(['p0']);
  });

  it('ignores `body` with no index rather than corrupting the paragraphs', () => {
    const next = applyCoverLetterBlock(
      letter(),
      'body',
      undefined,
      { bodyParagraphs: ['x'] },
      'h1',
    );
    expect(next.bodyParagraphs).toEqual(['Old one.', 'Old two.']);
    expect(next.hashes).toEqual({});
  });

  it('leaves an unrecognized block key untouched', () => {
    const next = applyCoverLetterBlock(letter(), 'nonsense', undefined, { subject: 'Fresh' }, 'h1');
    expect(next.subject).toBe('Old subject');
    expect(next.hashes).toEqual({});
  });

  it('does not mutate the letter or the hashes it was given', () => {
    const prev = letter({ hashes: { bodyParagraphs: ['p0'] } });
    applyCoverLetterBlock(prev, 'body', 0, { bodyParagraphs: ['Fresh'] }, 'h1');
    expect(prev.bodyParagraphs).toEqual(['Old one.', 'Old two.']);
    expect(prev.hashes?.bodyParagraphs).toEqual(['p0']);
  });
});

describe('CoverLetterNoProfileError', () => {
  it('is identifiable by instance, so the page can word it', () => {
    const e = new CoverLetterNoProfileError();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(CoverLetterNoProfileError);
    expect(e.name).toBe('CoverLetterNoProfileError');
  });
});

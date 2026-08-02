import { isListyLine, looksLikeHeading, parseJdBlocks } from './jd-blocks';

const kinds = (text: string) => parseJdBlocks(text).map((b) => b.kind);

describe('looksLikeHeading', () => {
  it('treats a short line ending in a colon as a heading', () => {
    expect(looksLikeHeading('Responsibilities:')).toBe(true);
  });

  it('rejects a colon line whose text already reads as a finished sentence', () => {
    expect(looksLikeHeading('We are hiring, and here is why.:')).toBe(false);
  });

  it('accepts any other short colon line, including prose - a known sharp edge', () => {
    // The colon test runs before the word-count test, so a short sentence
    // ending in a colon becomes a heading. Pinned as it is rather than
    // corrected: this is a move, and changing the heuristic is its own change
    // with its own before-and-after on real postings.
    expect(looksLikeHeading('We are hiring, and here is why:')).toBe(true);
  });

  it('recognises a common section word without any colon', () => {
    expect(looksLikeHeading('What you will do')).toBe(true);
    expect(looksLikeHeading('Nice to have')).toBe(true);
  });

  it('refuses a line long enough to be prose, even when it names a section', () => {
    // 67 characters, 8 words, a section word, no terminal punctuation: it
    // passes every other check, so only the length cap can reject it. An
    // earlier version of this test used a run of 'a' characters, which the
    // lexicon rejected anyway - it passed with the cap deleted and proved
    // nothing.
    expect(
      looksLikeHeading('Engineering skills expected from incoming senior backend developers'),
    ).toBe(false);
  });

  it('never matched Responsibilities or Requirements through the lexicon', () => {
    // A latent bug, pinned rather than fixed because this is a move. The
    // lexicon holds the stems `responsibilit` and `requirement` followed by a
    // word boundary, so neither matches the plural the entry was written for.
    // They are only ever headings via the colon rule.
    expect(looksLikeHeading('Responsibilities')).toBe(false);
    expect(looksLikeHeading('Requirements')).toBe(false);
    expect(looksLikeHeading('Responsibilities:')).toBe(true);
  });

  it('refuses a line that ends like a sentence', () => {
    expect(looksLikeHeading('We value skills.')).toBe(false);
  });

  it('refuses a wordy line even when it names a section', () => {
    expect(looksLikeHeading('the role and its requirements are described below for you now')).toBe(
      false,
    );
  });
});

describe('isListyLine', () => {
  it('accepts a short line that is not a heading', () => {
    expect(isListyLine('TypeScript and Angular')).toBe(true);
  });

  it('rejects an empty line', () => {
    expect(isListyLine('')).toBe(false);
  });

  it('rejects a heading, so a section title never becomes a list item', () => {
    expect(isListyLine('Requirements:')).toBe(false);
  });

  it('rejects a line too long to be one item', () => {
    expect(isListyLine('x'.repeat(91))).toBe(false);
  });
});

describe('parseJdBlocks', () => {
  it('joins consecutive long prose lines into one paragraph', () => {
    const blocks = parseJdBlocks(
      'We are a company that builds things for people who need them built, and we have been doing it a while.\n' +
        'Our team is distributed across several countries and we care about the work far more than the hours.',
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('paragraph');
    expect(blocks[0].text).toContain('while. Our team');
  });

  it('reads two consecutive lines of ninety characters or less as a list', () => {
    // The cost of recovering marker-less lists: two short prose lines in a row
    // become list items. Pinned as it is - the heuristic is what makes the
    // common case work, and the JDs it parses come from strip_html, which
    // rarely emits short prose lines back to back.
    expect(kinds('We build things for people.\nOur team is distributed.')).toEqual(['list']);
  });

  it('splits paragraphs on a blank line', () => {
    expect(
      kinds(
        'First thought that runs long enough to be prose and not a list item.\n' +
          '\n' +
          'Second thought that also runs long enough to be prose rather than an item.',
      ),
    ).toEqual(['paragraph', 'paragraph']);
  });

  it('collects an explicit bullet run into one list', () => {
    const blocks = parseJdBlocks('- One\n- Two\n* Three\n• Four');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ kind: 'list', items: ['One', 'Two', 'Three', 'Four'] });
  });

  it('recovers a list from a marker-less run, which is what strip_html emits', () => {
    // The reason this parser exists: the Rust side emits one line per block tag
    // and drops the bullet markers, so a run of short lines is a list.
    const blocks = parseJdBlocks('Requirements:\nTypeScript\nAngular\nRust');

    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'list']);
    expect(blocks[1].items).toEqual(['TypeScript', 'Angular', 'Rust']);
  });

  it('does not turn a single short line into a list', () => {
    // One short line is far more likely to be a stray sentence than a list of
    // one, and a run of two is the smallest thing worth trusting.
    expect(kinds('Berlin, Germany')).toEqual(['paragraph']);
  });

  it('strips the trailing colon from a heading', () => {
    expect(parseJdBlocks('Benefits:\n- Coffee\n- More coffee')[0].text).toBe('Benefits');
  });

  it('flushes an open paragraph before a heading rather than swallowing it', () => {
    expect(
      kinds(
        'A sentence of prose that is long enough not to look like a list item at all.\n' +
          'Requirements:\n' +
          '- Something',
      ),
    ).toEqual(['paragraph', 'heading', 'list']);
  });

  it('flushes an open paragraph before a bullet run', () => {
    expect(
      kinds(
        'Prose that is comfortably longer than ninety characters so it cannot be mistaken for a list item here.\n' +
          '- Something',
      ),
    ).toEqual(['paragraph', 'list']);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(parseJdBlocks('')).toEqual([]);
    expect(parseJdBlocks('   \n\n  \n')).toEqual([]);
  });

  it('trims each line, because strip_html leaves indentation behind', () => {
    expect(parseJdBlocks('   -   Item one\n   - Item two')[0].items).toEqual([
      'Item one',
      'Item two',
    ]);
  });
});

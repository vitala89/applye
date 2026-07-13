import { parseInlineEmphasis, toggleBoldWrap, toggleWordBold, wordTokens } from './inline-emphasis';

describe('parseInlineEmphasis', () => {
  it('splits **bold** spans from plain text', () => {
    expect(parseInlineEmphasis('cut bundle size by **25%** overall')).toEqual([
      { text: 'cut bundle size by ', bold: false },
      { text: '25%', bold: true },
      { text: ' overall', bold: false },
    ]);
  });

  it('handles a leading and multiple bold spans', () => {
    expect(parseInlineEmphasis('**Led** the **GA** launch')).toEqual([
      { text: 'Led', bold: true },
      { text: ' the ', bold: false },
      { text: 'GA', bold: true },
      { text: ' launch', bold: false },
    ]);
  });

  it('returns a single plain run when there is no emphasis', () => {
    expect(parseInlineEmphasis('plain line')).toEqual([{ text: 'plain line', bold: false }]);
  });

  it('never returns an empty array for empty input', () => {
    expect(parseInlineEmphasis('')).toEqual([{ text: '', bold: false }]);
  });

  it('renders adjacent bold spans without a phantom plain run', () => {
    expect(parseInlineEmphasis('**a****b**')).toEqual([
      { text: 'a', bold: true },
      { text: 'b', bold: true },
    ]);
  });

  it('treats an unterminated or empty marker as literal plain text', () => {
    expect(parseInlineEmphasis('**bold')).toEqual([{ text: '**bold', bold: false }]);
    expect(parseInlineEmphasis('****')).toEqual([{ text: '****', bold: false }]);
  });
});

describe('toggleBoldWrap', () => {
  it('wraps a non-empty selection', () => {
    // "Led a big refactor", select "big" (6..9)
    const r = toggleBoldWrap('Led a big refactor', 6, 9);
    expect(r.text).toBe('Led a **big** refactor');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('big');
  });

  it('unwraps a selection that is already bold (toggle off)', () => {
    // "Led a **big** refactor", select inner "big" (8..11)
    const r = toggleBoldWrap('Led a **big** refactor', 8, 11);
    expect(r.text).toBe('Led a big refactor');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('big');
  });

  it('inserts empty markers at the caret when selection is empty', () => {
    const r = toggleBoldWrap('abc', 1, 1);
    expect(r.text).toBe('a****bc');
    expect(r.selStart).toBe(3);
    expect(r.selEnd).toBe(3);
  });

  it('unwraps a selection that includes the ** markers themselves (toggle off)', () => {
    // "Led a **big** refactor", select "**big**" including markers (6..13)
    const r = toggleBoldWrap('Led a **big** refactor', 6, 13);
    expect(r.text).toBe('Led a big refactor');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('big');
  });
});

describe('wordTokens', () => {
  it('numbers words left-to-right and carries run bold state', () => {
    expect(wordTokens('cut size by **25%** overall')).toEqual([
      { text: 'cut ', bold: false, index: 0 },
      { text: 'size ', bold: false, index: 1 },
      { text: 'by ', bold: false, index: 2 },
      { text: '25% ', bold: true, index: 3 },
      { text: 'overall', bold: false, index: 4 },
    ]);
  });

  it('returns a single token for a one-word line, no trailing space', () => {
    expect(wordTokens('English')).toEqual([{ text: 'English', bold: false, index: 0 }]);
  });
});

describe('toggleWordBold', () => {
  it('bolds a plain word by index', () => {
    expect(toggleWordBold('cut size by 25%', 3)).toBe('cut size by **25%**');
  });

  it('unbolds an already-bold word', () => {
    expect(toggleWordBold('cut size by **25%**', 3)).toBe('cut size by 25%');
  });

  it('merges adjacent bold words under one wrapper', () => {
    expect(toggleWordBold('a b c', 0)).toBe('**a** b c');
    // Bolding word 2 (c) next to already-bold word 1 (b) → single **b c** span.
    expect(toggleWordBold('a **b** c', 2)).toBe('a **b c**');
    expect(toggleWordBold('a **b** c', 2)).not.toContain('****');
    expect(toggleWordBold('**a** b c', 1)).toBe('**a b** c');
  });

  it('round-trips: toggling a word twice restores the text', () => {
    const src = 'Rebuilt the legacy **analytics** dashboard';
    expect(toggleWordBold(toggleWordBold(src, 1), 1)).toBe(src);
  });

  it('ignores out-of-range indices', () => {
    expect(toggleWordBold('a b', 9)).toBe('a b');
    expect(toggleWordBold('', 0)).toBe('');
  });
});

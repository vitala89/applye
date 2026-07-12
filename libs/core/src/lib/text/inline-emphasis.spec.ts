import { parseInlineEmphasis, toggleBoldWrap } from './inline-emphasis';

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
});

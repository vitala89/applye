import { parseInlineEmphasis } from './inline-emphasis';

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

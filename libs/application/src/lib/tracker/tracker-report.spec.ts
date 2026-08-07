import { ReportColumn, reportFit } from './tracker-report';

function column(id: string, width: number): ReportColumn {
  return { id, label: id, type: 'text', width };
}

const ids = (cols: ReportColumn[]) => cols.map((c) => c.id);

describe('reportFit', () => {
  it('keeps every column when they all fit the portrait budget', () => {
    const cols = [column('a', 80), column('b', 80)];
    const { fit, overflow } = reportFit(cols, false);

    expect(ids(fit)).toEqual(['a', 'b']);
    expect(overflow).toEqual([]);
  });

  it('overflows what does not fit', () => {
    const { fit, overflow } = reportFit([column('a', 100), column('b', 100)], false);

    expect(ids(fit)).toEqual(['a']);
    expect(ids(overflow)).toEqual(['b']);
  });

  // Asymmetric on the two budgets: a pair that overflows in portrait and fits
  // in landscape. A fixture inside both budgets, or outside both, cannot show
  // the orientation is read at all.
  it('fits in landscape what overflows in portrait', () => {
    const cols = [column('a', 100), column('b', 100)];

    expect(ids(reportFit(cols, false).fit)).toEqual(['a']);
    expect(ids(reportFit(cols, true).fit)).toEqual(['a', 'b']);
  });

  it('takes a column that exactly fills the remaining budget', () => {
    const { overflow } = reportFit([column('a', 100), column('b', 70)], false);
    expect(overflow).toEqual([]);
  });

  it('overflows a column one millimetre too wide', () => {
    const { fit, overflow } = reportFit([column('a', 100), column('b', 71)], false);

    expect(ids(fit)).toEqual(['a']);
    expect(ids(overflow)).toEqual(['b']);
  });

  // A row must never be empty, even if the first column alone is wider than
  // the page. Dropping the `fit.length === 0` guard produces a sheet with an
  // index column and nothing else.
  it('always takes the first column, however wide it is', () => {
    const { fit, overflow } = reportFit([column('enormous', 999)], false);

    expect(ids(fit)).toEqual(['enormous']);
    expect(overflow).toEqual([]);
  });

  // The sheet has to read in the user's chosen column order, so packing stops
  // at the first column that does not fit rather than skipping it and squeezing
  // in a later narrow one. Dropping `stopped` reorders the sheet silently.
  it('stops at the first column that does not fit, and does not skip ahead', () => {
    const cols = [column('wide', 160), column('too-wide', 60), column('narrow', 5)];
    const { fit, overflow } = reportFit(cols, false);

    expect(ids(fit)).toEqual(['wide']);
    expect(ids(overflow)).toEqual(['too-wide', 'narrow']);
  });

  it('handles an empty column list', () => {
    expect(reportFit([], false)).toEqual({ fit: [], overflow: [] });
  });

  it('does not mutate the input', () => {
    const cols = [column('a', 100), column('b', 100)];
    reportFit(cols, false);
    expect(ids(cols)).toEqual(['a', 'b']);
  });
});

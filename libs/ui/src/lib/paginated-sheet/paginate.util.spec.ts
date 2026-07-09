import { paginate, PackAtom } from './paginate.util';

const h = (height: number, glueToNext = false): PackAtom => ({ height, glueToNext });

describe('paginate', () => {
  it('returns a single empty page for no atoms', () => {
    expect(paginate([], 1000)).toEqual([[]]);
  });

  it('keeps atoms that fit on one page together', () => {
    expect(paginate([h(300), h(300), h(300)], 1000)).toEqual([[0, 1, 2]]);
  });

  it('starts a new page when the next atom would overflow', () => {
    expect(paginate([h(600), h(600)], 1000)).toEqual([[0], [1]]);
  });

  it('packs greedily across three pages', () => {
    expect(paginate([h(400), h(400), h(400), h(400), h(400)], 1000)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('never splits an oversized atom — it stands alone on its own page', () => {
    expect(paginate([h(300), h(1500), h(300)], 1000)).toEqual([[0], [1], [2]]);
  });

  it('pushes a glued title to the next page when title + first entry do not both fit', () => {
    // page fills to 800; a glued 100 title + 300 entry (=400) will not fit in
    // the remaining 200, so the title moves down to sit with its entry.
    expect(paginate([h(800), h(100, true), h(300)], 1000)).toEqual([[0], [1, 2]]);
  });

  it('keeps a glued title with its entry when both fit', () => {
    expect(paginate([h(400), h(100, true), h(300)], 1000)).toEqual([[0, 1, 2]]);
  });
});

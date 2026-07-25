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

  it('never splits an oversized atom - it stands alone on its own page', () => {
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

  it('keeps a whole glue chain together without stranding its head', () => {
    // Chain: title(100)→head(100)→bullet1(100) all glued; bullet2(100) free.
    // After an 800 atom, the 300 chain will not fit in the remaining 200, so
    // the ENTIRE chain (title+head+bullet1) must move to page 2 - the title
    // must not be left stranded on page 1 with its head/bullet on page 2.
    expect(paginate([h(800), h(100, true), h(100, true), h(100), h(100)], 1000)).toEqual([
      [0],
      [1, 2, 3, 4],
    ]);
  });

  it('lets free (non-glued) atoms after a chain flow onto the next page', () => {
    // Page 1 holds 700 + chain(title+head+bullet1 = 300) = 1000. bullet2 and
    // bullet3 are free and flow to page 2 - the entry splits across the break.
    expect(paginate([h(700), h(100, true), h(100, true), h(100), h(100), h(100)], 1000)).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
  });
});

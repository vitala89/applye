export interface PackAtom {
  height: number;
  glueToNext?: boolean;
}

export function paginate(atoms: PackAtom[], usableH: number): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let currentH = 0;

  const flush = (): void => {
    pages.push(current);
    current = [];
    currentH = 0;
  };

  // Pack by glued *runs*, not single atoms. A run is a maximal sequence where
  // each atom (except the last) has `glueToNext`, so the whole run stays on one
  // page - e.g. a section title glued to an entry's head glued to its first
  // bullet. This keeps the head with its title and first line while leaving the
  // remaining (non-glued) bullets free to flow onto the next page, so a long
  // entry splits across a page break instead of jumping down whole and leaving
  // a large trailing gap. Pairwise look-ahead could strand the run's first
  // atom when the rest of the run overflowed; measuring the full run fixes that.
  let i = 0;
  while (i < atoms.length) {
    let end = i;
    let runH = atoms[i].height;
    while (atoms[end].glueToNext && end + 1 < atoms.length) {
      end++;
      runH += atoms[end].height;
    }
    if (current.length > 0 && currentH + runH > usableH) {
      flush();
    }
    for (let k = i; k <= end; k++) {
      current.push(k);
      currentH += atoms[k].height;
    }
    i = end + 1;
  }

  flush();
  return pages;
}

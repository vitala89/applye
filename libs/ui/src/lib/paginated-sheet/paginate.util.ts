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

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    // Look-ahead height: a glued atom must fit together with the next one.
    const next = atom.glueToNext ? atoms[i + 1] : undefined;
    const needH = atom.height + (next ? next.height : 0);

    if (current.length > 0 && currentH + needH > usableH) {
      flush();
    }
    current.push(i);
    currentH += atom.height;
  }

  flush();
  return pages;
}

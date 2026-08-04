import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOB_DETAIL_ICONS } from './job-detail-icons';

/**
 * A template that asks for `icons.doesNotExist` compiles under
 * `npm run type-check` and only fails under a full `nx build desktop`, which
 * is the slowest gate in the matrix. This closes that gap in the fast one.
 *
 * The templates are found by asking which components read this table rather
 * than by naming `jobs.component.html`. The page is being split into child
 * components one step at a time, and each step used to move markup out of the
 * one file this guard looked at - silently narrowing it, since a child's
 * `icons.*` reference was then checked by nothing. Discovering the list keeps
 * every future split covered without anyone remembering to come back here.
 */
describe('JOB_DETAIL_ICONS', () => {
  function componentTemplates(directory: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        found.push(...componentTemplates(path));
      } else if (entry.name.endsWith('.component.ts')) {
        const source = readFileSync(path, 'utf8');
        if (source.includes('JOB_DETAIL_ICONS')) {
          found.push(path.replace(/\.ts$/, '.html'));
        }
      }
    }
    return found.sort();
  }

  const templates = componentTemplates(__dirname);

  function iconsUsedInTemplate(): string[] {
    const used = new Set<string>();
    for (const path of templates) {
      const template = readFileSync(path, 'utf8');
      for (const [, name] of template.matchAll(/\bicons\.([A-Za-z_$][\w$]*)/g)) used.add(name);
    }
    return [...used].sort();
  }

  it('looks at every component that reads the table, not just the page', () => {
    // Guards the guard twice over: a discovery that found only the page would
    // pass silently after the next split, and a regex matching nothing would
    // make the assertion below pass for every possible icon table.
    expect(templates.length).toBeGreaterThan(1);
    expect(iconsUsedInTemplate().length).toBeGreaterThan(10);
  });

  it('defines every icon the job detail templates ask for', () => {
    const missing = iconsUsedInTemplate().filter((name) => !(name in JOB_DETAIL_ICONS));

    expect(missing).toEqual([]);
  });

  it('gives every entry a real component, not undefined', () => {
    const empty = Object.entries(JOB_DETAIL_ICONS)
      .filter(([, value]) => !value)
      .map(([name]) => name);

    expect(empty).toEqual([]);
  });
});

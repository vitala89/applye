import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOB_DETAIL_ICONS } from './job-detail-icons';

/**
 * A template that asks for `icons.doesNotExist` compiles under
 * `npm run type-check` and only fails under a full `nx build desktop`, which
 * is the slowest gate in the matrix. This closes that gap in the fast one.
 */
describe('JOB_DETAIL_ICONS', () => {
  const template = readFileSync(join(__dirname, 'jobs.component.html'), 'utf8');

  function iconsUsedInTemplate(): string[] {
    const used = new Set<string>();
    for (const [, name] of template.matchAll(/\bicons\.([A-Za-z_$][\w$]*)/g)) used.add(name);
    return [...used].sort();
  }

  it('finds icon references in the template at all', () => {
    // Guards the guard: a regex that silently matches nothing would make the
    // assertion below pass for every possible icon table.
    expect(iconsUsedInTemplate().length).toBeGreaterThan(10);
  });

  it('defines every icon the job detail template asks for', () => {
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

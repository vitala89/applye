import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A cache signal nobody initializes must break a test, not quietly return null.
 *
 * `SettingsService` held `signal<Settings | null>(null)` filled only by a
 * separate `async load()`, and `load()` was never called anywhere in the app.
 * Every reader got `null` on every run, so a whole AI step silently never
 * executed - and "the step did not run" looked exactly like "the vacancy really
 * names no employer" on screen. Diagnosing it took several rounds.
 *
 * The service is gone. This guard still rejects that shape, and it also rejects
 * reactive application state anywhere under `libs/data`. Gateways stay
 * `@Injectable` stateless wrappers. A `signal` or `computed` import, a
 * `*.store.ts` file, or a `stores/` directory is application state and belongs
 * in `libs/application`. Comments that mention the word do not count.
 */
const SERVICES_DIR = __dirname;
const DATA_SRC = join(__dirname, '..', '..');

/** `signal<Foo | null>(null)`, the uninitialized-cache declaration. */
const NULL_CACHE_SIGNAL = /signal<[^>]*\|\s*null>\(\s*null\s*\)/;
/** A separate loader whose only job is to fill that signal after construction. */
const SEPARATE_LOADER = /\basync\s+load\s*\(/;

const GATEWAY_FILES = [
  'applications.gateway.ts',
  'discover.gateway.ts',
  'documents.gateway.ts',
  'drafts.gateway.ts',
  'interview.gateway.ts',
  'jobs.gateway.ts',
  'profile.gateway.ts',
  'settings.gateway.ts',
  'system.gateway.ts',
  'tracker.gateway.ts',
];

/** Drop comments so a sentence that mentions `signal` is not a store. */
export function sourceWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * `libs/data` may keep Angular DI. It may not own signal-backed application
 * state. Returns a reason when `filePath` / `source` would put that state back.
 */
export function dataStateOwnershipViolation(filePath: string, source: string): string | null {
  const normalized = filePath.replaceAll('\\', '/');
  if (normalized.includes('/stores/') || normalized.endsWith('.store.ts')) {
    return `${normalized} is application state and belongs in libs/application`;
  }
  const code = sourceWithoutComments(source);
  const importsState =
    /import\s+(?:type\s+)?\{[^}]*\b(?:signal|computed)\b[^}]*\}\s*from\s*['"]@angular\/core['"]/s.test(
      code,
    );
  const callsState = /(?:^|[^.\w])(?:signal|computed)\s*\(/m.test(code);
  if (importsState || callsState) {
    return `${normalized} owns signal or computed application state`;
  }
  return null;
}

function productionTypeScriptFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...productionTypeScriptFiles(path));
      continue;
    }
    if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) found.push(path);
  }
  return found;
}

describe('libs/data services', () => {
  const files = readdirSync(SERVICES_DIR).filter(
    (f) => (f.endsWith('.service.ts') || f.endsWith('.gateway.ts')) && !f.endsWith('.spec.ts'),
  );

  it('has services to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('covers every gateway, not only the services the guard was written for', () => {
    const gateways = files.filter((f) => f.endsWith('.gateway.ts')).sort();
    expect(gateways).toEqual(GATEWAY_FILES);
  });

  it.each(files)('%s does not cache state in a signal filled by a separate load()', (file) => {
    const src = readFileSync(join(SERVICES_DIR, file), 'utf8');
    const trap = NULL_CACHE_SIGNAL.test(src) && SEPARATE_LOADER.test(src);
    expect(trap).toBe(false);
  });
});

describe('libs/data state ownership', () => {
  const production = productionTypeScriptFiles(DATA_SRC);

  it('rejects a store file under libs/data', () => {
    expect(
      dataStateOwnershipViolation(
        'libs/data/src/lib/stores/company.store.ts',
        'export class CompanyStore {}',
      ),
    ).toMatch(/application state/);
    expect(
      dataStateOwnershipViolation(
        'libs/data/src/lib/stores/career.store.ts',
        "import { Injectable } from '@angular/core';\nexport class CareerStore {}",
      ),
    ).toMatch(/application state/);
  });

  it('rejects signal and computed state without rejecting Injectable or a comment', () => {
    expect(
      dataStateOwnershipViolation(
        'libs/data/src/lib/services/career.gateway.ts',
        "import { Injectable, signal } from '@angular/core';\nconst cache = signal(1);\n",
      ),
    ).toMatch(/signal or computed/);
    expect(
      dataStateOwnershipViolation(
        'libs/data/src/lib/services/career.gateway.ts',
        "import { computed, Injectable } from '@angular/core';\nconst view = computed(() => 1);\n",
      ),
    ).toMatch(/signal or computed/);
    expect(
      dataStateOwnershipViolation(
        'libs/data/src/lib/services/jobs.gateway.ts',
        "// does not own a signal cache\nimport { Injectable } from '@angular/core';\nexport class JobsGateway {}\n",
      ),
    ).toBeNull();
  });

  it('has no store file and no signal-backed application state', () => {
    const violations = production.flatMap((file) => {
      const reason = dataStateOwnershipViolation(
        relative(join(DATA_SRC, '..', '..'), file),
        readFileSync(file, 'utf8'),
      );
      return reason ? [reason] : [];
    });
    expect(violations).toEqual([]);
  });
});

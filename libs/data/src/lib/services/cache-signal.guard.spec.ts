import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A cache signal nobody initializes must break a test, not quietly return null.
 *
 * `SettingsService` held `signal<Settings | null>(null)` filled only by a
 * separate `async load()`, and `load()` was never called anywhere in the app.
 * Every reader got `null` on every run, so a whole AI step silently never
 * executed - and "the step did not run" looked exactly like "the vacancy really
 * names no employer" on screen. Diagnosing it took several rounds.
 *
 * The service is gone; consumers read `DbService.getSettings()` directly. This
 * guard is what stops the shape from coming back: a service that declares a
 * null-initialized cache signal and hands its population to a separate `load()`
 * fails here, with the fix stated in the failure message.
 *
 * Deliberately a pattern check rather than a name check - the trap is the shape,
 * not the word "settings".
 */
const SERVICES_DIR = __dirname;

/** `signal<Foo | null>(null)`, the uninitialized-cache declaration. */
const NULL_CACHE_SIGNAL = /signal<[^>]*\|\s*null>\(\s*null\s*\)/;
/** A separate loader whose only job is to fill that signal after construction. */
const SEPARATE_LOADER = /\basync\s+load\s*\(/;

describe('libs/data services', () => {
  const files = readdirSync(SERVICES_DIR).filter(
    (f) => f.endsWith('.service.ts') && !f.endsWith('.spec.ts'),
  );

  it('has services to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s does not cache state in a signal filled by a separate load()', (file) => {
    const src = readFileSync(join(SERVICES_DIR, file), 'utf8');
    const trap = NULL_CACHE_SIGNAL.test(src) && SEPARATE_LOADER.test(src);
    expect(trap).toBe(false);
  });
});

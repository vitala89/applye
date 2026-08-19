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
 * The service is gone; consumers read `ProfileSettingsGateway.getSettings()` directly. This
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
  // Gateways are checked too, and were not before. The guard was written when
  // `db.service.ts` held every wrapper; the migration cut that file into eight
  // `*.gateway.ts` files, which the `.service.ts` glob does not match - so the
  // trap could have come back inside a gateway unobserved. Widened when the
  // last gateway landed and the god-service was deleted.
  const files = readdirSync(SERVICES_DIR).filter(
    (f) => (f.endsWith('.service.ts') || f.endsWith('.gateway.ts')) && !f.endsWith('.spec.ts'),
  );

  it('has services to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('covers every gateway, not only the services the guard was written for', () => {
    const gateways = files.filter((f) => f.endsWith('.gateway.ts'));
    expect(gateways.length).toBe(8);
  });

  it.each(files)('%s does not cache state in a signal filled by a separate load()', (file) => {
    const src = readFileSync(join(SERVICES_DIR, file), 'utf8');
    const trap = NULL_CACHE_SIGNAL.test(src) && SEPARATE_LOADER.test(src);
    expect(trap).toBe(false);
  });
});

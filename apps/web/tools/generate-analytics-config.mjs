#!/usr/bin/env node
/**
 * Writes apps/web/src/app/analytics/measurement-id.ts from the
 * `GA_MEASUREMENT_ID` environment variable.
 *
 * Runs before a production build (`npm run web:build`). With the variable
 * unset - a checkout, a dev machine, a preview build - the file keeps the
 * `G-PLACEHOLDER` value and `AnalyticsService` refuses to load GA at all, so
 * no environment without an explicit ID can pollute the property.
 *
 * A malformed ID is a hard error rather than a silent fallback: a production
 * build that quietly ships no analytics is worse than one that fails loudly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/app/analytics/measurement-id.ts');

const PLACEHOLDER = 'G-PLACEHOLDER';
const raw = (process.env.GA_MEASUREMENT_ID ?? '').trim();

if (raw && !/^G-[A-Z0-9]{6,}$/.test(raw)) {
  console.error(
    `GA_MEASUREMENT_ID is set to "${raw}", which is not a GA4 measurement ID (G-XXXXXXXXXX).`,
  );
  process.exit(1);
}

const id = raw || PLACEHOLDER;
const current = readFileSync(target, 'utf8');
const next = current.replace(/^export const GA_MEASUREMENT_ID = '.*';$/m, () => {
  return `export const GA_MEASUREMENT_ID = '${id}';`;
});

if (next === current) {
  console.log(`analytics config: measurement ID already ${id}`);
} else {
  writeFileSync(target, next);
  console.log(`analytics config: measurement ID set to ${id}`);
}

if (id === PLACEHOLDER) {
  console.log('analytics config: GA_MEASUREMENT_ID unset - analytics will stay disabled.');
}

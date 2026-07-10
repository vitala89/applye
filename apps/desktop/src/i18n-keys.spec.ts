import * as fs from 'fs';
import * as path from 'path';
import { TRANSLATIONS } from '@applye/i18n';

// Guard: every `t()('namespace.key')` reference anywhere under apps/desktop
// must resolve to a real value in TRANSLATIONS.en (libs/i18n/src/lib/
// translations/translations.ts — the ACTUAL runtime source TranslateService
// reads; the sibling .json files in that folder are unused legacy and must
// never be treated as the source of truth again). Without this, a missing
// key renders as the raw dotted string in the UI instead of failing the
// build — this test turns that into a fast, deterministic CI failure.

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const APP_DIR = path.join(WORKSPACE_ROOT, 'apps', 'desktop', 'src', 'app');

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

function flatten(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of flatten(v as Record<string, unknown>, full)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

// Matches the direct call shape `t()('a.b')` and the `? 'a.b'` / `: 'a.b'`
// shape of ternaries and object-literal values — covers every dynamic key
// call site in this codebase (e.g. `t()(col.labelKey)` where `labelKey` is
// itself defined as `'status.applied'` in an object literal).
const KEY_PATTERN =
  /t\(\)\(\s*'([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)'|[?:]\s*'([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)'/g;

function extractKeys(content: string): string[] {
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = KEY_PATTERN.exec(content))) {
    // Skip dynamic-key prefixes: `t()('documents.cover_letter_tone_' + opt)`
    // matches the literal `documents.cover_letter_tone_`, but the real keys
    // are formed at runtime (`..._formal`, `..._friendly`, …). A trailing
    // `+` right after the closing quote means this is a concatenation prefix,
    // not a complete key — the runtime-resolved key can't be checked statically.
    const rest = content.slice(match.index + match[0].length).trimStart();
    if (rest.startsWith('+')) continue;
    keys.push((match[1] ?? match[2]) as string);
  }
  return keys;
}

describe('i18n keys', () => {
  it('every t() key referenced under apps/desktop exists in TRANSLATIONS.en', () => {
    const flat = flatten(TRANSLATIONS.en as unknown as Record<string, unknown>);

    const used = new Set<string>();
    for (const file of walk(APP_DIR)) {
      for (const key of extractKeys(fs.readFileSync(file, 'utf-8'))) {
        used.add(key);
      }
    }

    // No namespace pre-filter here on purpose: an earlier version of this
    // test only flagged keys whose namespace already existed, which hid an
    // entire missing `health` namespace instead of catching it. A few
    // false positives from unrelated dotted literals is a better failure
    // mode than silently missing a whole namespace again.
    const missing = [...used].filter((k) => !flat.has(k)).sort();

    expect(missing).toEqual([]);
  });

  it('TRANSLATIONS.de has the same key set as TRANSLATIONS.en (no silent drift)', () => {
    const en = flatten(TRANSLATIONS.en as unknown as Record<string, unknown>);
    const de = flatten(TRANSLATIONS.de as unknown as Record<string, unknown>);
    expect([...de].sort()).toEqual([...en].sort());
  });
});

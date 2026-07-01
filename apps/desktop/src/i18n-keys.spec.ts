import * as fs from 'fs';
import * as path from 'path';

// Guard: every `t()('namespace.key')` reference anywhere under apps/desktop
// must resolve to a real value in en.json. Without this, a missing key
// renders as the raw dotted string in the UI instead of failing the build —
// this test turns that into a fast, deterministic CI failure instead.

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const APP_DIR = path.join(WORKSPACE_ROOT, 'apps', 'desktop', 'src', 'app');
const EN_JSON_PATH = path.join(
  WORKSPACE_ROOT,
  'libs',
  'i18n',
  'src',
  'lib',
  'translations',
  'en.json',
);

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
    keys.push((match[1] ?? match[2]) as string);
  }
  return keys;
}

describe('i18n keys', () => {
  it('every t() key referenced under apps/desktop exists in en.json', () => {
    const en = JSON.parse(fs.readFileSync(EN_JSON_PATH, 'utf-8'));
    const namespaces = new Set(Object.keys(en));
    const flat = flatten(en);

    const used = new Set<string>();
    for (const file of walk(APP_DIR)) {
      for (const key of extractKeys(fs.readFileSync(file, 'utf-8'))) {
        used.add(key);
      }
    }

    // Only judge dotted literals whose first segment is a real i18n
    // namespace — filters out unrelated dotted identifiers/strings that
    // happen to match the shape but aren't translation keys.
    const missing = [...used]
      .filter((k) => namespaces.has(k.split('.')[0]))
      .filter((k) => !flat.has(k))
      .sort();

    expect(missing).toEqual([]);
  });
});

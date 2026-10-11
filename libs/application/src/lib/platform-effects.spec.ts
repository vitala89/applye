import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname);

/** Production sources only. Specs may still name a banned effect to forbid it. */
function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return productionFiles(path);
    if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) return [];
    return [path];
  });
}

const BANNED = [
  'ToastService',
  '@tauri-apps',
  '@angular/router',
  'localStorage',
  'sessionStorage',
  'navigator.clipboard',
  'openUrl',
  'plugin-opener',
  'openFile(',
  'revealFile(',
  'revealInFolder',
  'open_file',
  'reveal_in_folder',
  "'/documents/cv'",
  "'/documents/cover-letter'",
  'queryParams',
];

describe('application platform boundary', () => {
  it('keeps navigation, dialogs, storage and notification out of production code', () => {
    const hits: string[] = [];
    for (const file of productionFiles(ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const needle of BANNED) {
        if (text.includes(needle)) hits.push(`${file} contains ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

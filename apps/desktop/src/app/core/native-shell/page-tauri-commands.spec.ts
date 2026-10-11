import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = ['@tauri-apps/api/core', "'open_file'", "'reveal_in_folder'"];

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'native-shell') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      productionFiles(path, out);
      continue;
    }
    if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

describe('desktop pages do not invoke Tauri commands', () => {
  it('keeps raw invoke in the native-shell adapter', () => {
    const root = join(__dirname, '../../..');
    const hits: string[] = [];
    for (const file of productionFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const banned of BANNED) {
        if (text.includes(banned)) hits.push(`${file} contains ${banned}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

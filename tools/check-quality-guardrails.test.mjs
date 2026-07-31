import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fileSizeScript = join(repositoryRoot, 'tools', 'check-file-size-budgets.mjs');
const attributionScript = join(repositoryRoot, 'tools', 'check-attribution.mjs');

function run(command, args, { cwd = repositoryRoot, env = {} } = {}) {
  return spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function git(cwd, args) {
  const result = run('git', args, { cwd });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function createRepository(t) {
  const directory = mkdtempSync(join(tmpdir(), 'applye-quality-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  git(directory, ['init', '--quiet']);
  git(directory, ['config', 'user.name', 'Applye Quality Test']);
  git(directory, ['config', 'user.email', 'quality-test@example.com']);

  return directory;
}

function writeLines(path, count, prefix = 'const value') {
  writeFileSync(
    path,
    `${Array.from({ length: count }, (_, index) => `${prefix}${index} = ${index};`).join('\n')}\n`,
  );
}

function commitAll(directory, message = 'chore: create quality fixture') {
  git(directory, ['add', '.']);
  git(directory, ['commit', '--no-verify', '--quiet', '-m', message]);
}

test('file-size guard enforces new-file and legacy-file ratchets', (t) => {
  const directory = createRepository(t);
  const sourceDirectory = join(directory, 'apps', 'demo');
  mkdirSync(sourceDirectory, { recursive: true });

  const smallFile = join(sourceDirectory, 'small.ts');
  const legacyFile = join(sourceDirectory, 'legacy.ts');
  writeLines(smallFile, 10, 'const small');
  writeLines(legacyFile, 450, 'const legacy');
  commitAll(directory);

  appendFileSync(smallFile, 'const extra = 1;\n');
  let result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const untrackedLargeFile = join(sourceDirectory, 'untracked-large.ts');
  writeLines(untrackedLargeFile, 401, 'const untracked');
  result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new typescript\/javascript source has 401 lines/i);
  rmSync(untrackedLargeFile);

  appendFileSync(legacyFile, 'const legacyExtra = 1;\n');
  result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already over budget and grew from 450 to 451 lines/i);

  git(directory, ['checkout', '--', 'apps/demo/legacy.ts', 'apps/demo/small.ts']);

  const stagedLargeFile = join(sourceDirectory, 'staged-large.ts');
  writeLines(stagedLargeFile, 401, 'const staged');
  git(directory, ['add', 'apps/demo/staged-large.ts']);
  result = run(process.execPath, [fileSizeScript, '--staged'], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new typescript\/javascript source has 401 lines/i);
});

test('attribution guard accepts a normal commit message and rejects forbidden trailers', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'applye-attribution-message-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const validMessage = join(directory, 'valid-message.txt');
  writeFileSync(validMessage, 'fix: keep the commit focused\n');
  let result = run(process.execPath, [attributionScript, '--message-file', validMessage]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const invalidMessage = join(directory, 'invalid-message.txt');
  writeFileSync(
    invalidMessage,
    'fix: include forbidden attribution\n\nCo-authored-by: Helper <helper@example.com>\n',
  );
  result = run(process.execPath, [attributionScript, '--message-file', invalidMessage]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /co-authored-by/i);
});

test('attribution guard scans branch commits and pull-request text', (t) => {
  const directory = createRepository(t);
  writeFileSync(join(directory, 'README.md'), '# Fixture\n');
  commitAll(directory);
  const base = git(directory, ['rev-parse', 'HEAD']);

  appendFileSync(join(directory, 'README.md'), '\nChanged.\n');
  git(directory, ['add', 'README.md']);
  git(directory, [
    'commit',
    '--no-verify',
    '--quiet',
    '-m',
    'fix: add fixture change',
    '-m',
    'Co-authored-by: Helper <helper@example.com>',
  ]);

  let result = run(process.execPath, [attributionScript, '--base', base], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /co-authored-by/i);

  git(directory, ['reset', '--hard', base]);
  result = run(
    process.execPath,
    [attributionScript, '--base', base, '--pr-body-env', 'QUALITY_PR_BODY'],
    {
      cwd: directory,
      env: { QUALITY_PR_BODY: 'Generated-by: external helper' },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /generated-by/i);
});

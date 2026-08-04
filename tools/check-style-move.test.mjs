import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const styleMoveScript = join(repositoryRoot, 'tools', 'check-style-move.mjs');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function createRepository(t) {
  const directory = mkdtempSync(join(tmpdir(), 'applye-style-move-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  git(directory, ['init', '--quiet', '--initial-branch', 'main']);
  git(directory, ['config', 'user.name', 'Applye Quality Test']);
  git(directory, ['config', 'user.email', 'quality-test@example.com']);
  mkdirSync(join(directory, 'styles'), { recursive: true });

  return directory;
}

function runCheck(directory, paths) {
  return spawnSync(process.execPath, [styleMoveScript, '--base', 'main', ...paths], {
    cwd: directory,
    encoding: 'utf8',
    // Node resolves `sass` from this repository's install, not the fixture's.
    env: { ...process.env, NODE_PATH: join(repositoryRoot, 'node_modules') },
  });
}

const PAGE = `.card {
  padding: 10px;
  color: red;
}

.field,
.select {
  height: 30px;
  border: 1px solid grey;
}

.first {
  min-height: 60vh;
  display: flex;
}
`;

function seed(directory) {
  writeFileSync(join(directory, 'styles', 'page.scss'), PAGE);
  git(directory, ['add', '.']);
  git(directory, ['commit', '--no-verify', '--quiet', '-m', 'chore: seed stylesheet']);
}

/// The check exists because comparing selector *names* passed a tree where a
/// rule had lost its whole body. This is that exact shape: `.field` survives
/// as a dangling selector in front of the next rule, so its name is still
/// present while its declarations are gone and `.first`'s have been grafted on.
test('reports a rule whose body was lost to a dangling selector', (t) => {
  const directory = createRepository(t);
  seed(directory);

  // `.field,` with no body of its own - Sass attaches it to `.first`.
  writeFileSync(
    join(directory, 'styles', 'page.scss'),
    `.card {
  padding: 10px;
  color: red;
}

.field,

.first {
  min-height: 60vh;
  display: flex;
}
`,
  );
  writeFileSync(
    join(directory, 'styles', 'child.scss'),
    `.select {
  height: 30px;
  border: 1px solid grey;
}
`,
  );

  const result = runCheck(directory, ['styles/page.scss', 'styles/child.scss']);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /LOST\s+\.field/);
  assert.match(result.stdout, /- height: 30px/);
  assert.match(result.stdout, /GAINED\s+\.field/);
  assert.match(result.stdout, /\+ min-height: 60vh/);
  // The rule that genuinely moved must not be reported.
  assert.doesNotMatch(result.stdout, /LOST\s+\.select/);
});

test('passes when every declaration survives the move', (t) => {
  const directory = createRepository(t);
  seed(directory);

  writeFileSync(
    join(directory, 'styles', 'page.scss'),
    `.first {
  min-height: 60vh;
  display: flex;
}
`,
  );
  writeFileSync(
    join(directory, 'styles', 'child.scss'),
    `.card {
  padding: 10px;
  color: red;
}

.field,
.select {
  height: 30px;
  border: 1px solid grey;
}
`,
  );

  const result = runCheck(directory, ['styles/page.scss', 'styles/child.scss']);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /Lossless/);
});

/// A declaration that moved behind a media query is not the same declaration:
/// it no longer applies at every width. The at-rule has to qualify the key.
test('does not treat a declaration moved behind a media query as unchanged', (t) => {
  const directory = createRepository(t);
  seed(directory);

  writeFileSync(
    join(directory, 'styles', 'page.scss'),
    `.card {
  padding: 10px;
}

@media (min-width: 900px) {
  .card {
    color: red;
  }
}

.field,
.select {
  height: 30px;
  border: 1px solid grey;
}

.first {
  min-height: 60vh;
  display: flex;
}
`,
  );

  const result = runCheck(directory, ['styles/page.scss']);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /LOST\s+\.card/);
  assert.match(result.stdout, /- color: red/);
});

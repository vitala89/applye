import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  readFileSync,
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
const qualityBaseVariables = [
  'ATTRIBUTION_BASE',
  'FILE_SIZE_BASE',
  'GITHUB_BASE_REF',
  'NX_BASE',
  'NX_HEAD',
];

function run(command, args, { cwd = repositoryRoot, env = {} } = {}) {
  const childEnvironment = { ...process.env };
  for (const variable of qualityBaseVariables) delete childEnvironment[variable];

  return spawnSync(command, args, {
    cwd,
    env: { ...childEnvironment, ...env },
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

/// The excluded paths are the one way a file can be over budget and still pass,
/// so each one has to be exact. A pattern that leaked - matching any
/// `*-tables.ts`, or the whole discover folder - would silently stop measuring
/// the rules module the exclusion exists to keep measurable.
test('file-size guard excludes the location vocabulary and nothing beside it', (t) => {
  const directory = createRepository(t);
  const discover = join(directory, 'apps', 'desktop', 'src', 'app', 'pages', 'discover');
  mkdirSync(discover, { recursive: true });
  writeLines(join(discover, 'discover-location-tables.ts'), 900, 'const country');
  commitAll(directory);

  let result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  // Its spec is ordinary source and still measured.
  writeLines(join(discover, 'discover-location-tables.spec.ts'), 700, 'const check');
  result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new typescript\/javascript test has 700 lines/i);
  rmSync(join(discover, 'discover-location-tables.spec.ts'));

  // The rules module beside it is measured, which is the point of the split.
  writeLines(join(discover, 'discover-location.ts'), 401, 'const rule');
  result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new typescript\/javascript source has 401 lines/i);
  rmSync(join(discover, 'discover-location.ts'));

  // And the name alone buys nothing anywhere else.
  const elsewhere = join(directory, 'apps', 'desktop', 'src', 'app', 'pages', 'jobs');
  mkdirSync(elsewhere, { recursive: true });
  writeLines(join(elsewhere, 'discover-location-tables.ts'), 401, 'const copycat');
  result = run(process.execPath, [fileSizeScript], { cwd: directory });
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

test('attribution guard skips bot-authored commits but not humans borrowing a bot name', (t) => {
  const directory = createRepository(t);
  writeFileSync(join(directory, 'README.md'), '# Fixture\n');
  commitAll(directory);
  const base = git(directory, ['rev-parse', 'HEAD']);

  const trailers = ['-m', 'Signed-off-by: dependabot[bot] <support@github.com>'];
  appendFileSync(join(directory, 'README.md'), '\nBumped.\n');
  git(directory, ['add', 'README.md']);
  git(directory, [
    'commit',
    '--no-verify',
    '--quiet',
    '--author',
    'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>',
    '-m',
    'chore(deps): bump a dependency',
    ...trailers,
  ]);

  let result = run(process.execPath, [attributionScript, '--base', base], { cwd: directory });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  // The bot username alone is not enough: the address has to match as well.
  git(directory, ['reset', '--hard', base]);
  appendFileSync(join(directory, 'README.md'), '\nBumped.\n');
  git(directory, ['add', 'README.md']);
  git(directory, [
    'commit',
    '--no-verify',
    '--quiet',
    '--author',
    'dependabot[bot] <helper@example.com>',
    '-m',
    'chore(deps): bump a dependency',
    ...trailers,
  ]);

  result = run(process.execPath, [attributionScript, '--base', base], { cwd: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /signed-off-by/i);
});

/**
 * Angular templates are compiled by `ngc`, not by `tsc`. A template binding to
 * a member the component does not have, or a type the template cannot accept,
 * passes `tsc -p ... --noEmit` with zero errors and fails only under a full
 * `nx build`. That gap cost four round-trips in one session before it was
 * measured: `ngc --noEmit` catches both and is no slower.
 *
 * This test exists so the gate cannot quietly go back to `tsc`.
 */
test('the type-check gate for Angular apps is template-aware', () => {
  for (const project of ['apps/desktop', 'apps/web']) {
    const config = JSON.parse(readFileSync(join(repositoryRoot, project, 'project.json'), 'utf8'));
    const command = config.targets?.['type-check']?.options?.command ?? '';

    assert.match(
      command,
      /\bngc\b/,
      `${project} type-check must run ngc, which checks templates; got: ${command}`,
    );
    assert.doesNotMatch(
      command,
      /\btsc\b/,
      `${project} type-check must not fall back to tsc, which does not see templates`,
    );
  }
});

/**
 * Rust keeps its unit tests in the same file by convention, so a single budget
 * covering both halves says little about either: a small module with a large
 * test suite and a file of nearly 700 lines of pure logic scored the same under
 * the old 800-line rule. Source and inline tests are counted separately, which
 * means the counter has to find the `#[cfg(test)]` block - and that means
 * scanning Rust well enough not to be fooled by a brace inside a string.
 */
test('file-size guard counts Rust source and inline tests separately', (t) => {
  const directory = createRepository(t);
  const sourceDirectory = join(directory, 'apps', 'demo');
  mkdirSync(sourceDirectory, { recursive: true });

  const file = join(sourceDirectory, 'wide.rs');
  const source = (count) =>
    Array.from({ length: count }, (_, index) => `pub fn f${index}() -> u8 { ${index % 250} }`).join(
      '\n',
    );
  const tests = (count) =>
    [
      '#[cfg(test)]',
      'mod tests {',
      ...Array.from(
        { length: count },
        (_, index) => `    #[test] fn t${index}() { assert!(true); }`,
      ),
      '}',
    ].join('\n');

  // 480 source lines is under the 500 budget; 700 test lines would blow the old
  // single 800-line rule outright, and must not count against source.
  writeFileSync(file, `${source(480)}\n${tests(700)}\n`);
  commitAll(directory);
  let result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  // Inline tests have their own budget and it does bite.
  writeFileSync(file, `${source(480)}\n${tests(700)}\n`);
  appendFileSync(file, `${tests(10)}\n`);
  result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /rust inline tests/i);

  // Growing the source half is reported against the source budget, naming the
  // half that grew rather than a combined number.
  writeFileSync(file, `${source(520)}\n${tests(700)}\n`);
  result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /rust source .*crossed the 500-line budget/i);
});

/**
 * The `#[cfg(test)]` block is found by matching braces, so a stray brace inside
 * a literal *within that block* would close it early and bill its remaining
 * lines to source. That is not hypothetical: the discover tests are full of
 * raw-string JSON fixtures. Lifetimes are the opposite trap - `&'a str` looks
 * like the start of a char literal and must not swallow the rest of the file.
 */
test('file-size guard is not fooled by braces inside Rust literals', (t) => {
  const directory = createRepository(t);
  const sourceDirectory = join(directory, 'apps', 'demo');
  mkdirSync(sourceDirectory, { recursive: true });

  const file = join(sourceDirectory, 'tricky.rs');

  // Deliberately unbalanced when read as plain text: every one of these carries
  // a `}` that closes nothing.
  const decoys = [
    '    let json = r#"{"a":[{"b":"}"}]}"#;',
    '    let hashed = r##"still "#" inside}"##;',
    '    let plain = "unbalanced } brace";',
    "    let brace_char = '}';",
    "    let quote_char = '\\'';",
    '    /* nested /* block */ comment with } */',
    '    // trailing comment carrying a lone }',
    "    fn borrow<'a>(value: &'a str) -> &'a str { value }",
  ];

  // 450 source lines sits under the 500 budget with room to spare. The test
  // module is large enough that misreading it as source would blow that budget,
  // so a masking bug fails this test rather than merely skewing a number.
  const source = Array.from(
    { length: 450 },
    (_, index) => `pub fn f${index}() -> u8 { ${index % 250} }`,
  );
  const testBlock = [
    '#[cfg(test)]',
    'mod tests {',
    '    #[test]',
    '    fn fixtures() {',
    ...decoys,
    '        assert!(true);',
    '    }',
    ...Array.from({ length: 200 }, (_, index) => `    #[test] fn t${index}() { assert!(true); }`),
    '}',
  ];

  writeFileSync(file, `${source.join('\n')}\n${testBlock.join('\n')}\n`);
  commitAll(directory);

  const result = run(process.execPath, [fileSizeScript, '--all'], { cwd: directory });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  // Asserted as exact counts, not just "under budget": every masking bug moves
  // one of these two numbers, and several of them move it downwards, which a
  // budget-status assertion would happily accept.
  assert.match(
    result.stdout,
    /near\s+450\/500\s+apps\/demo\/tricky\.rs \(Rust source\)/,
    result.stdout,
  );
  assert.match(result.stdout, /Rust source\s+0\/1 over budget/, result.stdout);
});

/**
 * The default run only sees changed files, so a clean report means "nothing I
 * touched is near budget" and never "the repository is clean". That was misread
 * once, and the fix is a mode that answers the second question.
 */
test('file-size guard can audit the whole repository without failing', (t) => {
  const directory = createRepository(t);
  const sourceDirectory = join(directory, 'apps', 'demo');
  mkdirSync(sourceDirectory, { recursive: true });

  writeLines(join(sourceDirectory, 'small.ts'), 10, 'const small');
  writeLines(join(sourceDirectory, 'legacy.ts'), 450, 'const legacy');
  commitAll(directory);

  // The default run passes: the legacy file is over budget but did not grow.
  let result = run(process.execPath, [fileSizeScript], { cwd: directory });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  // The audit reports it anyway, and still exits zero - it is a report, not a
  // gate, because failing on pre-existing debt would only block unrelated work.
  result = run(process.execPath, [fileSizeScript, '--all'], { cwd: directory });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /1\/2 over budget/);
  assert.match(result.stdout, /apps\/demo\/legacy\.ts/);
});

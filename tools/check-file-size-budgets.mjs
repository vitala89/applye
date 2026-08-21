import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { effectiveLineCount, maskFor, maskRust, rustTestLines } from './lib/comment-mask.mjs';

const argv = process.argv.slice(2);
const staged = argv.includes('--staged');
// Audit the whole repository instead of the diff. The default run only sees
// changed files, so "passed" means "nothing I touched is near budget" and never
// "the repository is clean" - a distinction that has already been misread once.
const auditAll = argv.includes('--all');
const baseIndex = argv.indexOf('--base');
const explicitBase = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;

const ZERO_SHA = /^0+$/;

/**
 * Every non-Rust budget below was lowered from its pre-comment-stripping value
 * once comments stopped counting (see `comment-mask.mjs`), so the gate keeps
 * pressuring the same effective code volume it did before rather than quietly
 * loosening by however many comment lines a file happens to carry. The cut is
 * measured, not guessed: a repo-wide pass (`git ls-files` through the same
 * maskers, tracked source only) found comments are 19-30% of non-empty lines
 * in TypeScript/JavaScript source and stores, 3% in templates, 7% in tests,
 * and 11% in stylesheets - see `docs/governance/CODE_QUALITY.md`. Each budget
 * below is set at the lower of "fully compensated for that measured cut" and
 * "at least as high as the largest file already in the repository", so this
 * change cannot silently fail a file nobody has touched - it can only make an
 * already-large file `near` instead of comfortably clear.
 */
const budgets = [
  {
    label: 'TypeScript/JavaScript test',
    max: 580,
    matches: (file) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file),
  },
  {
    // Tighter than an ordinary source file on purpose (ADR-0005). Once a page
    // component stops being the god-object, its store is the next candidate,
    // and 225 is what forces a large page to decompose into several stores by
    // responsibility rather than into one relocated lump.
    label: 'Application-layer store',
    max: 225,
    matches: (file) =>
      /\.store\.[cm]?ts$/.test(file) || /^libs\/application\/.*\.[cm]?ts$/.test(file),
  },
  {
    label: 'TypeScript/JavaScript source',
    max: 350,
    matches: (file) => /\.[cm]?[jt]sx?$/.test(file),
  },
  {
    // Left at 300: the measured cut here is 3% overall and 0% at the median -
    // most templates carry no comments at all, so lowering this budget would
    // not restore any pressure comments never relaxed in the first place.
    label: 'Angular template',
    max: 300,
    matches: (file) => file.endsWith('.html'),
  },
  {
    label: 'Stylesheet',
    max: 380,
    matches: (file) => /\.(?:scss|css)$/.test(file),
  },
  {
    // Rust is measured in two parts - see `measure`. This entry only claims the
    // file for the Rust rules; the two maxes below are the ones enforced.
    label: 'Rust source',
    max: 800,
    matches: (file) => file.endsWith('.rs'),
  },
];

/**
 * Rust source excludes inline `#[cfg(test)]` items, so this was already
 * stricter than the 800 it replaced even though the number was smaller: 800
 * used to cover both halves at once, which let a module with a large test
 * suite pass while a file of nearly 700 lines of pure logic passed on the
 * same score. 400 (down from 500) folds in the comment-stripping cut above -
 * measured at 20% for Rust source - and still clears the largest source file
 * in the repository today by a comfortable margin.
 */
const RUST_SOURCE_MAX = 400;
/**
 * Matches the TypeScript test budget in spirit; test code is repetitive by
 * nature. 540 (down from 600) folds in the measured 10% comment cut for
 * inline Rust tests.
 */
const RUST_TEST_MAX = 540;

const excludedPatterns = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)target\//,
  /(^|\/)coverage\//,
  /(^|\/)migrations\//,
  /(^|\/)fixtures?\//,
  /(^|\/)__fixtures__\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /\.d\.ts$/,
  /\.(?:generated|gen)\.[cm]?[jt]s$/,
  // The translation catalogue is data, not design: line count says nothing about
  // its structure, and a locale file grows every time a string is added.
  /^libs\/i18n\/src\/lib\/translations\/(?!.*\.spec\.)/,
  // Same argument, same shape: the Discover location vocabulary is a flat table
  // of countries, cities, states and provinces that grows when a job board names
  // a place a new way. The rules that read it are ordinary source and stay on
  // budget in `discover-location.ts`; splitting the table further would only
  // spread one list across files that differ by continent. Listed by path on
  // purpose - `*-tables.ts` is not a category anyone can opt into.
  /^apps\/desktop\/src\/app\/pages\/discover\/discover-location-tables\.ts$/,
];

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'ignore' : 'inherit'],
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function splitLines(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function untrackedFiles() {
  return splitLines(git(['ls-files', '--others', '--exclude-standard'], { allowFailure: true }));
}

function configuredBase() {
  const candidate =
    explicitBase ||
    process.env.FILE_SIZE_BASE ||
    process.env.NX_BASE ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);

  if (!candidate || ZERO_SHA.test(candidate)) return undefined;
  return candidate;
}

function localBase() {
  const workingTree = splitLines(
    git(['diff', 'HEAD', '--name-only', '--diff-filter=ACMR', '--no-renames'], {
      allowFailure: true,
    }),
  );

  if (workingTree.length > 0 || untrackedFiles().length > 0) return 'HEAD';
  return git(['rev-parse', 'HEAD^'], { allowFailure: true }) || undefined;
}

function resolveBase() {
  if (staged) return 'HEAD';
  return configuredBase() || localBase();
}

function changedFiles(base) {
  if (staged) {
    return splitLines(
      git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '--no-renames']),
    );
  }

  if (!base) return [];

  if (base === 'HEAD') {
    const tracked = splitLines(
      git(['diff', 'HEAD', '--name-only', '--diff-filter=ACMR', '--no-renames'], {
        allowFailure: true,
      }),
    );
    return [...new Set([...tracked, ...untrackedFiles()])];
  }

  const mergeBase = git(['merge-base', base, 'HEAD'], { allowFailure: true }) || base;
  return splitLines(
    git(['diff', '--name-only', '--diff-filter=ACMR', '--no-renames', mergeBase, 'HEAD']),
  );
}

function isInScope(file) {
  return (
    /^(?:apps|libs|tools)\//.test(file) && !excludedPatterns.some((pattern) => pattern.test(file))
  );
}

function budgetFor(file) {
  return budgets.find((budget) => budget.matches(file));
}

/**
 * One file can be measured against more than one budget. Rust is the only case
 * today: its tests live in the same file by convention, so source and tests are
 * counted separately rather than sharing one number that says little about
 * either. Everything else is a single measurement.
 */
function measure(file, content) {
  const budget = budgetFor(file);
  if (!budget) return [];
  if (!file.endsWith('.rs')) {
    return [
      { label: budget.label, max: budget.max, lines: effectiveLineCount(maskFor(file, content)) },
    ];
  }
  const masked = maskRust(content);
  const testLines = rustTestLines(masked);
  const lines = masked.split(/\r?\n/);
  let source = 0;
  let tests = 0;
  lines.forEach((text, index) => {
    if (!text.trim()) return;
    if (testLines.has(index)) tests += 1;
    else source += 1;
  });
  return [
    { label: 'Rust source', max: RUST_SOURCE_MAX, lines: source },
    { label: 'Rust inline tests', max: RUST_TEST_MAX, lines: tests },
  ];
}

function baseContent(base, file) {
  if (!base) return undefined;
  const resolvedBase =
    base === 'HEAD' ? 'HEAD' : git(['merge-base', base, 'HEAD'], { allowFailure: true }) || base;
  const content = git(['show', `${resolvedBase}:${file}`], { allowFailure: true });
  return content || undefined;
}

if (auditAll) {
  const tracked = splitLines(git(['ls-files'])).filter(
    (file) => existsSync(file) && isInScope(file) && budgetFor(file),
  );

  const listed = [];
  const totals = new Map();
  for (const file of tracked) {
    for (const part of measure(file, readFileSync(file, 'utf8'))) {
      const seen = totals.get(part.label) ?? { count: 0, over: 0 };
      seen.count += 1;
      if (part.lines > part.max) seen.over += 1;
      totals.set(part.label, seen);
      // Same 80% threshold the default run uses for its notices, so a file that
      // is merely close shows its numbers here too rather than only once it is
      // already a problem.
      if (part.lines >= Math.floor(part.max * 0.8)) listed.push({ file, ...part });
    }
  }

  console.log(`File-size audit of ${tracked.length} tracked files.\n`);
  for (const [label, seen] of totals) {
    console.log(`  ${label.padEnd(20)} ${seen.over}/${seen.count} over budget`);
  }

  if (listed.length > 0) {
    console.log('\nOver budget or within 20% of it, worst first:');
    for (const item of listed.sort((a, b) => b.lines / b.max - a.lines / a.max)) {
      const mark = item.lines > item.max ? 'OVER ' : 'near ';
      console.log(
        `  ${mark}${String(item.lines).padStart(5)}/${item.max}  ${item.file} (${item.label})`,
      );
    }
  }

  // Reporting only. The ratchet in the default run is what blocks a change;
  // failing here would only mean failing on debt that predates this tool.
  console.log('\nAudit only - this mode never fails. The default run is the gate.');
  process.exit(0);
}

const base = resolveBase();
const files = [...new Set(changedFiles(base))].filter(
  (file) => existsSync(file) && isInScope(file) && budgetFor(file),
);

if (files.length === 0) {
  console.log('File-size budgets: no changed source files to check.');
  process.exit(0);
}

const violations = [];
const notices = [];

for (const file of files) {
  const parts = measure(file, readFileSync(file, 'utf8'));
  const previous = baseContent(base, file);
  const previousParts = previous === undefined ? undefined : measure(file, previous);

  for (const [index, part] of parts.entries()) {
    const currentLines = part.lines;
    const previousLines = previousParts?.[index]?.lines;
    const what = part.label.toLowerCase();

    if (currentLines >= Math.floor(part.max * 0.8)) {
      notices.push(
        `${file}: ${currentLines}/${part.max} non-empty lines (${part.label})` +
          (previousLines === undefined ? '' : `, base ${previousLines}`),
      );
    }

    if (currentLines <= part.max) continue;

    if (previousLines === undefined) {
      violations.push(`${file}: new ${what} has ${currentLines} lines; budget is ${part.max}.`);
      continue;
    }

    if (previousLines <= part.max) {
      violations.push(
        `${file}: ${what} grew from ${previousLines} to ${currentLines} lines and crossed the ${part.max}-line budget.`,
      );
      continue;
    }

    if (currentLines > previousLines) {
      violations.push(
        `${file}: ${what} already over budget and grew from ${previousLines} to ${currentLines} lines. Extract before adding code.`,
      );
    }
  }
}

if (notices.length > 0) {
  console.log('File-size budget report:');
  for (const notice of notices) console.log(`  - ${notice}`);
}

if (violations.length > 0) {
  console.error('\nFile-size budget violations:');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('\nSee docs/governance/CODE_QUALITY.md for decomposition rules and exceptions.');
  process.exit(1);
}

console.log('File-size budgets: passed.');

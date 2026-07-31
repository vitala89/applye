import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const staged = argv.includes('--staged');
const baseIndex = argv.indexOf('--base');
const explicitBase = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;

const ZERO_SHA = /^0+$/;

const budgets = [
  {
    label: 'TypeScript/JavaScript test',
    max: 600,
    matches: (file) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file),
  },
  {
    label: 'TypeScript/JavaScript source',
    max: 400,
    matches: (file) => /\.[cm]?[jt]sx?$/.test(file),
  },
  {
    label: 'Angular template',
    max: 300,
    matches: (file) => file.endsWith('.html'),
  },
  {
    label: 'Stylesheet',
    max: 400,
    matches: (file) => /\.(?:scss|css)$/.test(file),
  },
  {
    label: 'Rust source',
    max: 800,
    matches: (file) => file.endsWith('.rs'),
  },
];

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

function effectiveLineCount(content) {
  return content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function baseContent(base, file) {
  if (!base) return undefined;
  const resolvedBase =
    base === 'HEAD' ? 'HEAD' : git(['merge-base', base, 'HEAD'], { allowFailure: true }) || base;
  const content = git(['show', `${resolvedBase}:${file}`], { allowFailure: true });
  return content || undefined;
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
  const budget = budgetFor(file);
  const currentLines = effectiveLineCount(readFileSync(file, 'utf8'));
  const previous = baseContent(base, file);
  const previousLines = previous === undefined ? undefined : effectiveLineCount(previous);

  if (currentLines >= Math.floor(budget.max * 0.8)) {
    notices.push(
      `${file}: ${currentLines}/${budget.max} non-empty lines (${budget.label})` +
        (previousLines === undefined ? '' : `, base ${previousLines}`),
    );
  }

  if (currentLines <= budget.max) continue;

  if (previousLines === undefined) {
    violations.push(
      `${file}: new ${budget.label.toLowerCase()} has ${currentLines} lines; budget is ${budget.max}.`,
    );
    continue;
  }

  if (previousLines <= budget.max) {
    violations.push(
      `${file}: grew from ${previousLines} to ${currentLines} lines and crossed the ${budget.max}-line budget.`,
    );
    continue;
  }

  if (currentLines > previousLines) {
    violations.push(
      `${file}: already over budget and grew from ${previousLines} to ${currentLines} lines. Extract before adding code.`,
    );
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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const staged = argv.includes('--staged');
// Audit the whole repository instead of the diff. The default run only sees
// changed files, so "passed" means "nothing I touched is near budget" and never
// "the repository is clean" - a distinction that has already been misread once.
const auditAll = argv.includes('--all');
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
    // Rust is measured in two parts - see `measure`. This entry only claims the
    // file for the Rust rules; the two maxes below are the ones enforced.
    label: 'Rust source',
    max: 800,
    matches: (file) => file.endsWith('.rs'),
  },
];

/**
 * Rust source excludes inline `#[cfg(test)]` items, so this is stricter than the
 * 800 it replaces even though the number is smaller: 800 used to cover both
 * halves at once, which let a module with a large test suite pass while a file
 * of nearly 700 lines of pure logic passed on the same score.
 */
const RUST_SOURCE_MAX = 500;
/** Matches the TypeScript test budget; test code is repetitive by nature. */
const RUST_TEST_MAX = 600;

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

/**
 * Blank out comments and literal contents, keeping every newline in place, so
 * braces and `#[cfg(test)]` can be found without a `{` inside a JSON fixture
 * string closing a module early. Rust needs the awkward cases handled: nested
 * block comments, raw strings with any number of hashes, and `'a` lifetimes,
 * which look like an unterminated char literal to a naive scanner.
 */
function maskRust(source) {
  const out = Array.from(source);
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      let depth = 1;
      let j = i + 2;
      while (j < source.length && depth > 0) {
        if (source.slice(j, j + 2) === '/*') {
          depth += 1;
          j += 2;
        } else if (source.slice(j, j + 2) === '*/') {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      blank(i, j);
      i = j;
      continue;
    }
    // Raw string: r, br, or rb followed by hashes and a quote.
    const raw = /^(?:b?r|rb)(#*)"/.exec(source.slice(i, i + 16));
    if (raw) {
      const close = `"${raw[1]}`;
      const start = i + raw[0].length;
      const end = source.indexOf(close, start);
      const stop = end === -1 ? source.length : end + close.length;
      blank(start, end === -1 ? source.length : end);
      i = stop;
      continue;
    }
    if (source[i] === '"' || (source[i] === 'b' && source[i + 1] === '"')) {
      let j = source[i] === '"' ? i + 1 : i + 2;
      while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
      blank(i, j);
      i = j + 1;
      continue;
    }
    if (source[i] === "'") {
      // A char literal closes within a few characters; anything else is a
      // lifetime and must not swallow the rest of the file.
      const rest = source.slice(i, i + 8);
      const ch = /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\}|.)|[^'\\])'/.exec(rest);
      if (ch) {
        blank(i, i + ch[0].length);
        i += ch[0].length;
      } else {
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Line numbers (0-based) belonging to `#[cfg(test)]` items. Inline test modules
 * are the Rust convention, so counting them against the source budget would
 * measure a well-tested module as a bloated one and quietly push tests out of
 * the file they belong to.
 */
function rustTestLines(source) {
  const masked = maskRust(source);
  const lineOf = [];
  let line = 0;
  for (const ch of masked) {
    lineOf.push(line);
    if (ch === '\n') line += 1;
  }
  const marked = new Set();
  const attr = /#\[cfg\(test\)\]/g;
  let match;
  while ((match = attr.exec(masked)) !== null) {
    const j = masked.indexOf('{', match.index);
    if (j === -1) break;
    let depth = 0;
    let k = j;
    for (; k < masked.length; k += 1) {
      if (masked[k] === '{') depth += 1;
      else if (masked[k] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    for (let p = match.index; p <= Math.min(k, masked.length - 1); p += 1) marked.add(lineOf[p]);
    attr.lastIndex = k;
  }
  return marked;
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
    return [{ label: budget.label, max: budget.max, lines: effectiveLineCount(content) }];
  }
  const testLines = rustTestLines(content);
  const lines = content.split(/\r?\n/);
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

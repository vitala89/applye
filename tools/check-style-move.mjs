#!/usr/bin/env node
// Verifies that a stylesheet split moved rules rather than losing them.
//
// A component extraction moves CSS between files. Comparing the *selectors*
// present before and after does not prove the move was lossless: a selector
// can survive with its body gone. That is not hypothetical - `.dv-input` lost
// its entire declaration block during the Discover Sources drawer cut, kept
// its name as a dangling `.dv-input,` in front of the next rule, and passed a
// selector-level comparison while rendering three inputs unstyled.
//
// So this compares *declarations*. It compiles every stylesheet named on the
// command line, on both sides of a git ref, and reports any selector whose set
// of declarations shrank or changed.
//
// Usage:
//   node tools/check-style-move.mjs --base main <stylesheet> [<stylesheet> ...]
//
// Pass every file the rules may have moved between: the page, each new child,
// and any shared partial. Files that do not exist on one side are skipped, so
// a child created by the split is handled without extra flags.

import { execFileSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import * as sass from 'sass';

// Resolved against the working directory rather than the script's own location,
// so the check can be pointed at any repository - which is what makes it
// testable against a fixture repository instead of only against this one.
const REPO_ROOT = process.cwd();

function parseArgs(argv) {
  const paths = [];
  let base = 'main';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') {
      base = argv[i + 1];
      i += 1;
    } else {
      paths.push(argv[i]);
    }
  }
  return { base, paths };
}

function atRef(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null; // The file does not exist on that side of the split.
  }
}

function compile(source, path) {
  // `@use` is resolved against the working tree even for the base revision.
  // Shared partials rarely change inside the same move, and resolving them
  // historically would need a full worktree checkout for a marginal gain.
  const appRoot = resolve(REPO_ROOT, 'apps/desktop/src');
  return sass.compileString(source, {
    loadPaths: [dirname(resolve(REPO_ROOT, path)), ...(existsSync(appRoot) ? [appRoot] : [])],
    style: 'expanded',
    silenceDeprecations: ['import', 'global-builtin'],
  }).css;
}

// Flattens compiled CSS into `selector -> Set(declaration)`. Nested at-rules
// (`@media`, `@supports`) qualify the selectors they contain so a declaration
// that moved behind a media query is not mistaken for the same one.
function declarationsOf(css) {
  const map = new Map();
  const add = (selector, body, prefix) => {
    for (const decl of body.split(';')) {
      const text = decl.trim().replace(/\s+/g, ' ');
      if (!text) continue;
      for (const one of selector.split(',')) {
        const key = (prefix ? `${prefix} | ` : '') + one.trim().replace(/\s+/g, ' ');
        if (!key) continue;
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(text);
      }
    }
  };

  const walk = (text, prefix) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      const head = text.slice(i, open).trim();
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@') && body.includes('{')) {
        walk(body, prefix ? `${prefix} ${head}` : head);
      } else if (!head.startsWith('@')) {
        add(head, body, prefix);
      }
      i = j;
    }
  };

  walk(stripComments(css), '');
  return map;
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function collect(paths, read) {
  const merged = new Map();
  for (const path of paths) {
    const source = read(path);
    if (source === null) continue;
    for (const [selector, decls] of declarationsOf(compile(source, path))) {
      if (!merged.has(selector)) merged.set(selector, new Set());
      for (const d of decls) merged.get(selector).add(d);
    }
  }
  return merged;
}

function main() {
  const { base, paths } = parseArgs(process.argv.slice(2));
  if (paths.length === 0) {
    console.error('Usage: node tools/check-style-move.mjs --base <ref> <stylesheet> ...');
    process.exit(2);
  }

  const rel = paths.map((p) => relative(REPO_ROOT, resolve(p)));
  const before = collect(rel, (p) => atRef(base, p));
  const after = collect(rel, (p) => {
    try {
      return readFileSync(resolve(REPO_ROOT, p), 'utf8');
    } catch {
      return null;
    }
  });

  const lost = [];
  const gained = [];
  for (const [selector, decls] of before) {
    const now = after.get(selector) ?? new Set();
    const missing = [...decls].filter((d) => !now.has(d));
    if (missing.length > 0) lost.push([selector, missing]);
  }
  for (const [selector, decls] of after) {
    const then = before.get(selector) ?? new Set();
    const extra = [...decls].filter((d) => !then.has(d));
    if (extra.length > 0) gained.push([selector, extra]);
  }

  console.log(`Style move check against \`${base}\`, across ${rel.length} stylesheet(s):`);
  for (const p of rel) console.log(`  - ${p}`);

  if (lost.length === 0 && gained.length === 0) {
    console.log('Every selector carries the same declarations it did before. Lossless.');
    return;
  }

  for (const [selector, decls] of lost) {
    console.log(`\n  LOST  ${selector}`);
    for (const d of decls) console.log(`          - ${d}`);
  }
  for (const [selector, decls] of gained) {
    console.log(`\n  GAINED  ${selector}`);
    for (const d of decls) console.log(`          + ${d}`);
  }
  console.log(
    `\n${lost.length} selector(s) lost declarations, ${gained.length} gained some. ` +
      'On a move-only change both should be empty; anything here is either a real ' +
      'loss or a deliberate change worth naming in the pull request.',
  );
  process.exitCode = 1;
}

main();

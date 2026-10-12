import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const SPEC_FILE = /\.(?:spec|test)\.[cm]?tsx?$/;
const IGNORED_DIRECTORIES = new Set(['__tests__', '__fixtures__', 'fixtures', 'testing']);

function toPosix(path) {
  return path.split(sep).join('/');
}

export function listProductionTypeScript(applicationLibDir) {
  const files = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(path);
        continue;
      }
      if (!/\.[cm]?tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
      if (SPEC_FILE.test(entry.name)) continue;
      files.push(path);
    }
  }

  walk(applicationLibDir);
  return files;
}

export function featureOf(applicationLibDir, file) {
  const rel = relative(applicationLibDir, file);
  if (rel.startsWith('..')) return null;
  const [top, ...rest] = toPosix(rel).split('/');
  if (!top || rest.length === 0) return '(application root)';
  return top;
}

function specifierText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return node.literal.text;
  return null;
}

function importIsTypeOnly(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    const named = clause.namedBindings;
    if (!clause.name && named && ts.isNamedImports(named)) {
      return named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly);
    }
    return false;
  }
  if (ts.isExportDeclaration(node)) return node.isTypeOnly === true;
  return false;
}

function moduleSpecifiers(sourceFile) {
  const specs = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: importIsTypeOnly(node),
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0]
    ) {
      const specifier = specifierText(node.arguments[0]);
      if (specifier) specs.push({ specifier, typeOnly: false });
    } else if (ts.isImportTypeNode(node)) {
      const specifier = specifierText(node.argument);
      if (specifier) specs.push({ specifier, typeOnly: true });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specs;
}

function isApplicationSelfImport(specifier) {
  return specifier === '@applye/application' || specifier.startsWith('@applye/application/');
}

function resolveRelative(fromFile, specifier) {
  const clean = specifier.replace(/[?#].*$/, '');
  const target = resolve(dirname(fromFile), clean);
  const stripped = target.replace(/\.(?:[cm]?tsx?|jsx?|mjs|cjs)$/, '');
  const candidates = [
    target,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}.mts`,
    join(stripped, 'index.ts'),
    join(target, 'index.ts'),
  ];

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next candidate. A missing file is not a resolved module.
    }
  }
  return null;
}

function addSite(map, key, site) {
  const existing = map.get(key);
  if (existing) {
    existing.sites.push(site);
    return;
  }
  const [from, to] = key.split('\0');
  map.set(key, { from, to, sites: [site] });
}

/**
 * Production cross-feature imports under `libs/application/src/lib`.
 * Specs are omitted. Type-only imports still create an edge.
 */
export function scanApplicationFeatures(applicationLibDir) {
  const barrel = resolve(applicationLibDir, '..', 'index.ts');
  const edges = new Map();
  const selfImports = [];
  const unresolved = [];
  const outside = [];

  for (const file of listProductionTypeScript(applicationLibDir)) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const from = featureOf(applicationLibDir, file);

    for (const spec of moduleSpecifiers(source)) {
      const site = { file, specifier: spec.specifier, typeOnly: spec.typeOnly };
      if (isApplicationSelfImport(spec.specifier)) {
        selfImports.push(site);
        continue;
      }
      if (!spec.specifier.startsWith('.')) continue;

      const resolved = resolveRelative(file, spec.specifier);
      if (!resolved) {
        unresolved.push(site);
        continue;
      }
      if (resolve(resolved) === barrel) {
        selfImports.push(site);
        continue;
      }

      const rel = relative(applicationLibDir, resolved);
      if (rel.startsWith('..')) {
        outside.push(site);
        continue;
      }

      const to = featureOf(applicationLibDir, resolved);
      if (!from || !to || from === to) continue;
      addSite(edges, `${from}\0${to}`, site);
    }
  }

  return {
    edges: [...edges.values()].sort((a, b) =>
      `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`),
    ),
    selfImports,
    unresolved,
    outside,
  };
}

export {
  evaluateApplicationBoundaries,
  findCycles,
  formatCycle,
} from './application-feature-rules.mjs';

import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { legacyCoreModelFiles } from './application-feature-policy.mjs';

function listFiles(directory) {
  const files = [];

  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.isFile()) files.push(path);
    }
  }

  walk(directory);
  return files;
}

function modelNamesOnDisk(modelsDirectory) {
  if (!existsSync(modelsDirectory)) return [];

  return listFiles(modelsDirectory)
    .map((file) => relative(modelsDirectory, file).split(sep).join('/'))
    .sort();
}

/**
 * @returns {string[]} repo-relative paths of files that are not in the legacy set
 */
export function findNewGenericModels(
  modelsDirectory,
  repositoryRoot,
  allowlist = legacyCoreModelFiles,
) {
  const allowed = new Set(allowlist);
  return modelNamesOnDisk(modelsDirectory)
    .filter((name) => !allowed.has(name))
    .map((name) => relative(repositoryRoot, join(modelsDirectory, name)).split(sep).join('/'));
}

/**
 * Allowlist names that are no longer files. A missing directory makes every
 * entry stale: the permission must leave with the file.
 * @returns {string[]}
 */
export function findStaleLegacyModelEntries(modelsDirectory, allowlist = legacyCoreModelFiles) {
  const present = new Set(modelNamesOnDisk(modelsDirectory));
  return allowlist.filter((name) => !present.has(name)).sort();
}

export function formatLegacyModelViolation(paths) {
  return [
    'Do not add new domain models to libs/core/src/lib/models.',
    'Create a domain-owned folder instead.',
    ...paths.map((path) => `  ${path}`),
  ].join('\n');
}

export function formatStaleLegacyModelAllowlist(names) {
  return [
    'Legacy core/models allowlist contains a file that no longer exists:',
    ...names.map((name) => `  ${name}`),
    '',
    'Remove the stale allowlist entry so this legacy filename cannot return.',
  ].join('\n');
}

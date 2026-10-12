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

/**
 * @returns {string[]} repo-relative paths of files that are not in the legacy set
 */
export function findNewGenericModels(
  modelsDirectory,
  repositoryRoot,
  allowlist = legacyCoreModelFiles,
) {
  if (!existsSync(modelsDirectory)) return [];

  const allowed = new Set(allowlist);
  return listFiles(modelsDirectory)
    .map((file) => relative(modelsDirectory, file).split(sep).join('/'))
    .filter((name) => !allowed.has(name))
    .sort()
    .map((name) => relative(repositoryRoot, join(modelsDirectory, name)).split(sep).join('/'));
}

export function formatLegacyModelViolation(paths) {
  return [
    'Do not add new domain models to libs/core/src/lib/models.',
    'Create a domain-owned folder instead.',
    ...paths.map((path) => `  ${path}`),
  ].join('\n');
}

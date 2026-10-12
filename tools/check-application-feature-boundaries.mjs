import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { approvedApplicationEdges } from './lib/application-feature-policy.mjs';
import {
  evaluateApplicationBoundaries,
  scanApplicationFeatures,
} from './lib/application-feature-graph.mjs';
import { findNewGenericModels, formatLegacyModelViolation } from './lib/legacy-core-models.mjs';

const repositoryRoot = process.cwd();
const applicationLib = resolve(repositoryRoot, 'libs/application/src/lib');
const modelsDirectory = resolve(repositoryRoot, 'libs/core/src/lib/models');

if (!existsSync(applicationLib)) {
  console.error(`Application library not found: ${applicationLib}`);
  process.exit(1);
}

const scan = scanApplicationFeatures(applicationLib);
const graph = evaluateApplicationBoundaries(scan, {
  repositoryRoot,
  approvedEdges: approvedApplicationEdges,
});
const newModels = findNewGenericModels(modelsDirectory, repositoryRoot);
const problems = [...graph.problems];
if (newModels.length > 0) problems.push(formatLegacyModelViolation(newModels));

if (problems.length > 0) {
  console.error(problems.join('\n\n'));
  process.exit(1);
}

console.log('Application feature graph is acyclic.');
console.log('');
if (graph.summary.length === 0) {
  console.log('No cross-feature production imports.');
} else {
  for (const edge of graph.summary) {
    console.log(`${edge.from} -> ${edge.to} (${edge.files.length} files)`);
    if (edge.reason) console.log(`  ${edge.reason}`);
    for (const file of edge.files) console.log(`  ${file}`);
  }
}

if (existsSync(modelsDirectory)) {
  console.log('');
  console.log('Legacy core/models bucket: no new generic model.');
}

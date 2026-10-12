import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { approvedApplicationEdges } from './lib/application-feature-policy.mjs';
import {
  evaluateApplicationBoundaries,
  scanApplicationFeatures,
} from './lib/application-feature-graph.mjs';
import { findNewGenericModels, formatLegacyModelViolation } from './lib/legacy-core-models.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checker = join(repositoryRoot, 'tools', 'check-application-feature-boundaries.mjs');

function writeModule(root, relativePath, source) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'applye-feature-boundaries-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lib = join(root, 'libs', 'application', 'src', 'lib');
  mkdirSync(lib, { recursive: true });
  return { root, lib };
}

function audit(root, lib, approvedEdges = [], requireDeclaredEdges = false) {
  const scan = scanApplicationFeatures(lib);
  return evaluateApplicationBoundaries(scan, {
    repositoryRoot: root,
    approvedEdges,
    requireDeclaredEdges,
  });
}

function runChecker(cwd) {
  return spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' });
}

test('an approved jobs to documents edge passes', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/jobs/workflow.ts',
    "import { DraftService } from '../documents/draft.service';\nexport const workflow = DraftService;\n",
  );
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.service.ts',
    'export class DraftService {}\n',
  );

  const result = audit(root, lib, approvedApplicationEdges, true);

  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.deepEqual(
    result.summary.map((edge) => `${edge.from}->${edge.to}`),
    ['jobs->documents'],
  );
});

test('a direct cycle fails even when both directions are approved', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/jobs/workflow.ts',
    "import { DraftService } from '../documents/draft.service';\nexport const workflow = DraftService;\n",
  );
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.service.ts',
    "import { JobRegion } from '../jobs/region';\nexport class DraftService {}\nexport const region = JobRegion;\n",
  );
  writeModule(root, 'libs/application/src/lib/jobs/region.ts', 'export type JobRegion = string;\n');

  const approved = [
    ...approvedApplicationEdges,
    { from: 'documents', to: 'jobs', reason: 'still a cycle' },
  ];
  const result = audit(root, lib, approved, true);
  const report = result.problems.join('\n');

  assert.equal(result.ok, false);
  assert.match(report, /Application feature dependency cycle detected:/);
  assert.match(report, /jobs/);
  assert.match(report, /-> documents/);
  assert.match(report, /documents/);
  assert.match(report, /-> jobs/);
  assert.match(report, /libs\/application\/src\/lib\/jobs\/workflow\.ts/);
  assert.match(report, /libs\/application\/src\/lib\/documents\/draft\.service\.ts/);
});

test('a transitive cycle fails', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/alpha/a.ts',
    "import { b } from '../beta/b';\nexport const a = b;\n",
  );
  writeModule(
    root,
    'libs/application/src/lib/beta/b.ts',
    "import { c } from '../gamma/c';\nexport const b = c;\n",
  );
  writeModule(
    root,
    'libs/application/src/lib/gamma/c.ts',
    "import { a } from '../alpha/a';\nexport const c = a;\n",
  );

  const approved = [
    { from: 'alpha', to: 'beta', reason: 'fixture' },
    { from: 'beta', to: 'gamma', reason: 'fixture' },
    { from: 'gamma', to: 'alpha', reason: 'fixture' },
  ];
  const result = audit(root, lib, approved, true);
  const report = result.problems.join('\n');

  assert.equal(result.ok, false);
  assert.match(report, /Application feature dependency cycle detected:/);
  assert.match(report, /alpha/);
  assert.match(report, /beta/);
  assert.match(report, /gamma/);
});

test('same-feature imports do not create a cross-feature edge', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/jobs/nested/a.ts',
    "import { b } from '../b';\nexport const a = b;\n",
  );
  writeModule(root, 'libs/application/src/lib/jobs/b.ts', 'export const b = 1;\n');

  const result = audit(root, lib, approvedApplicationEdges, false);

  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.deepEqual(result.summary, []);
});

test('spec imports do not enter the production graph', (t) => {
  const { root, lib } = fixture(t);
  writeModule(root, 'libs/application/src/lib/jobs/workflow.ts', 'export const workflow = 1;\n');
  writeModule(
    root,
    'libs/application/src/lib/jobs/workflow.spec.ts',
    "import { DraftService } from '../documents/draft.service';\nexport const used = DraftService;\n",
  );
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.service.ts',
    'export class DraftService {}\n',
  );

  const result = audit(root, lib, [], false);

  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.deepEqual(result.summary, []);
});

test('type-only imports still count as a feature dependency', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.ts',
    "import type { Region } from '../jobs/region';\nexport type DraftRegion = Region;\n",
  );
  writeModule(root, 'libs/application/src/lib/jobs/region.ts', 'export type Region = string;\n');

  const result = audit(root, lib, [], false);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.summary.map((edge) => `${edge.from}->${edge.to}`),
    ['documents->jobs'],
  );
  assert.match(result.problems.join('\n'), /type import/);
});

test('an inline type import and an import() type query still count', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.ts',
    "import { type Region } from '../jobs/region';\nexport type Also = import('../jobs/region').Region;\nexport type DraftRegion = Region;\n",
  );
  writeModule(root, 'libs/application/src/lib/jobs/region.ts', 'export type Region = string;\n');

  const scan = scanApplicationFeatures(lib);
  const edge = scan.edges.find((item) => item.from === 'documents' && item.to === 'jobs');

  assert.ok(edge);
  assert.equal(edge.sites.length, 2);
  assert.equal(
    edge.sites.every((site) => site.typeOnly),
    true,
  );
});

test('a production import of @applye/application is rejected', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/jobs/workflow.ts',
    "import { Store } from '@applye/application';\nexport const workflow = Store;\n",
  );
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.service.ts',
    'export class DraftService {}\n',
  );
  writeModule(
    root,
    'libs/application/src/lib/jobs/orchestrates.ts',
    "import { DraftService } from '../documents/draft.service';\nexport const used = DraftService;\n",
  );

  const result = audit(root, lib, approvedApplicationEdges, true);
  const report = result.problems.join('\n');

  assert.equal(result.ok, false);
  assert.match(report, /imports the application library from inside itself/);
  assert.match(report, /libs\/application\/src\/lib\/jobs\/workflow\.ts/);
});

test('a relative import of the application barrel is rejected', (t) => {
  const { root, lib } = fixture(t);
  writeModule(root, 'libs/application/src/index.ts', 'export const barrel = 1;\n');
  writeModule(
    root,
    'libs/application/src/lib/jobs/workflow.ts',
    "import { barrel } from '../../index';\nexport const workflow = barrel;\n",
  );
  writeModule(root, 'libs/application/src/lib/jobs/orchestrates.ts', 'export const used = 1;\n');
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.service.ts',
    'export class DraftService {}\n',
  );
  writeModule(
    root,
    'libs/application/src/lib/jobs/documents-edge.ts',
    "import { DraftService } from '../documents/draft.service';\nexport const used = DraftService;\n",
  );

  const result = audit(root, lib, approvedApplicationEdges, true);

  assert.match(result.problems.join('\n'), /imports the application library from inside itself/);
});

test('an unapproved one-way edge fails', (t) => {
  const { root, lib } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/pipeline/board.ts',
    "import { workflow } from '../jobs/workflow';\nexport const board = workflow;\n",
  );
  writeModule(root, 'libs/application/src/lib/jobs/workflow.ts', 'export const workflow = 1;\n');

  const result = audit(root, lib, [], false);

  assert.match(result.problems.join('\n'), /not approved/);
  assert.match(result.problems.join('\n'), /pipeline -> jobs/);
});

test('the current legacy model set passes and a new generic model fails', (t) => {
  const realModels = join(repositoryRoot, 'libs/core/src/lib/models');
  assert.deepEqual(findNewGenericModels(realModels, repositoryRoot), []);

  const { root } = fixture(t);
  const models = join(root, 'libs/core/src/lib/models');
  writeModule(root, 'libs/core/src/lib/models/job.model.ts', 'export type Job = { id: number };\n');
  assert.deepEqual(findNewGenericModels(models, root), []);

  writeModule(
    root,
    'libs/core/src/lib/models/career-evidence.model.ts',
    'export type CareerEvidence = { id: number };\n',
  );
  const added = findNewGenericModels(models, root);
  assert.deepEqual(added, ['libs/core/src/lib/models/career-evidence.model.ts']);
  assert.match(
    formatLegacyModelViolation(added),
    /Do not add new domain models to libs\/core\/src\/lib\/models/,
  );
  assert.match(formatLegacyModelViolation(added), /Create a domain-owned folder instead/);
});

test('the repository checker accepts the real application graph', () => {
  const result = runChecker(repositoryRoot);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Application feature graph is acyclic/);
  assert.match(result.stdout, /jobs -> documents/);
  assert.match(result.stdout, /Legacy core\/models bucket: no new generic model/);
  assert.doesNotMatch(result.stdout, /documents -> jobs/);
});

test('the repository checker fails a planted cycle and a new generic model', (t) => {
  const { root } = fixture(t);
  writeModule(
    root,
    'libs/application/src/lib/jobs/workflow.ts',
    "import { DraftService } from '../documents/draft.service';\nexport const workflow = DraftService;\n",
  );
  writeModule(
    root,
    'libs/application/src/lib/documents/draft.service.ts',
    "import type { Workflow } from '../jobs/workflow';\nexport class DraftService {}\nexport type Used = Workflow;\n",
  );
  writeModule(
    root,
    'libs/core/src/lib/models/career-evidence.model.ts',
    'export type CareerEvidence = { id: number };\n',
  );

  const result = runChecker(root);
  const report = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(report, /Application feature dependency cycle detected:/);
  assert.match(report, /type import/);
  assert.match(report, /Do not add new domain models to libs\/core\/src\/lib\/models/);
  assert.match(report, /career-evidence\.model\.ts/);
});

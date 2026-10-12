import { relative, sep } from 'node:path';

function relativePosix(root, file) {
  return relative(root, file).split(sep).join('/');
}

export function findCycles(edges) {
  const adjacency = new Map();
  const nodes = new Set();
  for (const edge of edges) {
    nodes.add(edge.from);
    nodes.add(edge.to);
    const next = adjacency.get(edge.from) ?? [];
    next.push(edge.to);
    adjacency.set(edge.from, next);
  }

  const color = new Map();
  const stack = [];
  const cycles = [];

  function dfs(node) {
    color.set(node, 'gray');
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (color.get(next) === 'gray') {
        const start = stack.indexOf(next);
        cycles.push(stack.slice(start).concat(next));
      } else if (color.get(next) !== 'black') {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, 'black');
  }

  for (const node of nodes) {
    if (!color.has(node)) dfs(node);
  }
  return cycles;
}

function filesFor(edges, from, to) {
  return edges.find((edge) => edge.from === from && edge.to === to)?.sites ?? [];
}

export function formatCycle(cycle, edges, repositoryRoot) {
  const lines = ['Application feature dependency cycle detected:', ''];
  for (let index = 0; index < cycle.length - 1; index += 1) {
    const from = cycle[index];
    const to = cycle[index + 1];
    lines.push(from);
    lines.push(`  -> ${to}`);
    for (const site of filesFor(edges, from, to)) {
      const kind = site.typeOnly ? ' (type import)' : '';
      lines.push(`     ${relativePosix(repositoryRoot, site.file)}${kind}`);
      lines.push(`       ${site.specifier}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function formatSites(repositoryRoot, sites) {
  return sites
    .map((site) => {
      const kind = site.typeOnly ? ' (type import)' : '';
      return `  ${relativePosix(repositoryRoot, site.file)}${kind}\n    ${site.specifier}`;
    })
    .join('\n');
}

export function evaluateApplicationBoundaries(scan, options) {
  const { repositoryRoot, approvedEdges } = options;
  const requireDeclaredEdges = options.requireDeclaredEdges !== false;
  const problems = [];
  const approved = new Set(approvedEdges.map((edge) => `${edge.from}->${edge.to}`));

  for (const cycle of findCycles(scan.edges)) {
    problems.push(formatCycle(cycle, scan.edges, repositoryRoot));
  }

  for (const edge of scan.edges) {
    if (approved.has(`${edge.from}->${edge.to}`)) continue;
    problems.push(
      [
        'Application feature dependency is not approved:',
        '',
        `${edge.from} -> ${edge.to}`,
        formatSites(repositoryRoot, edge.sites),
        '',
        'A feature may depend on another only when that direction is real orchestration.',
        'Move shared vocabulary to libs/core, or remove the import.',
      ].join('\n'),
    );
  }

  if (requireDeclaredEdges) {
    for (const declared of approvedEdges) {
      const present = scan.edges.some(
        (edge) => edge.from === declared.from && edge.to === declared.to,
      );
      if (present) continue;
      problems.push(
        [
          'Approved application edge has no production import:',
          `${declared.from} -> ${declared.to}`,
          'Remove it from the policy, or restore the orchestration that justified it.',
          `Reason on file: ${declared.reason}`,
        ].join('\n'),
      );
    }
  }

  for (const site of scan.selfImports) {
    problems.push(
      [
        'Production application code imports the application library from inside itself.',
        'A specifier of @applye/application, or a relative import of its barrel, hides which feature the dependency belongs to.',
        'Import the feature module by relative path, or move shared vocabulary to libs/core.',
        '',
        formatSites(repositoryRoot, [site]),
      ].join('\n'),
    );
  }

  for (const site of scan.unresolved) {
    problems.push(
      [
        'Could not resolve a relative import in production application code.',
        'The feature graph would miss this edge.',
        '',
        formatSites(repositoryRoot, [site]),
      ].join('\n'),
    );
  }

  for (const site of scan.outside) {
    problems.push(
      [
        'Production application code imports outside libs/application through a relative path.',
        '',
        formatSites(repositoryRoot, [site]),
      ].join('\n'),
    );
  }

  const summary = scan.edges
    .map((edge) => {
      const files = [
        ...new Set(edge.sites.map((site) => relativePosix(repositoryRoot, site.file))),
      ];
      const reason = approvedEdges.find(
        (declared) => declared.from === edge.from && declared.to === edge.to,
      )?.reason;
      return { from: edge.from, to: edge.to, files, reason };
    })
    .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));

  return { ok: problems.length === 0, problems, summary };
}

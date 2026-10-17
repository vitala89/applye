import { execFileSync } from 'node:child_process';

import { withoutEditorFooter } from './pr-editor-footer.mjs';

const repo = process.env.GITHUB_REPOSITORY;
const number = process.env.PR_NUMBER;

if (!repo || !number) {
  console.error('GITHUB_REPOSITORY and PR_NUMBER are required.');
  process.exit(1);
}

function gh(args, options = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    ...options,
  });
}

const current = JSON.parse(gh(['pr', 'view', number, '--repo', repo, '--json', 'body'])).body ?? '';
const next = withoutEditorFooter(current);

if (next === current) {
  console.log('Pull request description has no editor footer before the maintained section.');
  process.exit(0);
}

gh(['api', '--method', 'PATCH', `repos/${repo}/pulls/${number}`, '--input', '-'], {
  input: JSON.stringify({ body: next }),
});
console.log('Removed the editor footer from above the maintained pull request section.');

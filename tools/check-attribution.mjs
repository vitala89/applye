import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);

function valueAfter(flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'ignore' : 'inherit'],
    });
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

const forbidden = [
  /^\s*co-authored-by\s*:/i,
  /^\s*signed-off-by\s*:/i,
  /^\s*(?:generated|assisted|created|written|authored)-by\s*:/i,
  /^\s*ai-assisted-by\s*:/i,
  /^\s*(?:generated|written|authored|created|assisted)\s+(?:by|with)\s+(?:claude|chatgpt|codex|copilot|gemini|an?\s+ai|ai\s+agent)\b/i,
  /^\s*(?:claude|chatgpt|codex|copilot|gemini|ai\s+agent)\s+(?:generated|authored|assisted|created|wrote)\b/i,
  /^\s*🤖/u,
];

/**
 * Automation accounts sign their own commits, and that sign-off is not the
 * human or agent attribution this guard exists to keep out. GitHub app
 * identities always carry a `[bot]` username suffix, which a human account
 * cannot have, and a matching noreply address. Both must line up before a
 * commit body is skipped; the pull-request body is always inspected.
 */
const botNamePattern = /\[bot\]$/;
const botEmailPattern = /(?:\[bot\]@users\.noreply\.github\.com|^support@github\.com)$/i;

function isBotAuthor(name, email) {
  return botNamePattern.test(name.trim()) && botEmailPattern.test(email.trim());
}

function inspect(text, source, violations) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (forbidden.some((pattern) => pattern.test(line))) {
      violations.push(`${source}:${index + 1}: ${line.trim()}`);
    }
  }
}

const violations = [];
const messageFile = valueAfter('--message-file');

if (messageFile) {
  inspect(readFileSync(messageFile, 'utf8'), messageFile, violations);
} else {
  const explicitBase = valueAfter('--base');
  const candidate =
    explicitBase ||
    process.env.ATTRIBUTION_BASE ||
    process.env.NX_BASE ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);
  const base =
    candidate && !/^0+$/.test(candidate)
      ? candidate
      : git(['rev-parse', 'HEAD^'], { allowFailure: true }).trim();

  if (base) {
    const mergeBase = git(['merge-base', base, 'HEAD'], { allowFailure: true }).trim() || base;
    const log = git(['log', '--format=%H%x1f%an%x1f%ae%x1f%B%x1e', `${mergeBase}..HEAD`], {
      allowFailure: true,
    });

    for (const record of log.split('\x1e').filter(Boolean)) {
      const [sha, authorName = '', authorEmail = '', body = ''] = record.split('\x1f');
      if (isBotAuthor(authorName, authorEmail)) continue;
      inspect(body, `commit ${sha.trim().slice(0, 12)}`, violations);
    }
  }

  const prBodyEnv = valueAfter('--pr-body-env');
  if (prBodyEnv && process.env[prBodyEnv]) {
    inspect(process.env[prBodyEnv], 'pull request body', violations);
  }
}

if (violations.length > 0) {
  console.error('Forbidden commit or pull-request attribution found:');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    '\nRemove co-author, sign-off, generated-by, model, and agent attribution. Commits are authored only by the configured Git user.',
  );
  process.exit(1);
}

console.log('Commit and pull-request attribution: passed.');

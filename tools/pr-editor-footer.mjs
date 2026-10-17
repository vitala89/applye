const editorAttribution =
  'cursor|claude|chatgpt|codex|copilot|gemini|antigravity|grok|devin|windsurf|aider';

/** Editor footer line. Ordinary prose that uses the word "cursor" does not match. */
export const madeWithEditor = new RegExp(
  `^\\s*made with\\s+(?:\\[(?:${editorAttribution})\\]\\([^)\\r\\n]*\\)|(?:${editorAttribution})\\b)`,
  'i',
);

const maintainedSection = '<!-- CURSOR_AGENT_PR_BODY_BEGIN -->';

/**
 * Drop editor-footer lines that sit before the maintained pull-request section.
 * That prefix is preserved when the description is updated, so the footer cannot
 * be removed from the section this repository edits. Footer lines inside or after
 * the maintained section stay, and the attribution guard still rejects them.
 */
export function withoutEditorFooter(body) {
  const start = body.indexOf(maintainedSection);
  const head = start === -1 ? body : body.slice(0, start);
  const tail = start === -1 ? '' : body.slice(start);
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const cleanedHead = head
    .split(/\r?\n/)
    .filter((line) => !madeWithEditor.test(line))
    .join(newline);
  return `${cleanedHead}${tail}`;
}

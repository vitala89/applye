/** One styled span of a CV bullet/summary line. Bullet strings carry inline
 * emphasis as `**bold**`; this splits a line into ordered runs the preview
 * (and later the DOCX renderer) turn into <strong>/plain text. */
export interface CvTextRun {
  text: string;
  bold: boolean;
}

const EMPHASIS_RE = /\*\*(.+?)\*\*/g;

export function parseInlineEmphasis(input: string): CvTextRun[] {
  const runs: CvTextRun[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  EMPHASIS_RE.lastIndex = 0;
  while ((match = EMPHASIS_RE.exec(input)) !== null) {
    if (match.index > last) runs.push({ text: input.slice(last, match.index), bold: false });
    runs.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < input.length) runs.push({ text: input.slice(last), bold: false });
  return runs.length ? runs : [{ text: input, bold: false }];
}

/** Split a `**bold**` line into ordered word tokens (whitespace-delimited),
 * each tagged with the bold state it inherits from its run. Powers click-a-
 * word-to-bold in the preview: the rendered word index maps 1:1 to
 * `toggleWordBold`'s `index`. Each token's `text` keeps a trailing space
 * (except the last) so the spans reproduce the original spacing when laid out
 * inline. Empty (whitespace-only) tokens are dropped. */
export function wordTokens(text: string): { text: string; bold: boolean; index: number }[] {
  const ws = splitWords(text);
  const last = ws.length - 1;
  return ws.map((w, i) => ({ text: w.text + (i < last ? ' ' : ''), bold: w.bold, index: i }));
}

/** Flip the bold state of the word at `index` (as numbered by `wordTokens`)
 * and reserialize the whole line back to `**bold**` markdown - the persisted,
 * export-safe representation. Maximal runs of adjacent bold words share one
 * `**…**` wrapper. Out-of-range indices return the input unchanged. Pure. */
export function toggleWordBold(text: string, index: number): string {
  const ws = splitWords(text);
  if (index < 0 || index >= ws.length) return text;
  ws[index] = { ...ws[index], bold: !ws[index].bold };
  const parts: string[] = [];
  let i = 0;
  while (i < ws.length) {
    if (ws[i].bold) {
      let j = i;
      while (j < ws.length && ws[j].bold) j++;
      parts.push(
        '**' +
          ws
            .slice(i, j)
            .map((w) => w.text)
            .join(' ') +
          '**',
      );
      i = j;
    } else {
      parts.push(ws[i].text);
      i++;
    }
  }
  return parts.join(' ');
}

/** Ordered whitespace-delimited words with their run bold state - the shared
 * tokenizer behind `wordTokens`/`toggleWordBold`. */
function splitWords(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  for (const run of parseInlineEmphasis(text)) {
    for (const w of run.text.split(' ')) {
      if (w !== '') out.push({ text: w, bold: run.bold });
    }
  }
  return out;
}

/** Toggle `**bold**` around the selection of a plain text field. Pure - the
 * caller reads selStart/selEnd from the DOM field, applies the result to the
 * model, and restores the returned selection. */
export function toggleBoldWrap(
  text: string,
  selStart: number,
  selEnd: number,
): { text: string; selStart: number; selEnd: number } {
  if (selStart === selEnd) {
    const next = text.slice(0, selStart) + '****' + text.slice(selStart);
    return { text: next, selStart: selStart + 2, selEnd: selStart + 2 };
  }
  const before = text.slice(0, selStart);
  const sel = text.slice(selStart, selEnd);
  const after = text.slice(selEnd);
  // Already wrapped as part of the selection?
  if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4) {
    const inner = sel.slice(2, sel.length - 2);
    return { text: before + inner + after, selStart, selEnd: selStart + inner.length };
  }
  // Wrapped immediately outside the selection?
  if (before.endsWith('**') && after.startsWith('**')) {
    const nb = before.slice(0, before.length - 2);
    const na = after.slice(2);
    return { text: nb + sel + na, selStart: selStart - 2, selEnd: selEnd - 2 };
  }
  // Not wrapped → wrap.
  const next = before + '**' + sel + '**' + after;
  return { text: next, selStart: selStart + 2, selEnd: selEnd + 2 };
}

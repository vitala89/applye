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

/** Toggle `**bold**` around the selection of a plain text field. Pure — the
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

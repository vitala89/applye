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

/** Split out of `profile-markdown.ts` when it passed its 400-line budget.
 * One `## section` of the profile document, parsed and serialised. */

/** One education / certificate entry as edited in the structured profile UI.
 * Persisted inside the `## Education` markdown body (one line each), so
 * `ProfileForm.education` stays a plain string and nothing downstream needs a
 * new field. Degrees and certificates share this shape - the distinction is
 * just what the user types as `title`. */
export interface EducationEntry {
  /** Degree, programme, or certificate name (e.g. "BSc Computer Science",
   * "AWS Solutions Architect"). */
  title: string;
  /** Institution or provider (e.g. "MIT", "Coursera"). Optional. */
  institution: string;
  /** Free-text start, e.g. "2015" or "Sep 2015". Optional. */
  startDate: string;
  /** Free-text end, e.g. "2019"; empty means ongoing (renders "Present"). */
  endDate: string;
}

// en dash (U+2013) / em dash (U+2014) via char codes so no dash glyph appears
// in source (house rule: hyphen-only in the repo).
const EDU_RANGE_SEP = new RegExp(
  `\\s*(?:-|[${String.fromCharCode(0x2013, 0x2014)}]|to|bis)\\s*`,
  'i',
);

export const EMPTY_EDUCATION_ENTRY: EducationEntry = {
  title: '',
  institution: '',
  startDate: '',
  endDate: '',
};

/** Splits a trailing parenthesised group off a line: "English (C1)" becomes
 * `{ head: 'English', body: 'C1' }`, and a line without one returns null.
 *
 * Deliberately string scanning rather than the obvious `^(.*?)\s*\(([^)]*)\)\s*$`:
 * that regex is quadratic twice over, on a long run of '(' and on a long run of
 * spaces, and these lines are pasted CV text (CodeQL js/polynomial-redos).
 * Behaviour matches the regex exactly, including on unbalanced input: the group
 * is the one closing at the end of the line, and it may not contain ')'. */
export function splitTrailingParen(line: string): { head: string; body: string } | null {
  const trimmed = line.trimEnd();
  const close = trimmed.length - 1;
  if (close < 1 || trimmed[close] !== ')') return null;
  // The body may not contain ')', so the opening bracket is the first '(' after
  // whatever ')' came before this one.
  const open = trimmed.indexOf('(', trimmed.lastIndexOf(')', close - 1) + 1);
  if (open < 0 || open >= close) return null;
  return { head: trimmed.slice(0, open).trim(), body: trimmed.slice(open + 1, close) };
}

/** Parses the `## Education` body into structured entries, one per non-empty
 * line. Lenient and lossless: a line that does not match the canonical
 * "Title, Institution (start - end)" shape keeps whatever it has (a legacy
 * free-text line becomes an entry with just a `title`), so nothing is dropped
 * when an older profile is opened in the structured editor. */
export function parseEducationEntries(education: string): EducationEntry[] {
  return (education || '')
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      let startDate = '';
      let endDate = '';
      let head = line;
      const paren = splitTrailingParen(line);
      if (paren) {
        head = paren.head;
        const range = paren.body.split(EDU_RANGE_SEP).map((s) => s.trim());
        startDate = range[0] ?? '';
        const rawEnd = range[1] ?? '';
        endDate = /^(present|current|now|heute|jetzt|aktuell)$/i.test(rawEnd) ? '' : rawEnd;
      }
      head = head.replace(/,\s*$/, '');
      const comma = head.lastIndexOf(', ');
      const title = comma >= 0 ? head.slice(0, comma).trim() : head;
      const institution = comma >= 0 ? head.slice(comma + 2).trim() : '';
      return { title, institution, startDate, endDate };
    });
}

/** Serializes structured entries back into the `## Education` body: one
 * "- Title, Institution (start - end)" line each. Inverse of
 * `parseEducationEntries` for well-formed entries; fully blank entries are
 * dropped. */
export function serializeEducationEntries(entries: EducationEntry[]): string {
  return entries
    .map((e) => {
      const head = [e.title.trim(), e.institution.trim()].filter(Boolean).join(', ');
      const start = e.startDate.trim();
      const end = e.endDate.trim();
      let range = '';
      if (start && end) range = ` (${start} - ${end})`;
      else if (start) range = ` (${start} - Present)`;
      else if (end) range = ` (${end})`;
      return `${head}${range}`.trim();
    })
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join('\n');
}

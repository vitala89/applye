/** One structural piece of a job description, as the detail pane renders it. */
export interface JdBlock {
  kind: 'heading' | 'paragraph' | 'list';
  text?: string;
  items?: string[];
}

/** Longer than this and a line is prose, whatever words it contains. */
const HEADING_MAX_CHARS = 64;
const HEADING_MAX_WORDS = 8;
/** Longer than this and a line is too long to be one item of a list. */
const LIST_ITEM_MAX_CHARS = 90;
/** Two is the smallest run worth trusting - see `parseJdBlocks`. */
const MIN_LIST_RUN = 2;

const SECTION_WORDS =
  /\b(about|role|responsibilit|requirement|qualification|benefit|offer|stack|skills?|location|language|salary|compensation|team|process|who you|what you|looking for|nice to have|perks|culture|mission)\b/i;

const BULLET = /^[-•*]\s+(.*)$/u;

/**
 * A heading: a short line ending in a colon, or a short line naming one of the
 * sections job descriptions habitually use.
 *
 * The colon alone is not enough - a sentence can end in one - so a line that
 * reads as prose before the colon is rejected.
 */
export function looksLikeHeading(line: string): boolean {
  if (line.length > HEADING_MAX_CHARS) return false;
  if (line.endsWith(':') && !/[.,;!?]$/.test(line.slice(0, -1))) return true;
  if (/[.,;!?]$/.test(line)) return false;
  if (line.split(/\s+/).length > HEADING_MAX_WORDS) return false;
  return SECTION_WORDS.test(line);
}

/**
 * A line short enough to be one item of a list that lost its markers. Headings
 * are excluded so a section title is never absorbed into the list beneath it.
 */
export function isListyLine(line: string): boolean {
  return line.length > 0 && line.length <= LIST_ITEM_MAX_CHARS && !looksLikeHeading(line);
}

/**
 * Deterministic structure for a plain-text job description. No AI, 0 tokens.
 *
 * `strip_html` on the Rust side emits one line per block tag and **drops the
 * bullet markers**, so the structure has to be recovered heuristically: explicit
 * `- ` bullets and runs of two or more short lines become lists, colon- or
 * lexicon-style short lines become headings, and everything else joins into
 * paragraphs.
 *
 * A run of one is deliberately not a list. A single short line is far more
 * likely to be a stray sentence - a location, a salary - than a list of one.
 */
export function parseJdBlocks(text: string): JdBlock[] {
  const lines = text.split('\n').map((l) => l.trim());
  const blocks: JdBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      flushParagraph();
      i++;
      continue;
    }

    if (BULLET.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(BULLET);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }

    if (looksLikeHeading(line)) {
      flushParagraph();
      blocks.push({ kind: 'heading', text: line.replace(/:$/, '') });
      i++;
      continue;
    }

    if (isListyLine(line)) {
      let run = 0;
      while (i + run < lines.length && isListyLine(lines[i + run])) run++;
      if (run >= MIN_LIST_RUN) {
        flushParagraph();
        blocks.push({ kind: 'list', items: lines.slice(i, i + run) });
        i += run;
        continue;
      }
    }

    paragraph.push(line);
    i++;
  }

  flushParagraph();
  return blocks;
}

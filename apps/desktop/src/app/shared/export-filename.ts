/**
 * The name Applye suggests in the save dialog for an exported document.
 *
 * This is what a recruiter sees attached to an application, so it is written
 * for a person rather than for a shell. The document's own label already reads
 * well - "JetBrains - Senior Software Developer - Tailored CV" - and the job is
 * to keep those words and drop the punctuation that held them apart. The
 * previous rule kept hyphens and turned spaces into underscores, which rendered
 * every separator as the unreadable `_-_`.
 *
 * Case is preserved, because "JetBrains" is a name and "jetbrains" is not, and
 * letters outside ASCII are kept for the same reason - a company called Zürich
 * should not export as Z_rich.
 */

/**
 * Characters no filesystem across this project's three targets accepts in a
 * name, plus the path separators and the C0 control range. Dropped rather than
 * substituted: a stray colon should vanish, not become a space that widens the
 * gap between two words.
 */
// eslint-disable-next-line no-control-regex -- the C0 range is precisely what must not survive
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Runs of the characters that separate words in a label, collapsed to one space. */
const SEPARATORS = /[\s_-]+/g;

/**
 * Trailing dots and spaces are legal to write on macOS and Linux but are
 * silently trimmed by Windows, so a name ending in one differs across
 * platforms. Leading ones are just untidy.
 */
const EDGE_NOISE = /^[\s.]+|[\s.]+$/g;

/**
 * Long enough for any real company-and-role pair, short enough to leave room
 * for the extension within the 255-byte limit the three target filesystems
 * share.
 */
const MAX_BASE_LENGTH = 120;

/**
 * Turns a document label into the base of a filename: the same words, single
 * spaces between them, nothing a filesystem will refuse.
 *
 * Returns an empty string when nothing survives, which is the caller's cue to
 * fall back to something it knows is non-empty.
 */
export function exportFileBase(label: string): string {
  return (
    label
      .replace(ILLEGAL, '')
      .replace(SEPARATORS, ' ')
      .replace(EDGE_NOISE, '')
      .slice(0, MAX_BASE_LENGTH)
      // Slicing can re-expose an edge space, so trim once more after it.
      .replace(EDGE_NOISE, '')
  );
}

/** The suggested save name, extension included. */
export function exportFileName(label: string, fallback: string, extension: string): string {
  return `${exportFileBase(label) || exportFileBase(fallback) || 'document'}.${extension}`;
}

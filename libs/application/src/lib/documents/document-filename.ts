import type { CvContent, CvSection } from '@applye/core';

/**
 * The name Applye suggests in the save dialog for an exported CV or cover
 * letter, from every entry point - the editor's Export button, the apply
 * wizard's export step, and the Documents list' row action all call into
 * this file, so the same `document_library` row suggests the same name no
 * matter which button produced it.
 *
 * Germany is the one market with a filename convention strong enough to be
 * worth honouring: a CV's `Nachname_Vorname_Lebenslauf.ext` is what a
 * recruiter there expects to receive (ROADMAP §16.6), so `suggestCvFilename`
 * special-cases it when the region is `de` and the stored content carries a
 * parseable full name. There is no German convention for a cover letter to
 * mirror yet - `suggestCoverLetterFilename` stays region-blind until one
 * exists to encode. Not a `market-conventions/{region}.json` config: one
 * market with one rule does not need a lookup table, and the second one that
 * appears is what should pay for it (§16.2).
 *
 * Every other case falls back to `documentFilenameBase`: the label's own
 * words, kept - "JetBrains - Senior Software Developer" reads better as
 * "JetBrains Senior Software Developer" than as a lowercased,
 * underscore-joined slug, and this is what a recruiter sees attached to an
 * application. Case is preserved, because "JetBrains" is a name and
 * "jetbrains" is not, and letters outside ASCII are kept for the same reason
 * - a company called Zürich should not export as Z_rich.
 */

/**
 * Characters no filesystem across this project's three targets accepts in a
 * name, plus the path separators and the C0 control range. Dropped rather
 * than substituted: a stray colon should vanish, not become a space that
 * widens the gap between two words.
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
export function documentFilenameBase(label: string): string {
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

/** The filename to suggest in the save dialog for a CV. */
export function suggestCvFilename(
  item: { label?: string; regionTag?: string; contentJson?: string },
  format: string,
): string {
  if ((item.regionTag ?? '').toLowerCase() === 'de' && item.contentJson) {
    try {
      const content = JSON.parse(item.contentJson) as CvContent;
      const personal = content.sections.find(
        (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
      );
      const parts = (personal?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const nachname = parts[parts.length - 1];
        const vorname = parts.slice(0, -1).join('_');
        return `${nachname}_${vorname}_Lebenslauf.${format}`;
      }
    } catch {
      // Unparseable stored content is not a reason to refuse a filename - fall
      // through to the generic base below.
    }
  }
  return `${documentFilenameBase(item.label ?? '') || 'cv'}.${format}`;
}

/** The filename to suggest in the save dialog for a cover letter. */
export function suggestCoverLetterFilename(
  label: string | null | undefined,
  format: 'pdf' | 'docx',
): string {
  return `${documentFilenameBase(label ?? '') || 'cover-letter'}.${format}`;
}

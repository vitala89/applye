/**
 * A filename to suggest in the save dialog, derived from the document's label.
 *
 * Everything outside `a-z0-9_-` collapses to an underscore, and leading and
 * trailing underscores are trimmed - a label like `Acme GmbH - Anschreiben`
 * would otherwise produce a name the OS accepts but the user cannot read back.
 * An unlabelled document falls back to `cover-letter` rather than to `.pdf`
 * with no stem at all.
 */
export function suggestCoverLetterFilename(
  label: string | null | undefined,
  format: 'pdf' | 'docx',
): string {
  const base = (label || 'cover-letter')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base || 'cover-letter'}.${format}`;
}

/**
 * Deterministic German business-letter formatting (DIN 5008), applied at
 * render time rather than asked of the model.
 *
 * Both helpers are display-only: they never rewrite what the user typed in the
 * editor, so a hand-written date or subject survives untouched and the stored
 * content stays exactly what was saved.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * German letters date as `TT.MM.JJJJ`, conventionally prefixed with the place
 * ("Berlin, 23.07.2026"). The AI returns an ISO date, which reads as foreign on
 * a German letter.
 *
 * Only a bare ISO date is reformatted, and only for German: anything the user
 * typed themselves - including a date they already wrote with a place prefix -
 * is passed through unchanged.
 */
export function formatLetterDate(raw: string | null | undefined, language: string): string {
  const value = (raw ?? '').trim();
  if (!value || !language.toLowerCase().startsWith('de')) return value;
  const m = ISO_DATE.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

/**
 * DIN 5008 dropped the "Betreff:" label decades ago - the subject line stands
 * on its own, in bold. Models still emit the label (and its English
 * equivalent), so strip it deterministically instead of relying on the prompt.
 *
 * A subject that merely starts with the word ("Betreffend Ihre Anzeige") is
 * left alone: only the label followed by a colon is removed.
 */
export function stripSubjectLabel(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  return value.replace(/^(betreff|betr\.|subject|re)\s*:\s*/i, '').trim();
}

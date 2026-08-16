/**
 * The pure parts of reading a Discover feed row: how its location reads as a
 * work type, and how its source name is abbreviated.
 *
 * Beside `DiscoverFeedStore` rather than on it, the way `pipeline-card-view`
 * and `tracker-columns` sit beside theirs - these are functions of a row and
 * nothing else, and being injectable would buy them nothing (ADR-0005).
 *
 * Two things are deliberately **not** here, and both were measured rather than
 * assumed:
 *
 * - **Anything locale-dependent.** `ago`, `archBadgeLabel` and `tipText` format
 *   text, and this layer holds no locales - the same reason `formatDate` stayed
 *   out of `pipeline-card-view`.
 * - **Anything that reads the location vocabulary.** `classifyLoc` resolves a
 *   free-text location against an 811-line table that stays in the Discover
 *   page, because `libs/application` is imported by the eagerly-loaded shell and
 *   Discover is a lazy route. The rules below match plain substrings and reach
 *   no table, which is the only reason they could come down.
 */

/**
 * Words that mean "not tied to an office" in a job's location field.
 *
 * Substring matching on purpose: boards write "Remote (EU)", "Remote - US" and
 * "Anywhere in Europe", and a whole-word list would miss the parenthesised and
 * hyphenated forms that make up most of them.
 */
const REMOTE_MARKERS = ['remote', 'anywhere', 'worldwide', 'global', 'distributed'];

/** How a posting's location reads once classified. */
export type WorkType = 'remote' | 'hybrid' | 'onsite';

/** Whether a location field advertises remote work. */
export function isRemote(location: string | null): boolean {
  const loc = (location ?? '').toLowerCase();
  return REMOTE_MARKERS.some((m) => loc.includes(m));
}

/**
 * The work type a location field advertises.
 *
 * Hybrid is checked first and wins: "Hybrid - Berlin (remote 2 days)" contains a
 * remote marker as well, and reading it as fully remote would put it in a filter
 * the user chose to exclude the office from.
 */
export function workTypeOf(location: string | null): WorkType {
  const loc = (location ?? '').toLowerCase();
  if (loc.includes('hybrid')) return 'hybrid';
  if (isRemote(location)) return 'remote';
  return 'onsite';
}

/**
 * The source badge's text. Upper-cased, except "We Work Remotely", which is
 * abbreviated because the full name does not fit the badge at any weight.
 */
export function srcLabel(name: string | null): string {
  if (!name) return '';
  if (/^we work remotely$/i.test(name)) return 'WWR';
  return name.toUpperCase();
}

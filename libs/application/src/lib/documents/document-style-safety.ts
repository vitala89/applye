// The one thing the CV editor and the cover-letter editor genuinely share.
//
// ADR-0005 amendment twelve records the measurement behind that: the two style
// types are different, cover letters have no themes at all, and their
// `sectionStyles` are structurally different maps. What was duplicated verbatim
// is this - how often the ATS safety check runs, and how its results are
// collapsed before the user sees them.
//
// Deliberately **not** including the debounce itself. Scheduling depends on a
// private timer field per store, so sharing it would need a class with a
// lifecycle - more machinery than six duplicated lines earns.

import type { StyleNote } from '@applye/core';

/**
 * How long to wait after a style edit before re-running the safety check.
 *
 * Style edits arrive in bursts - dragging a size slider, or typing into a
 * colour field - and each one would otherwise cost a round trip. Long enough to
 * collapse a burst, short enough that the warning still feels attached to the
 * change that caused it.
 */
export const STYLE_CHECK_DEBOUNCE_MS = 400;

/**
 * Collapses duplicate warnings to one each.
 *
 * The global and per-section checks can surface the same `(kind, detail)` more
 * than once - a Light document weight plus two sections that override it will
 * report the same unavailable weight three times - and the user needs to be
 * told once. **Order is preserved**, so the first occurrence is the one kept
 * and the list still reads in the order the checker produced it.
 */
export function dedupeStyleNotes(notes: readonly StyleNote[]): StyleNote[] {
  const seen = new Set<string>();
  return notes.filter((n) => {
    const key = `${n.kind}|${n.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

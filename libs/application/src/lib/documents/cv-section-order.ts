// Section ordering for a CV, and the two header sections that never move.
//
// Split out of `cv-detail.component.ts` alongside `CvDocumentStore`. Every
// function takes a section list and returns a new one; nothing here reads a
// signal or touches the gateway, which is what makes the "a locked section
// cannot be moved" rule testable on its own rather than through a drag event.
//
// The CDK's `moveItemInArray` is deliberately not imported: this module is in
// `libs/application`, and a reorder is a splice. Keeping the drag library at the
// component boundary means the rule can be exercised without one.

import type { CvSection, CvSectionKey } from '@applye/core';

/** Header sections whose position is fixed - they carry the document's identity
 * (photo, then personal details) and must stay pinned to the top, so reordering
 * (drag or move buttons) is disabled for them. The order of this list IS their
 * canonical order. */
export const LOCKED_SECTION_KEYS: readonly CvSectionKey[] = ['photo', 'personal_details'];

export function isCvSectionLocked(key: CvSectionKey): boolean {
  return LOCKED_SECTION_KEYS.includes(key);
}

/** Pins the locked header sections to the top in their canonical order, leaving
 * the rest in their given order, then reassigns the `order` index. Guarantees a
 * reorder can never move a locked section or push another section above it.
 * A locked section that the document does not have is simply skipped. */
export function pinLockedSections(list: readonly CvSection[]): CvSection[] {
  const locked = LOCKED_SECTION_KEYS.map((k) => list.find((s) => s.key === k)).filter(
    (s): s is CvSection => !!s,
  );
  const rest = list.filter((s) => !isCvSectionLocked(s.key));
  return [...locked, ...rest].map((s, index) => ({ ...s, order: index }));
}

/** Moves the item at `from` to `to`, the same splice the CDK performs, then
 * re-pins. Out-of-range indices leave the list alone rather than dropping or
 * duplicating a section. */
export function reorderCvSections(
  list: readonly CvSection[],
  from: number,
  to: number,
): CvSection[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length)
    return pinLockedSections(list);
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return pinLockedSections(next);
}

/**
 * Nudges one section up (`-1`) or down (`+1`). Returns the list unchanged when
 * the move is not allowed: the section is locked, it is not in the list, or the
 * move would leave the list. Always returns a new array, so a caller can set it
 * unconditionally.
 *
 * **A refused move returns the list verbatim - it does not normalize it.** That
 * distinction is the only thing the two lock checks below decide, because
 * `reorderCvSections` re-pins and would put a section spliced above a locked
 * header back underneath it anyway. So on an already-pinned list the checks
 * cannot change the outcome, and mutation testing with pinned fixtures reported
 * them as dead code. They are not: on a list whose `order` values have drifted,
 * falling through reindexes it and refusing leaves it alone, which is the
 * behaviour the page had. The specs cover both shapes for that reason.
 */
export function moveCvSection(
  list: readonly CvSection[],
  key: CvSectionKey,
  offset: -1 | 1,
): CvSection[] {
  if (isCvSectionLocked(key)) return [...list];
  const index = list.findIndex((s) => s.key === key);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= list.length) return [...list];
  // Never swap a movable section past a locked header section.
  if (isCvSectionLocked(list[target].key)) return [...list];
  return reorderCvSections(list, index, target);
}

/** Replaces one section by key with a new immutable value - the sink for the
 * section-editor children's `(sectionChange)` output. */
export function replaceCvSection(list: readonly CvSection[], updated: CvSection): CvSection[] {
  return list.map((s) => (s.key === updated.key ? updated : s));
}

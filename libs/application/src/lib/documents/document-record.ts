// What the CV editor and the cover-letter editor share about the row itself.
//
// Only the default-flag rule lives here. The two upsert builders do not:
// a CV row carries `templateId` and `themeId` and a cover letter carries
// neither, so a shared builder would have to take both as optional and would
// stop telling the reader which fields a given document type actually writes.
//
// The rule below is worth sharing because it is an invariant rather than a
// shape - getting it wrong leaves the library with two defaults for one region,
// and that is invisible until a later save picks the wrong one.

import type { DocumentLibraryItem } from '@applye/core';

/**
 * The sibling rows that must stop being the default, because this document is
 * claiming that flag.
 *
 * "Default" is per region, not per library: a default DE letter and a default
 * US letter coexist, so only siblings sharing this document's region are
 * displaced. The document itself is excluded by id - re-saving an
 * already-default document must not clear its own flag on the way to setting
 * it.
 */
export function siblingsToUndefault(
  siblings: readonly DocumentLibraryItem[],
  currentId: number,
  regionTag: string,
): DocumentLibraryItem[] {
  return siblings.filter((s) => s.id !== currentId && s.isDefault && s.regionTag === regionTag);
}

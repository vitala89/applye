// A cover letter's editable content: the blocks, the body paragraphs, and the
// one rule that is easy to get wrong - keeping per-paragraph style overrides
// pointing at the right paragraph after one is removed.
//
// Split out of `cover-letter-detail.component.ts` alongside
// `CoverLetterContentStore`. Every function takes a content object and returns
// a new one; nothing reads a signal or touches the gateway.
//
// **The reindex is the reason this module exists.** It was thirteen lines
// inside a page class with no test, and its failure mode is silent: a style
// override stops belonging to the paragraph the user set it on, which nobody
// notices until a letter prints with the wrong paragraph in bold.

import type { CoverLetterAddress, CoverLetterContent, CvSectionStyle } from '@applye/core';

/** Style-override key for a body paragraph. Whole blocks are keyed by their
 * `CoverLetterBlockKey`; a paragraph is `body_<index>`, and inherits the `body`
 * block style before the document-wide one. */
export function paragraphStyleKey(index: number): string {
  return `body_${index}`;
}

/** Replaces one address field, leaving the rest of the address and the rest of
 * the letter alone. */
export function updateCoverLetterAddress(
  content: CoverLetterContent,
  field: keyof CoverLetterAddress,
  value: string,
): CoverLetterContent {
  return { ...content, address: { ...content.address, [field]: value } };
}

/** The plain text blocks the editor writes directly. `address`,
 * `bodyParagraphs`, `hashes`, `tone` and `length` are excluded because each has
 * its own shape or its own setter. */
export type CoverLetterTextField = keyof Omit<
  CoverLetterContent,
  'address' | 'bodyParagraphs' | 'hashes' | 'tone' | 'length'
>;

export function updateCoverLetterField(
  content: CoverLetterContent,
  field: CoverLetterTextField,
  value: string,
): CoverLetterContent {
  return { ...content, [field]: value };
}

/** Replaces one body paragraph. An index outside the list appends a hole-free
 * entry only if it is the next one; anything further would leave `undefined`
 * gaps, and the editor never produces such an index. */
export function updateCoverLetterParagraph(
  content: CoverLetterContent,
  index: number,
  value: string,
): CoverLetterContent {
  const bodyParagraphs = [...(content.bodyParagraphs || [])];
  bodyParagraphs[index] = value;
  return { ...content, bodyParagraphs };
}

export function addCoverLetterParagraph(content: CoverLetterContent): CoverLetterContent {
  return { ...content, bodyParagraphs: [...(content.bodyParagraphs || []), ''] };
}

export function removeCoverLetterParagraph(
  content: CoverLetterContent,
  index: number,
): CoverLetterContent {
  const bodyParagraphs = [...(content.bodyParagraphs || [])];
  bodyParagraphs.splice(index, 1);
  return { ...content, bodyParagraphs };
}

/**
 * After removing the paragraph at `removedAt`, shifts every `body_<i>` override
 * above it down one, so overrides keep pointing at the paragraph the user set
 * them on.
 *
 * `newLength` is the paragraph count **after** the removal. The loop runs to
 * `newLength` inclusive, because the highest key that can still exist is
 * `body_<newLength>` - the one belonging to the last paragraph before the
 * removal.
 *
 * **The destination is always already vacant**, which is why there is no
 * `else` clearing it. Before the first iteration `body_<removedAt>` has just
 * been deleted; and every iteration leaves `body_<i>` absent, either by moving
 * it down or because it was absent to begin with. So the next iteration's
 * destination, `body_<i>`, is empty by construction. The page carried an `else
 * delete` here for that case; mutation testing showed it could never fire, and
 * this invariant is the reason.
 *
 * Returns the section-style map, or `undefined` when there was none to begin
 * with - the caller leaves the style alone in that case.
 */
export function reindexParagraphStyleKeys(
  sectionStyles: Readonly<Record<string, CvSectionStyle>> | undefined,
  removedAt: number,
  newLength: number,
): Record<string, CvSectionStyle> | undefined {
  if (!sectionStyles) return undefined;
  const next: Record<string, CvSectionStyle> = { ...sectionStyles };
  delete next[paragraphStyleKey(removedAt)];
  for (let i = removedAt + 1; i <= newLength; i++) {
    const from = paragraphStyleKey(i);
    if (next[from]) {
      next[paragraphStyleKey(i - 1)] = next[from];
      delete next[from];
    }
  }
  return next;
}

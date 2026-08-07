// Building the row a CV save writes, and deciding which sibling rows a
// "default" flag has to displace.
//
// Split out of `cv-detail.component.ts` alongside `CvDocumentStore`. Both
// functions are pure: the store performs the writes, and these decide what the
// writes should contain, which is the part worth asserting on its own.

import type {
  CvSection,
  CvStyle,
  DocumentLibraryItem,
  UpsertDocumentLibraryItemInput,
} from '@applye/core';

/** The parts of a save that the editor owns. Everything else on the row is
 * carried over from the document as loaded. */
export interface CvSaveFields {
  label: string;
  sections: readonly CvSection[];
  style: CvStyle;
  themeId: number;
  regionTag: string;
  isDefault: boolean;
}

/**
 * The upsert input for a CV save: the editor's fields, with the rest of the row
 * carried over from `doc`.
 *
 * **`isApplicationDraft` is deliberately absent.** The field is optional on the
 * input precisely so the document editor can leave it alone - omitting it keeps
 * an apply-wizard draft a draft, so editing a CV from the wizard's "Review" step
 * never promotes the row into the Documents library early. Adding it here, even
 * as `doc.isApplicationDraft`, would look harmless and would still be a
 * behaviour change the first time the backend treats present-and-equal
 * differently from absent.
 */
export function buildCvUpsert(
  doc: DocumentLibraryItem,
  fields: CvSaveFields,
): UpsertDocumentLibraryItemInput {
  return {
    id: doc.id,
    docType: 'cv',
    source: doc.source,
    label: fields.label,
    contentJson: JSON.stringify({ sections: fields.sections }),
    templateId: doc.templateId,
    styleJson: JSON.stringify(fields.style),
    themeId: fields.themeId,
    regionTag: fields.regionTag,
    language: doc.language,
    archetypeTag: doc.archetypeTag,
    isDefault: fields.isDefault,
    inputHash: doc.inputHash,
    modelUsed: doc.modelUsed,
    tokensInput: doc.tokensInput,
    tokensOutput: doc.tokensOutput,
  };
}

/**
 * The sibling rows that must stop being the default, because this document is
 * claiming that flag.
 *
 * "Default" is per region, not per library: a default DE CV and a default US CV
 * coexist, so only siblings sharing this document's region are displaced. The
 * document itself is excluded by id - re-saving an already-default CV must not
 * clear its own flag on the way to setting it.
 */
export function cvSiblingsToUndefault(
  siblings: readonly DocumentLibraryItem[],
  currentId: number,
  regionTag: string,
): DocumentLibraryItem[] {
  return siblings.filter((s) => s.id !== currentId && s.isDefault && s.regionTag === regionTag);
}

// Building the row a cover-letter save writes.
//
// Split out of `cover-letter-detail.component.ts` alongside
// `CoverLetterDocumentStore`, exactly as `cv-document-record.ts` was split out
// of the CV page. Pure: the store performs the write, this decides what the
// write should contain, which is the part worth asserting on its own.

import type {
  CoverLetterContent,
  CoverLetterStyle,
  DocumentLibraryItem,
  UpsertDocumentLibraryItemInput,
} from '@applye/core';

/** The parts of a save that the letter editor owns. Everything else on the row
 * is carried over from the document as loaded. */
export interface CoverLetterSaveFields {
  label: string;
  content: CoverLetterContent;
  style: CoverLetterStyle;
  regionTag: string;
  isDefault: boolean;
}

/**
 * The upsert input for a cover-letter save: the editor's fields, with the rest
 * of the row carried over from `doc`.
 *
 * **`templateId` and `themeId` are deliberately absent**, and that is the
 * difference from `buildCvUpsert` rather than an omission. A cover letter has
 * no section template and no theme (ADR-0005, amendment twelve), so writing
 * either - even as `doc.themeId` - would persist a value the letter editor
 * cannot show or change.
 *
 * **`isApplicationDraft` is absent for the same reason it is on the CV
 * builder.** The field is optional on the input precisely so the document
 * editor can leave it alone: omitting it keeps an apply-wizard draft a draft,
 * so reviewing a letter from the wizard never promotes the row into the
 * Documents library early.
 */
export function buildCoverLetterUpsert(
  doc: DocumentLibraryItem,
  fields: CoverLetterSaveFields,
): UpsertDocumentLibraryItemInput {
  return {
    id: doc.id,
    docType: 'cover_letter',
    source: doc.source,
    label: fields.label,
    contentJson: JSON.stringify(fields.content),
    styleJson: JSON.stringify(fields.style),
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

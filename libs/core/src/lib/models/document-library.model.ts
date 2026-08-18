// The document library itself: what a stored row is, what an upsert takes, and
// the CV layout templates beside it. This is the file that knows both content
// kinds exist - `DocumentContent` is their union, and `docType` selects which.

import { SupportedLanguage } from '../types/common.types';
import { CvContent } from './cv-content.model';
import { CoverLetterContent } from './cover-letter-content.model';

/** Documents library (ROADMAP §16). One table backs both CV and cover-letter
 * documents; `docType` is free text (not a hard enum) so a future
 * `reference_letter` / `portfolio` type needs no schema migration. Distinct
 * from the broader `DocType` in `common.types.ts`, which also covers
 * `generated_docs` export-journal kinds like `pitch` / `interview_prep`. */
export type LibraryDocType = 'cv' | 'cover_letter';

export type DocumentSource = 'uploaded' | 'generated';

export type DocumentContent = CvContent | CoverLetterContent;

/** CV layout templates (ROADMAP §16.2) - layout only, separate from content.
 * Built-in presets: DE-traditional (photo), DE-ATS-modern (no photo), US, UK,
 * generic. */
export interface CvTemplate {
  id: number;
  name?: string;
  regionTag?: string;
  /** Ordered list of `CvSectionKey` values. */
  sectionsJson?: string;
  includePhoto: boolean;
  includeBirthdate: boolean;
  includeMaritalStatus: boolean;
  isBuiltin: boolean;
  createdAt?: string;
}

export interface UpsertCvTemplateInput {
  id?: number;
  name: string;
  regionTag?: string;
  sectionsJson: string;
  includePhoto: boolean;
  includeBirthdate: boolean;
  includeMaritalStatus: boolean;
}

/** The live, editable CV / Cover-Letter library - distinct from
 * `generated_docs`, which stays the export journal. `contentJson` is a
 * serialized `CvContent` or `CoverLetterContent` depending on `docType`. */
export interface DocumentLibraryItem {
  id: number;
  docType: LibraryDocType;
  source: DocumentSource;
  label?: string;
  contentJson?: string;
  filePath?: string;
  templateId?: number;
  /** Selected visual theme id (built-in: 1=Classic, 2=Aurora). Absent → Classic. */
  themeId?: number;
  styleJson?: string;
  regionTag?: string;
  language?: SupportedLanguage;
  archetypeTag?: string;
  isDefault: boolean;
  /** True while this row is an uncommitted apply-wizard draft: it is hidden
   * from every Documents library list until committed at Export & Apply. */
  isApplicationDraft: boolean;
  inputHash?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpsertDocumentLibraryItemInput {
  id?: number;
  docType: LibraryDocType;
  source: DocumentSource;
  label?: string;
  contentJson?: string;
  filePath?: string;
  templateId?: number;
  /** Selected visual theme id (built-in: 1=Classic, 2=Aurora). Absent → Classic. */
  themeId?: number;
  styleJson?: string;
  regionTag?: string;
  language?: SupportedLanguage;
  archetypeTag?: string;
  isDefault?: boolean;
  /** `true` marks a new/regenerated apply-wizard draft. Omit to leave an
   * existing row's draft flag untouched (the document editor saves without it,
   * so a Review edit never un-drafts the row). */
  isApplicationDraft?: boolean;
  inputHash?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
}

import { SupportedLanguage } from '../types/common.types';

/** Documents library (ROADMAP §16). One table backs both CV and cover-letter
 * documents; `docType` is free text (not a hard enum) so a future
 * `reference_letter` / `portfolio` type needs no schema migration. Distinct
 * from the broader `DocType` in `common.types.ts`, which also covers
 * `generated_docs` export-journal kinds like `pitch` / `interview_prep`. */
export type LibraryDocType = 'cv' | 'cover_letter';

export type DocumentSource = 'uploaded' | 'generated';

export type CvSectionKey =
  | 'photo'
  | 'personal_details'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages';

interface CvSectionBase {
  key: CvSectionKey;
  order: number;
  visible: boolean;
  /** Hash of the inputs used to last (re)generate this section's content —
   * lets "regenerate this section" skip a repeat AI call when nothing that
   * feeds it has changed. Absent on sections that were never AI-generated
   * (e.g. hand-edited or imported as-is). */
  sourceHash?: string;
}

export interface CvPhotoSection extends CvSectionBase {
  key: 'photo';
  filePath?: string;
}

export interface CvPersonalDetailsSection extends CvSectionBase {
  key: 'personal_details';
  fullName: string;
  email?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  maritalStatus?: string;
}

export interface CvSummarySection extends CvSectionBase {
  key: 'summary';
  text: string;
}

export interface CvExperienceEntry {
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  location?: string;
  bullets: string[];
}

export interface CvExperienceSection extends CvSectionBase {
  key: 'experience';
  entries: CvExperienceEntry[];
}

export interface CvEducationEntry {
  institution: string;
  degree: string;
  startDate: string;
  endDate?: string;
}

export interface CvEducationSection extends CvSectionBase {
  key: 'education';
  entries: CvEducationEntry[];
}

export interface CvSkillsSection extends CvSectionBase {
  key: 'skills';
  items: string[];
}

export interface CvLanguageEntry {
  language: string;
  level: string;
}

export interface CvLanguagesSection extends CvSectionBase {
  key: 'languages';
  items: CvLanguageEntry[];
}

export type CvSection =
  | CvPhotoSection
  | CvPersonalDetailsSection
  | CvSummarySection
  | CvExperienceSection
  | CvEducationSection
  | CvSkillsSection
  | CvLanguagesSection;

/** Typed shape of `document_library.content_json` when `docType === 'cv'`. */
export interface CvContent {
  sections: CvSection[];
}

export interface CoverLetterAddress {
  recipientName?: string;
  company?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

/** Typed shape of `document_library.content_json` when
 * `docType === 'cover_letter'`. Block order is fixed by market convention —
 * not user-reorderable (unlike CV sections). */
export interface CoverLetterContent {
  address: CoverLetterAddress;
  date: string;
  subject?: string;
  greeting: string;
  bodyParagraphs: string[];
  closing: string;
  signature: string;
}

export type DocumentContent = CvContent | CoverLetterContent;

/** CV layout templates (ROADMAP §16.2) — layout only, separate from content.
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

/** The live, editable CV / Cover-Letter library — distinct from
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
  styleJson?: string;
  regionTag?: string;
  language?: SupportedLanguage;
  archetypeTag?: string;
  isDefault: boolean;
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
  styleJson?: string;
  regionTag?: string;
  language?: SupportedLanguage;
  archetypeTag?: string;
  isDefault?: boolean;
  inputHash?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
}

/** Plain text extracted from an uploaded CV file (DOCX/PDF), ready for the
 * `cv-import` skill. Mirrors Rust `CvImportFile`. */
export interface CvImportFile {
  text: string;
  fileType: 'docx' | 'pdf';
  inputHash: string;
}

export interface CvParsedExperienceEntry {
  company: string;
  role: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  bullets: string[];
}

export interface CvParsedEducationEntry {
  institution: string;
  degree: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CvParsedLanguageEntry {
  language: string;
  level: string;
}

/** Shared output shape of both `cv-import.md` and `cv-generate-baseline.md`
 * — structure detection and market-baseline generation feed the same
 * `CvContent` builder. Any field is empty/null when that section wasn't
 * produced (e.g. a targeted per-section regenerate). */
export interface CvParsedContent {
  personalDetails: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  summary: string | null;
  experience: CvParsedExperienceEntry[];
  education: CvParsedEducationEntry[];
  skills: string[];
  languages: CvParsedLanguageEntry[];
  lowConfidenceNotes: string[];
}

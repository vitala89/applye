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
  /** Cropped photo as a JPEG data URI: `data:image/jpeg;base64,...`. */
  dataUri?: string;
  /** Legacy/unused; retained for back-compat with older documents. */
  filePath?: string;
}

export interface CvPersonalDetailsSection extends CvSectionBase {
  key: 'personal_details';
  fullName: string;
  title?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  linkedin?: string;
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

export interface CvSkillGroup {
  label: string;
  values: string[];
}

export interface CvSkillsSection extends CvSectionBase {
  key: 'skills';
  groups: CvSkillGroup[];
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
  jobDescription?: string;
  /** AI generation voice, e.g. "Formal" | "Friendly" | "Confident" |
   * "Enthusiastic". Persisted so the editor and Apply wizard keep the chosen
   * voice across reloads and regenerations. */
  tone?: CoverLetterTone;
  /** AI generation length target, e.g. "Concise" | "Standard" | "Detailed".
   * Maps to a body word budget (see `COVER_LETTER_LENGTH_TARGET`). */
  length?: CoverLetterLength;
  hashes?: {
    subject?: string;
    greeting?: string;
    bodyParagraphs?: string[];
    closing?: string;
    signature?: string;
  };
}

export type CoverLetterTone = 'Formal' | 'Friendly' | 'Confident' | 'Enthusiastic';
export type CoverLetterLength = 'Concise' | 'Standard' | 'Detailed';

/** Selectable AI voices for a cover letter (design: Cover Letter Editor.dc.html). */
export const COVER_LETTER_TONES: readonly CoverLetterTone[] = [
  'Formal',
  'Friendly',
  'Confident',
  'Enthusiastic',
];

/** Selectable AI length presets. */
export const COVER_LETTER_LENGTHS: readonly CoverLetterLength[] = [
  'Concise',
  'Standard',
  'Detailed',
];

export const COVER_LETTER_TONE_DEFAULT: CoverLetterTone = 'Formal';
export const COVER_LETTER_LENGTH_DEFAULT: CoverLetterLength = 'Standard';

/** Target body word budget per length preset — the low/high bounds drive both
 * the AI prompt guidance and the editor's word-count badge colour. Body-only
 * (paragraphs), excludes address/subject/greeting/closing/signature. */
export const COVER_LETTER_LENGTH_TARGET: Record<CoverLetterLength, { min: number; max: number }> = {
  Concise: { min: 120, max: 200 },
  Standard: { min: 200, max: 320 },
  Detailed: { min: 320, max: 450 },
};

/** Styleable cover-letter blocks — the fixed business-letter order. Body
 * paragraphs share one `body` key (they render as one styled block). */
export type CoverLetterBlockKey =
  | 'recipient'
  | 'date'
  | 'subject'
  | 'greeting'
  | 'body'
  | 'closing'
  | 'signature';

export const COVER_LETTER_BLOCK_KEYS: readonly CoverLetterBlockKey[] = [
  'recipient',
  'date',
  'subject',
  'greeting',
  'body',
  'closing',
  'signature',
];

export type PageSize = 'a4' | 'letter';
export type PageMarginPreset = 'narrow' | 'normal' | 'wide';

/** Page geometry for CV / cover-letter export + preview. Portrait only.
 * Stored inside `style_json`; absent resolves to A4 / normal margins. */
export interface PageSettings {
  size: PageSize;
  margin: PageMarginPreset;
}

export const PAGE_SETTINGS_DEFAULT: PageSettings = { size: 'a4', margin: 'normal' };

/** Cover letter style choices — mirrors the CV `CvStyle` shape (same field
 * names so the deterministic Rust `check_style_safety` command validates it
 * unchanged, including per-block overrides), but preview-only: export renders
 * style-agnostic markdown just like the CV library export. */
export interface CoverLetterStyle {
  fontFamily: string;
  fontSizePt: number;
  accentColorHex: string;
  fontWeight: CvFontWeight;
  /** Per-block and per-paragraph overrides; any unset field inherits its
   * parent. Keys are a `CoverLetterBlockKey` for whole blocks, or `body_<i>`
   * for an individual body paragraph (which inherits the `body` block style,
   * then the document-wide style). */
  sectionStyles?: Record<string, CvSectionStyle>;
  /** Page geometry (size + margin preset); absent → A4 / normal. */
  page?: PageSettings;
}

export const COVER_LETTER_STYLE_DEFAULT: CoverLetterStyle = {
  fontFamily: 'Calibri',
  fontSizePt: 11,
  accentColorHex: '#333333',
  fontWeight: 400,
  page: PAGE_SETTINGS_DEFAULT,
};

export type DocumentContent = CvContent | CoverLetterContent;

export type CvFontWeight = 300 | 400 | 600 | 700; // Light / Normal / Semibold / Bold

export interface CvSectionStyle {
  fontFamily?: string;
  fontSizePt?: number;
  colorHex?: string;
  fontWeight?: CvFontWeight;
}

/** CV style choices (ROADMAP §16.5) — typed shape of `document_library.style_json`.
 * Deliberately small: font, size, one accent colour. Layout/order lives in
 * `CvTemplate` instead. Safe default: Calibri 11pt, dark-grey (#333333). */
export interface CvStyle {
  fontFamily: string;
  fontSizePt: number;
  accentColorHex: string;
  fontWeight: CvFontWeight;
  sectionStyles?: Partial<Record<CvSectionKey, CvSectionStyle>>;
  /** Page geometry (size + margin preset); absent → A4 / normal. */
  page?: PageSettings;
}

export const CV_STYLE_DEFAULT: CvStyle = {
  fontFamily: 'Calibri',
  fontSizePt: 11,
  accentColorHex: '#333333',
  fontWeight: 400,
  page: PAGE_SETTINGS_DEFAULT,
};

/** Curated ATS-safe font list (ROADMAP §16.5), mirrors the Rust
 * `ATS_SAFE_FONTS` constant — for populating a suggestions list in the UI,
 * not for client-side validation (that's `check_style_safety`). */
export const CV_ATS_SAFE_FONTS = [
  'Arial',
  'Calibri',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Lato',
  'Open Sans',
  'Verdana',
  'Tahoma',
  'Garamond',
];

/** One ATS/readability note from `check_style_safety` — `kind` selects the
 * (translated) message; `detail` is the value to interpolate. */
export type StyleNoteKind =
  | 'font_ats_risk'
  | 'size_out_of_range'
  | 'color_readability_risk'
  | 'weight_unavailable_risk';

export interface StyleNote {
  kind: StyleNoteKind;
  detail: string;
}

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
    title: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    website: string | null;
    linkedin: string | null;
  };
  summary: string | null;
  experience: CvParsedExperienceEntry[];
  education: CvParsedEducationEntry[];
  skills: string[];
  skillGroups?: CvSkillGroup[];
  languages: CvParsedLanguageEntry[];
  lowConfidenceNotes: string[];
}

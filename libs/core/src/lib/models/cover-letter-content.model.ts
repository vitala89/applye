// The cover-letter content model: the letter's blocks, its fixed block order,
// and the tone/length presets the AI writer offers - plus the style choices
// that mirror `CvStyle`'s shape for the letter.

import { CvFontWeight, CvSectionStyle } from './cv-style.model';
import { PAGE_SETTINGS_DEFAULT, PageSettings } from './page-settings.model';

export interface CoverLetterAddress {
  recipientName?: string;
  company?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

/** Typed shape of `document_library.content_json` when
 * `docType === 'cover_letter'`. Block order is fixed by market convention -
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
  /** Earliest possible start date, as the user words it ("ab sofort",
   * "01.10.2026"). German postings routinely require it
   * (frühestmöglicher Eintrittstermin) and filter letters that omit it. */
  earliestStart?: string;
  /** Salary expectation, as the user words it ("75.000 EUR brutto/Jahr").
   * The German Gehaltsvorstellung, likewise routinely required. */
  salaryExpectation?: string;
  /** Notice period at the current employer ("3 Monate zum Quartalsende").
   * Only stated when it actually constrains the start date. */
  noticePeriod?: string;
  /** Enclosure line under the signature ("Lebenslauf, Zeugnisse"). A German
   * application is a Bewerbungsmappe, and DIN 5008 closes the letter with an
   * `Anlagen` line naming what travels with it. Free text; empty renders
   * nothing at all. */
  attachments?: string;
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

/** Target body word budget per length preset - the low/high bounds drive both
 * the AI prompt guidance and the editor's word-count badge colour. Body-only
 * (paragraphs), excludes address/subject/greeting/closing/signature. */
export const COVER_LETTER_LENGTH_TARGET: Record<CoverLetterLength, { min: number; max: number }> = {
  Concise: { min: 120, max: 200 },
  Standard: { min: 200, max: 320 },
  Detailed: { min: 320, max: 450 },
};

/** Styleable cover-letter blocks - the fixed business-letter order. Body
 * paragraphs share one `body` key (they render as one styled block). */
export type CoverLetterBlockKey =
  'recipient' | 'date' | 'subject' | 'greeting' | 'body' | 'closing' | 'signature';

export const COVER_LETTER_BLOCK_KEYS: readonly CoverLetterBlockKey[] = [
  'recipient',
  'date',
  'subject',
  'greeting',
  'body',
  'closing',
  'signature',
];

/** Cover letter style choices - mirrors the CV `CvStyle` shape (same field
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

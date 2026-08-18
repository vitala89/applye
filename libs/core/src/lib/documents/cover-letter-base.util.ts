import {
  COVER_LETTER_LENGTH_DEFAULT,
  COVER_LETTER_TONE_DEFAULT,
  CoverLetterAddress,
  CoverLetterContent,
  CoverLetterLength,
  CoverLetterTone,
} from '../models/cover-letter-content.model';
import { DocumentLibraryItem } from '../models/document-library.model';
import { sanitizeSignature } from '../text/signature';

/**
 * The parts of the base letter a tailored copy inherits. Everything except the
 * body paragraphs survives untouched, because the AI is asked to rewrite the
 * argument, not the addressing.
 */
export interface BaseLetter {
  paragraphs: string[];
  address: CoverLetterAddress;
  subject: string;
  greeting: string;
  closing: string;
  signature: string;
  regionTag: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  /** Availability and salary belong to the applicant, not to one letter, so
   * they carry over from the base letter into every tailored copy. */
  earliestStart: string;
  salaryExpectation: string;
  noticePeriod: string;
}

export function emptyBaseLetter(): BaseLetter {
  return {
    paragraphs: [],
    address: {},
    subject: '',
    greeting: '',
    closing: '',
    signature: '',
    regionTag: 'generic',
    tone: COVER_LETTER_TONE_DEFAULT,
    length: COVER_LETTER_LENGTH_DEFAULT,
    earliestStart: '',
    salaryExpectation: '',
    noticePeriod: '',
  };
}

/**
 * Reads a library row into the fields a tailored copy inherits. Pure, and
 * total: an unparseable or absent row yields the defaults rather than throwing,
 * which is what turns the flow into a from-scratch generation instead of an
 * error.
 */
export function readBaseLetter(doc: DocumentLibraryItem | undefined): BaseLetter {
  const base = emptyBaseLetter();
  if (!doc?.contentJson) return base;
  let content: CoverLetterContent;
  try {
    content = JSON.parse(doc.contentJson) as CoverLetterContent;
  } catch {
    return base;
  }
  return {
    paragraphs: content.bodyParagraphs || [],
    address: content.address || {},
    subject: content.subject || '',
    greeting: content.greeting || '',
    closing: content.closing || '',
    signature: content.signature || '',
    regionTag: doc.regionTag || 'generic',
    tone: content.tone ?? base.tone,
    length: content.length ?? base.length,
    earliestStart: content.earliestStart ?? '',
    salaryExpectation: content.salaryExpectation ?? '',
    noticePeriod: content.noticePeriod ?? '',
  };
}

/**
 * Assembles the row that gets persisted. Pure, and takes `today` rather than
 * reading the clock, so the shape can be asserted in a test.
 */
export function buildTailoredContent(
  base: BaseLetter,
  paragraphs: string[],
  jdText: string,
  today: string,
): CoverLetterContent {
  return {
    address: base.address,
    date: today,
    subject: base.subject,
    greeting: base.greeting,
    bodyParagraphs: paragraphs,
    closing: base.closing,
    // The signature is the sender's name only. The AI is prompted never to
    // append contact detail, but does not obey reliably, so strip any
    // phone / email / URL deterministically before persisting.
    signature: sanitizeSignature(base.signature),
    jobDescription: jdText,
    tone: base.tone,
    length: base.length,
    earliestStart: base.earliestStart,
    salaryExpectation: base.salaryExpectation,
    noticePeriod: base.noticePeriod,
  };
}

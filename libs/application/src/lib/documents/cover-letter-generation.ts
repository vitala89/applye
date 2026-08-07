// The pure parts of generating a cover letter from the profile.
//
// Split out of `cover-letter-detail.component.ts` alongside `CoverLetterAiStore`,
// as `cv-regeneration.ts` was split out of the CV page. What is here decides
// what the model is asked and what is done with its answer; the store performs
// the calls.

import type {
  CoverLetterContent,
  CoverLetterLength,
  CoverLetterTone,
  SupportedLanguage,
} from '@applye/core';
import { sanitizeSignature } from '@applye/core';

/** The skill both paths render. */
export const COVER_LETTER_SKILL = 'cover-letter-generate';

/** The `section` argument the skill gets for a full-letter draft. */
export const COVER_LETTER_SECTION_ALL = 'all';

/** What a posting is called when the user has pasted no job description. Sent to
 * the model verbatim, and folded into the cache hash, so it must be stable. */
export const COVER_LETTER_GENERIC_JD = 'General job application';

/** The availability answers German postings require, in the shape the skill
 * takes them. Produced by `CoverLetterContentStore.applicationDetails`. */
export interface CoverLetterApplicationDetails {
  earliest_start: string;
  salary_expectation: string;
  notice_period: string;
}

/**
 * Raised when the profile has no markdown to generate from. A typed error rather
 * than a message, because the application layer does not build user-facing
 * strings (ADR-0005, amendment three) - the page catches this and chooses the
 * wording, which is how the existing translated message survives the move.
 */
export class CoverLetterNoProfileError extends Error {
  constructor() {
    super('cover letter generation: the profile has no markdown');
    this.name = 'CoverLetterNoProfileError';
  }
}

/** The `section` a regeneration asks for: a body paragraph is addressed by
 * position, every other block by its own key. */
export function coverLetterSectionName(blockKey: string, index?: number): string {
  return index !== undefined ? `body_${index}` : blockKey;
}

/** The job description the model is given: what the user pasted, or the generic
 * stand-in. Empty string counts as absent, which is why this is `||`. */
export function coverLetterJobDescription(jobDescription: string | undefined): string {
  return jobDescription || COVER_LETTER_GENERIC_JD;
}

/**
 * The string a block's cache hash is computed from.
 *
 * **Tone, length and the three availability answers are part of the input
 * identity**, not decoration: changing any of them changes what the model is
 * asked, so an unchanged hash would otherwise skip a call whose answer would
 * genuinely differ.
 */
export function coverLetterHashInput(
  profileMd: string,
  jobDescription: string,
  language: string,
  sectionName: string,
  tone: CoverLetterTone,
  length: CoverLetterLength,
  details: CoverLetterApplicationDetails,
): string {
  return [
    profileMd,
    jobDescription,
    language,
    sectionName,
    tone,
    length,
    details.earliest_start,
    details.salary_expectation,
    details.notice_period,
  ].join('|');
}

/** The language a generated letter is written in: the document's own, else the
 * user's default, else English. Same rule as `resolveDocLanguage` for CVs, kept
 * separate only because that one is named for the CV path. */
export function resolveLetterLanguage(
  docLanguage: SupportedLanguage | undefined,
  settingsDefault: SupportedLanguage | undefined,
): SupportedLanguage {
  return docLanguage ?? settingsDefault ?? 'en';
}

/** The hash currently stored for a block, or `undefined` if it has never been
 * generated. Body paragraphs are held in a positional array, every other block
 * under its own key. */
export function currentBlockHash(
  hashes: CoverLetterContent['hashes'],
  blockKey: string,
  index?: number,
): string | undefined {
  const current = hashes || {};
  return index !== undefined
    ? (current.bodyParagraphs || [])[index]
    : (current as Record<string, string | undefined>)[blockKey];
}

/**
 * The letter after a full AI draft.
 *
 * **The user's own answers survive it.** Tone, length, the three availability
 * fields and the pasted job description are choices, not generated text, so they
 * are carried over from `prev` rather than taken from the model - a draft that
 * silently changed the tone the user picked would be a draft that ignored them.
 *
 * **Every per-block hash is dropped**, because each block has just been
 * rewritten and the old hashes would report them as up to date.
 *
 * `date` is the one field merged with `||` rather than `??`: the model returns
 * `''` when it has no date to offer, and an empty string must not blank a date
 * the letter already carries.
 */
export function applyCoverLetterDraft(
  prev: CoverLetterContent,
  parsed: Partial<CoverLetterContent>,
): CoverLetterContent {
  return {
    ...prev,
    address: parsed.address ?? {},
    date: parsed.date || prev.date,
    subject: parsed.subject ?? '',
    greeting: parsed.greeting ?? '',
    bodyParagraphs: parsed.bodyParagraphs ?? [],
    closing: parsed.closing ?? '',
    signature: parsed.signature ?? '',
    tone: prev.tone,
    length: prev.length,
    earliestStart: prev.earliestStart,
    salaryExpectation: prev.salaryExpectation,
    noticePeriod: prev.noticePeriod,
    jobDescription: prev.jobDescription,
    hashes: {},
  };
}

/**
 * The letter after one regenerated block, with that block's cache hash written
 * alongside it.
 *
 * An unrecognized `blockKey` returns the content unchanged rather than throwing:
 * the caller has already paid for the model call, and the blocks that can be
 * regenerated are fixed by the template.
 *
 * **A body paragraph the model did not return leaves the existing text in
 * place**, but still records the hash - the call happened with these inputs, and
 * repeating it would produce the same empty answer.
 */
export function applyCoverLetterBlock(
  content: CoverLetterContent,
  blockKey: string,
  index: number | undefined,
  parsed: Partial<CoverLetterContent>,
  sourceHash: string,
): CoverLetterContent {
  const next: CoverLetterContent = { ...content, hashes: { ...(content.hashes || {}) } };
  const hashes = next.hashes as NonNullable<CoverLetterContent['hashes']>;

  if (blockKey === 'subject') {
    next.subject = parsed.subject || '';
    hashes.subject = sourceHash;
  } else if (blockKey === 'greeting') {
    next.greeting = parsed.greeting || '';
    hashes.greeting = sourceHash;
  } else if (blockKey === 'closing') {
    next.closing = parsed.closing || '';
    hashes.closing = sourceHash;
  } else if (blockKey === 'signature') {
    next.signature = sanitizeSignature(parsed.signature);
    hashes.signature = sourceHash;
  } else if (blockKey === 'body' && index !== undefined) {
    const paragraphs = [...(next.bodyParagraphs || [])];
    if (parsed.bodyParagraphs && parsed.bodyParagraphs[index]) {
      paragraphs[index] = parsed.bodyParagraphs[index];
    }
    next.bodyParagraphs = paragraphs;
    hashes.bodyParagraphs = [...(hashes.bodyParagraphs || [])];
    hashes.bodyParagraphs[index] = sourceHash;
  }

  return next;
}

import { Injectable, computed, signal } from '@angular/core';
import type {
  CoverLetterAddress,
  CoverLetterContent,
  CoverLetterLength,
  CoverLetterTone,
} from '@applye/core';
import {
  COVER_LETTER_LENGTH_DEFAULT,
  COVER_LETTER_TONE_DEFAULT,
  emptyCoverLetterContent,
} from '@applye/core';
import { bodyLengthStatus, countBodyWords } from './cover-letter-length';
import {
  CoverLetterTextField,
  addCoverLetterParagraph,
  removeCoverLetterParagraph,
  updateCoverLetterAddress,
  updateCoverLetterField,
  updateCoverLetterParagraph,
} from './cover-letter-content';

/**
 * The letter itself: its blocks, its body paragraphs, and the application
 * answers that travel with them.
 *
 * **It touches no gateway at all** - the row it belongs to is loaded and saved
 * by `CoverLetterDocumentStore`, and the AI that fills it is a third store.
 * This one owns the text and the rules for editing it, which is what makes the
 * paragraph handling testable without a document or a network call.
 *
 * Component-scoped.
 */
@Injectable()
export class CoverLetterContentStore {
  readonly content = signal<CoverLetterContent>(emptyCoverLetterContent());

  /** AI voice and length target, read straight off the persisted content. */
  readonly tone = computed<CoverLetterTone>(() => this.content().tone ?? COVER_LETTER_TONE_DEFAULT);
  readonly length = computed<CoverLetterLength>(
    () => this.content().length ?? COVER_LETTER_LENGTH_DEFAULT,
  );

  /** Availability and salary. German postings routinely require the first two;
   * all three are free text, because "ab sofort" and "01.10.2026" are equally
   * valid answers. */
  readonly earliestStart = computed(() => this.content().earliestStart ?? '');
  readonly salaryExpectation = computed(() => this.content().salaryExpectation ?? '');
  readonly noticePeriod = computed(() => this.content().noticePeriod ?? '');

  /** DIN 5008 enclosure line ("Anlagen"), listing what travels with the letter. */
  readonly attachments = computed(() => this.content().attachments ?? '');

  /** Live body word count - paragraphs only, because the target is a body
   * budget rather than a whole-letter one. */
  readonly wordCount = computed(() => countBodyWords(this.content().bodyParagraphs));
  readonly wordStatus = computed(() => bodyLengthStatus(this.wordCount(), this.length()));

  /**
   * Takes the letter off a freshly loaded document. An absent `contentJson`
   * means the row exists but nothing has been written into it, so it opens an
   * empty letter.
   *
   * **Throws on malformed JSON**, exactly as `CvStyleStore.hydrate` does: the
   * caller's `load` already reports a document it cannot read, and swallowing
   * the error here would show the user an empty editor over a letter that is
   * still on disk - one Save away from being replaced by nothing.
   *
   * Tone and length are defaulted **after** parsing, so a letter saved before
   * those fields existed opens on the defaults rather than on `undefined`.
   */
  hydrate(contentJson: string | null | undefined): void {
    if (!contentJson) {
      this.content.set(emptyCoverLetterContent());
      return;
    }
    const parsed = JSON.parse(contentJson) as CoverLetterContent;
    parsed.tone ??= COVER_LETTER_TONE_DEFAULT;
    parsed.length ??= COVER_LETTER_LENGTH_DEFAULT;
    this.content.set(parsed);
  }

  /** Replaces the whole letter - the sink for an AI draft or a regenerated
   * block, both of which rebuild the content rather than patching a field. */
  set(content: CoverLetterContent): void {
    this.content.set(content);
  }

  setTone(tone: CoverLetterTone): void {
    this.content.update((c) => ({ ...c, tone }));
  }

  setLength(length: CoverLetterLength): void {
    this.content.update((c) => ({ ...c, length }));
  }

  updateAddress(field: keyof CoverLetterAddress, value: string): void {
    this.content.update((c) => updateCoverLetterAddress(c, field, value));
  }

  updateField(field: CoverLetterTextField, value: string): void {
    this.content.update((c) => updateCoverLetterField(c, field, value));
  }

  updateParagraph(index: number, value: string): void {
    this.content.update((c) => updateCoverLetterParagraph(c, index, value));
  }

  addParagraph(): void {
    this.content.update((c) => addCoverLetterParagraph(c));
  }

  /**
   * Removes one body paragraph and returns **how many are left**, because the
   * caller has to reindex the `body_<i>` style overrides above it and needs the
   * new length to do so. The style itself belongs to another store, so this one
   * reports rather than reaches.
   */
  removeParagraph(index: number): number {
    this.content.update((c) => removeCoverLetterParagraph(c, index));
    return this.content().bodyParagraphs.length;
  }

  /** The three availability answers as the AI skill takes them. One place, so
   * the draft call, the per-block call and the cache hash cannot drift apart. */
  applicationDetails(): {
    earliest_start: string;
    salary_expectation: string;
    notice_period: string;
  } {
    return {
      earliest_start: this.earliestStart(),
      salary_expectation: this.salaryExpectation(),
      notice_period: this.noticePeriod(),
    };
  }
}

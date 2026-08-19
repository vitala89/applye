import { Injectable, inject, signal } from '@angular/core';
import {
  COVER_LETTER_LENGTH_DEFAULT,
  COVER_LETTER_STYLE_DEFAULT,
  COVER_LETTER_TONE_DEFAULT,
  type CoverLetterContent,
  type CoverLetterStyle,
} from '@applye/core';
import { DocumentsGateway } from '@applye/data';

/**
 * What the hidden print window renders for a cover letter, and the one call
 * that tells Rust the snapshot may be taken.
 *
 * The export IS the editor's render, so this parses and merges exactly as
 * `CoverLetterContentStore` does - byte-identical inputs or the PDF drifts from
 * the preview (ADR-0005, amendment twenty-seven).
 *
 * **The settle sequence is not here.** Waiting for `document.fonts` and marking
 * `document.body` printable is view timing, and this layer does not touch the
 * DOM; the app owns that and calls `notifyReady` when it is done.
 */
@Injectable()
export class CoverLetterPrintStore {
  private readonly db = inject(DocumentsGateway);

  readonly loaded = signal(false);
  readonly content = signal<CoverLetterContent>({
    address: {},
    date: '',
    subject: '',
    greeting: '',
    bodyParagraphs: [],
    closing: '',
    signature: '',
    tone: COVER_LETTER_TONE_DEFAULT,
    length: COVER_LETTER_LENGTH_DEFAULT,
  });
  readonly style = signal<CoverLetterStyle>({ ...COVER_LETTER_STYLE_DEFAULT });
  /** Drives the German date convention in the shared render; the export must be
   * fed the same language the editor shows or the two drift. */
  readonly language = signal('en');

  /**
   * Returns `false` when the row is missing, leaving `loaded` false and the
   * window blank - the Rust side times out and reports the failure, which is
   * the behaviour the component had.
   */
  async load(id: number): Promise<boolean> {
    const item = await this.db.documentLibraryGet(id);
    if (!item) return false;

    if (item.contentJson) {
      const parsed: CoverLetterContent = JSON.parse(item.contentJson);
      parsed.tone ??= COVER_LETTER_TONE_DEFAULT;
      parsed.length ??= COVER_LETTER_LENGTH_DEFAULT;
      this.content.set(parsed);
    }
    this.language.set(item.language ?? 'en');
    this.style.set(
      item.styleJson
        ? { ...COVER_LETTER_STYLE_DEFAULT, ...JSON.parse(item.styleJson) }
        : { ...COVER_LETTER_STYLE_DEFAULT },
    );
    this.loaded.set(true);
    return true;
  }

  notifyReady(): Promise<void> {
    return this.db.printWindowReady();
  }
}

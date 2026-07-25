import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  COVER_LETTER_STYLE_DEFAULT,
  CoverLetterContent,
  CoverLetterStyle,
  COVER_LETTER_TONE_DEFAULT,
  COVER_LETTER_LENGTH_DEFAULT,
} from '@applye/core';
import { DbService } from '@applye/data';
import { CoverLetterPreviewComponent } from '../cover-letter-preview/cover-letter-preview.component';

/**
 * Print-only cover letter route (`print/cover-letter/:id`), loaded by a HIDDEN
 * Tauri window during the silent WYSIWYG PDF export
 * (`cover_letter_document_export_pdf_wysiwyg`). Renders the same
 * `<app-cover-letter-preview>` as the editor - the export therefore IS the
 * editor's render - then signals readiness to Rust once fonts are loaded and
 * the paginated sheet has settled, so the native print snapshot never captures
 * a half-rendered document. Mirrors `CvPrintComponent`.
 */
@Component({
  selector: 'app-cover-letter-print',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoverLetterPreviewComponent],
  template: `
    @if (loaded()) {
      <app-cover-letter-preview [content]="content()" [style]="style()" [language]="language()" />
    }
  `,
})
export class CoverLetterPrintComponent {
  private readonly db = inject(DbService);
  private readonly route = inject(ActivatedRoute);

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
  /** Drives the German date convention in the shared render; the export must
   * be fed the same language the editor shows or the two drift. */
  readonly language = signal('en');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const item = await this.db.documentLibraryGet(id);
    if (!item) return; // Rust side times out and reports the failure.

    // Same parse/merge as the editor's `load()` - the render must be fed
    // byte-identical inputs or the export drifts from the preview.
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

    await this.signalReady();
  }

  /** Wait for fonts + the measure/paginate pass, then flag the DOM printable
   * and tell Rust to run the print. Uses plain timeouts (never `requestAnimation
   * Frame`, which an off-screen window may throttle) with a hard cap so this can
   * never hang the export. */
  private async signalReady(): Promise<void> {
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | void> =>
      Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
    if (document.fonts) {
      await withTimeout(document.fonts.ready, 3000);
    }
    // Two settle ticks for the paginated sheet's ResizeObserver measure pass.
    await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 250));
    document.body.classList.add('printing-cv');
    await new Promise((r) => setTimeout(r, 50));
    await this.db.printWindowReady();
  }
}

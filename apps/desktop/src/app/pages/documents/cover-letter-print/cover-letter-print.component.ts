import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CoverLetterPrintStore } from '@applye/application';
import { CoverLetterPreviewComponent } from '../cover-letter-preview/cover-letter-preview.component';
import { awaitPrintSettle } from '../print-settle.util';

/**
 * Print-only cover letter route (`print/cover-letter/:id`), loaded by a HIDDEN
 * Tauri window during the silent WYSIWYG PDF export
 * (`cover_letter_document_export_pdf_wysiwyg`). Renders the same
 * `<app-cover-letter-preview>` as the editor - the export therefore IS the
 * editor's render - then signals readiness to Rust once fonts are loaded and
 * the paginated sheet has settled, so the native print snapshot never captures
 * a half-rendered document. Mirrors `CvPrintComponent`.
 *
 * What it does is now the whole of it: read the id, ask the store to load,
 * wait for the DOM to settle, tell Rust. The document's state is
 * `CoverLetterPrintStore`'s and the settle is shared with the CV route
 * (ADR-0005, amendment twenty-seven).
 */
@Component({
  selector: 'app-cover-letter-print',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoverLetterPreviewComponent],
  providers: [CoverLetterPrintStore],
  template: `
    @if (letter.loaded()) {
      <app-cover-letter-preview
        [content]="letter.content()"
        [style]="letter.style()"
        [language]="letter.language()"
      />
    }
  `,
})
export class CoverLetterPrintComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly letter = inject(CoverLetterPrintStore);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    // A missing row leaves the window blank on purpose: the Rust side times out
    // and reports the failure, which is better than printing half a document.
    if (!(await this.letter.load(id))) return;

    await awaitPrintSettle();
    await this.letter.notifyReady();
  }
}

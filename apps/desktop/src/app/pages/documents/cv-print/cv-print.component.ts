import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CvPrintStore } from '@applye/application';
import { CvPreviewComponent } from '../cv-detail/cv-preview/cv-preview.component';

import { awaitPrintSettle } from '../print-settle.util';

import { normalizeCvContent } from '@applye/core';

/**
 * Print-only CV route (`print/cv/:id`), loaded by a HIDDEN Tauri window during
 * the silent WYSIWYG PDF export (`cv_document_export_pdf_wysiwyg`). Renders the
 * same `<app-cv-preview>` as the editor - the export therefore IS the editor's
 * render - then signals readiness to Rust once fonts are loaded and the
 * paginated sheet has settled, so the native print snapshot never captures a
 * half-rendered document.
 *
 * `normalizeCvContent` is passed in rather than imported by the store, the same
 * way `cv-detail` passes it to `CvDocumentStore`: it is app-local and
 * `libs/application` may not depend on the app.
 */
@Component({
  selector: 'app-cv-print',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CvPreviewComponent],
  providers: [CvPrintStore],
  template: `
    @if (cv.loaded()) {
      <app-cv-preview
        [sections]="cv.sections()"
        [style]="cv.style()"
        [themeId]="cv.themeId()"
        [includePhoto]="cv.includePhoto()"
        [photoDataUri]="cv.photoDataUri()"
        [photoPlacement]="cv.photoPlacement()"
        [includeBirthdate]="cv.includeBirthdate()"
        [includeMaritalStatus]="cv.includeMaritalStatus()"
      />
    }
  `,
})
export class CvPrintComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly cv = inject(CvPrintStore);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    // A missing row leaves the window blank on purpose: the Rust side times out
    // and reports the failure, which is better than printing half a document.
    if (!(await this.cv.load(id, normalizeCvContent))) return;

    await awaitPrintSettle();
    await this.cv.notifyReady();
  }
}

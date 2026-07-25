import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CV_STYLE_DEFAULT,
  CvContent,
  CvSection,
  CvStyle,
  PhotoPlacement,
  getBuiltinTheme,
  themeStyleSeed,
} from '@applye/core';
import { DbService } from '@applye/data';
import { CvPreviewComponent } from '../cv-detail/cv-preview/cv-preview.component';
import { normalizeCvContent } from '../cv-content.util';

/**
 * Print-only CV route (`print/cv/:id`), loaded by a HIDDEN Tauri window during
 * the silent WYSIWYG PDF export (`cv_document_export_pdf_wysiwyg`). Renders the
 * same `<app-cv-preview>` as the editor - the export therefore IS the editor's
 * render - then signals readiness to Rust once fonts are loaded and the
 * paginated sheet has settled, so the native print snapshot never captures a
 * half-rendered document.
 */
@Component({
  selector: 'app-cv-print',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CvPreviewComponent],
  template: `
    @if (loaded()) {
      <app-cv-preview
        [sections]="sections()"
        [style]="style()"
        [themeId]="themeId()"
        [includePhoto]="includePhoto()"
        [photoDataUri]="photoDataUri()"
        [photoPlacement]="photoPlacement()"
        [includeBirthdate]="includeBirthdate()"
        [includeMaritalStatus]="includeMaritalStatus()"
      />
    }
  `,
})
export class CvPrintComponent {
  private readonly db = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly loaded = signal(false);
  readonly sections = signal<CvSection[]>([]);
  readonly style = signal<CvStyle>(CV_STYLE_DEFAULT);
  readonly themeId = signal(1);
  readonly includePhoto = signal(false);
  readonly photoDataUri = signal<string | null>(null);
  readonly photoPlacement = signal<PhotoPlacement>('above_left');
  readonly includeBirthdate = signal(false);
  readonly includeMaritalStatus = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const item = await this.db.documentLibraryGet(id);
    if (!item) return; // Rust side times out and reports the failure.

    const raw: CvContent = item.contentJson ? JSON.parse(item.contentJson) : { sections: [] };
    const ordered = [...normalizeCvContent(raw).sections].sort((a, b) => a.order - b.order);
    this.sections.set(ordered);

    const photo = ordered.find((s) => s.key === 'photo') as
      | Extract<CvSection, { key: 'photo' }>
      | undefined;
    this.includePhoto.set(photo?.visible ?? false);
    this.photoDataUri.set(photo?.dataUri ?? null);
    this.photoPlacement.set(photo?.placement ?? 'above_left');
    const personal = ordered.find(
      (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
    );
    this.includeBirthdate.set(!!personal?.birthDate);
    this.includeMaritalStatus.set(!!personal?.maritalStatus);

    const themeId = item.themeId ?? 1;
    this.themeId.set(themeId);
    const seed = themeStyleSeed(getBuiltinTheme(themeId));
    this.style.set(
      item.styleJson
        ? { ...CV_STYLE_DEFAULT, ...seed, ...JSON.parse(item.styleJson) }
        : { ...CV_STYLE_DEFAULT, ...seed },
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

import { Injectable, inject, signal } from '@angular/core';
import { DbService, SystemGateway } from '@applye/data';
import { DocumentLibraryItem } from '@applye/core';
import { exportFileName } from './export-filename';
import { TranslateService } from '@applye/i18n';
import { ReviewDocumentKind } from './document-gen.service';

export type ExportFormat = 'docx' | 'pdf';

export interface LastExport {
  filePath: string;
  format: ExportFormat;
}

/**
 * Exporting the wizard's linked CV and cover letter to disk, hoisted out of the
 * jobs page component.
 *
 * `exporting` holds a `kind-format` key rather than a boolean so the template
 * can put the spinner on the one button that was pressed while disabling the
 * rest.
 *
 * PDF goes through the silent WYSIWYG engine (a hidden window prints the
 * editor's own preview), which is what keeps the file pixel-identical to the
 * editor in every theme. DOCX goes through the plain export command.
 */
@Injectable()
export class DocumentExportService {
  private readonly db = inject(DbService);
  private readonly system = inject(SystemGateway);
  private readonly i18n = inject(TranslateService);

  private readonly t = this.i18n.t;

  /** `${kind}-${format}` while that export runs, `false` otherwise. */
  readonly exporting = signal<string | false>(false);
  readonly status = signal('');
  readonly error = signal(false);
  readonly lastExport = signal<LastExport | null>(null);

  /** Clears the status line and the last-exported file, leaving any in-flight
   * export alone - callers use this when the wizard moves off the export step. */
  resetStatus(): void {
    this.status.set('');
    this.error.set(false);
    this.lastExport.set(null);
  }

  /**
   * Prompts for a path, writes the file, then hands back to `onExported` so the
   * caller can commit the document. That commit runs inside this method's
   * try/catch on purpose: it is the last step of one user action, and a failure
   * there has always been reported on the same status line.
   */
  async run(
    kind: ReviewDocumentKind,
    format: ExportFormat,
    item: DocumentLibraryItem | null,
    onExported: (kind: ReviewDocumentKind) => Promise<void>,
  ): Promise<void> {
    if (!item) {
      this.status.set(
        kind === 'cv'
          ? this.t()('jobs.wizard.export_missing_cv_warning')
          : this.t()('jobs.wizard.export_missing_cover_letter_warning'),
      );
      this.error.set(true);
      return;
    }

    this.exporting.set(`${kind}-${format}`);
    this.status.set('');
    this.error.set(false);
    this.lastExport.set(null);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({ defaultPath: this.filename(item, format) });
      if (!filePath) return;
      if (kind === 'cv') {
        if (format === 'pdf') {
          await this.db.cvDocumentExportPdfWysiwyg(item.id, filePath);
        } else {
          await this.db.cvDocumentExport(item.id, format, filePath);
        }
      } else {
        if (format === 'pdf') {
          await this.db.coverLetterDocumentExportPdfWysiwyg(item.id, filePath);
        } else {
          await this.db.coverLetterDocumentExport(item.id, format, filePath);
        }
      }
      this.status.set(`${this.t()('jobs.wizard.export_saved')}: ${filePath}`);
      this.lastExport.set({ filePath, format });
      // Exporting a document commits it: clear the apply-wizard draft flag so it
      // now appears in the Documents library (deferred-to-step-5 rule).
      await onExported(kind);
    } catch (e) {
      this.status.set(`${this.t()('jobs.wizard.export_failed')}: ${String(e)}`);
      this.error.set(true);
    } finally {
      this.exporting.set(false);
    }
  }

  openFile(path: string): void {
    void this.system.openFile(path);
  }

  revealFile(path: string): void {
    void this.system.revealInFolder(path);
  }

  /** Suggested save name - see `export-filename.ts` for the rule and why. */
  private filename(item: DocumentLibraryItem, format: ExportFormat): string {
    return exportFileName(item.label ?? '', item.docType, format);
  }
}

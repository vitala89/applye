import { Injectable, inject, signal } from '@angular/core';
import { DocumentsGateway, SystemGateway } from '@applye/data';
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
/**
 * **The one export path, and why there is only one.**
 *
 * Both document editors used to export with `window.print()`, raising the macOS
 * print dialog. That dialog owns its own `NSPrintInfo`, so **the Style card's
 * margins could not reach an export made from an editor at all**: the same
 * document exported from the two buttons carried clip boxes of `0 0 595 841`
 * from the editor and `56.69 56.69 481 728` from the Documents list. Two
 * buttons, one document, two answers - and no amount of CSS could have closed
 * it, because the dialog is not ours to configure (`B4`).
 *
 * Everything exports through here now: a save dialog, then the Rust command
 * that opens a hidden window on the chromeless print route and drives the print
 * with the document's own page settings on `NSPrintInfo`.
 *
 * **Callers save before calling, and that is deliberate.** The hidden window
 * renders the document **as it is stored**, so an unsaved edit would simply be
 * missing from the file. It does not contradict the editors' rule that a raw
 * Cmd+P must never persist a half-typed draft: there the user did not ask for a
 * write, while pressing Export **is** asking for this document to become a
 * file, and a file of something other than what was asked for is worse than a
 * save the user did not name.
 */
@Injectable()
export class DocumentExportService {
  private readonly db = inject(DocumentsGateway);
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

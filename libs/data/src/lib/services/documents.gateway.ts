import { Injectable } from '@angular/core';
import {
  CvImportFile,
  CvTemplate,
  DocumentLibraryItem,
  LibraryDocType,
  StyleNote,
  UpsertCvTemplateInput,
  UpsertDocumentLibraryItemInput,
} from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The document library: CV and cover-letter rows, the CV layout templates, the
 * two file readers the editors use, and every export path the app actually
 * ships.
 *
 * **The sixth per-domain gateway** - see `CODE_QUALITY.md` for the migration
 * and `DraftsGateway` for the pattern.
 *
 * **This is the export path that survived.** `SystemGateway`'s pull request
 * deleted `exportDocx`, `exportPdf` and `generatedDocGet` - the old
 * tailoring-journal route - because nothing called them. The methods here are
 * what the CV and cover-letter lists actually invoke, which is why the deletion
 * over there was safe.
 *
 * `printWindowReady` sits with the exports rather than in `SystemGateway`
 * because it is one half of the WYSIWYG print handshake: the renderer tells
 * Rust the print window has painted, and the two `...PdfWysiwyg` methods are
 * the other half. Splitting them would put one protocol behind two tokens.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsGateway {
  async cvTemplatesList(): Promise<CvTemplate[]> {
    return tauriInvoke<CvTemplate[]>('cv_templates_list');
  }

  async documentLibraryList(docType?: LibraryDocType): Promise<DocumentLibraryItem[]> {
    return tauriInvoke<DocumentLibraryItem[]>('document_library_list', { docType });
  }

  async documentLibraryGet(id: number): Promise<DocumentLibraryItem | null> {
    return tauriInvoke<DocumentLibraryItem | null>('document_library_get', { id });
  }

  async documentLibraryUpsert(input: UpsertDocumentLibraryItemInput): Promise<DocumentLibraryItem> {
    return tauriInvoke<DocumentLibraryItem>('document_library_upsert', { input });
  }

  /** Clears the apply-wizard draft flag, promoting a draft into a normal
   * library entry that shows up in the Documents list. Called at Export &
   * Apply. Resolves to the updated row, or null if the id no longer exists. */
  async documentLibraryCommit(id: number): Promise<DocumentLibraryItem | null> {
    return tauriInvoke<DocumentLibraryItem | null>('document_library_commit', { id });
  }

  async documentLibraryDelete(id: number): Promise<void> {
    return tauriInvoke<void>('document_library_delete', { id });
  }

  async cvTemplateUpsert(input: UpsertCvTemplateInput): Promise<CvTemplate> {
    return tauriInvoke<CvTemplate>('cv_template_upsert', { input });
  }

  /** Reads a picked DOCX/PDF and extracts its plain text (deterministic,
   * 0 tokens) - ready for the `cv-import` skill. */
  async cvImportReadFile(path: string): Promise<CvImportFile> {
    return tauriInvoke<CvImportFile>('cv_import_read_file', { path });
  }

  /** Reads a picked CV photo file and returns it as a base64 data URI,
   * ready for inline storage/preview in a `CvPhotoSection`. */
  async cvPhotoReadFile(path: string): Promise<string> {
    return tauriInvoke<string>('cv_photo_read_file', { path });
  }

  /** Exports a library CV to `savePath` as DOCX or PDF - a library export,
   * distinct from the job-specific tailoring export journal. */
  async cvDocumentExport(id: number, format: 'docx' | 'pdf', savePath: string): Promise<string> {
    return tauriInvoke<string>('cv_document_export', { id, format, savePath });
  }

  /** Silent WYSIWYG PDF export: a hidden window renders the same preview as
   * the editor and the OS prints it straight to `savePath` - pixel-identical
   * to the editor, no dialogs. Falls back to the structured renderer on
   * platforms without a native print-to-file call. */
  async cvDocumentExportPdfWysiwyg(id: number, savePath: string): Promise<string> {
    return tauriInvoke<string>('cv_document_export_pdf_wysiwyg', { id, savePath });
  }

  /** Called by the print route once its preview has settled - releases the
   * export command waiting on this window. */
  printWindowReady(): Promise<void> {
    return tauriInvoke<void>('print_window_ready');
  }

  async coverLetterDocumentExport(
    id: number,
    format: 'docx' | 'pdf',
    savePath: string,
  ): Promise<string> {
    return tauriInvoke<string>('cover_letter_document_export', { id, format, savePath });
  }

  /** The cover letter's counterpart to `cvDocumentExportPdfWysiwyg` - same
   * hidden-window print path, via the `print/cover-letter/:id` route. */
  async coverLetterDocumentExportPdfWysiwyg(id: number, savePath: string): Promise<string> {
    return tauriInvoke<string>('cover_letter_document_export_pdf_wysiwyg', { id, savePath });
  }

  /** Deterministic, 0-token ATS/readability check (ROADMAP §16.5) - empty
   * array when `styleJson` is unset or already at the safe default. */
  async checkStyleSafety(styleJson?: string): Promise<StyleNote[]> {
    return tauriInvoke<StyleNote[]>('check_style_safety', { styleJson });
  }
}

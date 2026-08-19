import { Injectable } from '@angular/core';
import { HealthReport, ImportPreviewRow, ImportRawRow, ImportResult } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The operations that belong to no feature: opening a file or its folder,
 * the tracklist import, the health check, and `hashText`.
 *
 * **The fifth per-domain gateway** - see `CODE_QUALITY.md` for the migration
 * and `DraftsGateway` for the pattern.
 *
 * **`hashText` lives here for the reason it did not travel with any domain.**
 * Twelve callers read it, across profile, documents, dashboard and jobs; it
 * keys every AI cache in the application and belongs to none of them. Putting
 * it in a domain gateway would have made a dozen unrelated consumers inject
 * that domain's token.
 *
 * **Four wrappers were deleted rather than moved**, because nothing in the
 * application called them - not a store, not a component, not a spec:
 * `generatedDocGet`, `exportDocx` and `exportPdf` are the old tailoring-journal
 * export path, superseded by the document-library export the app actually uses,
 * and `exportDatabase` is a backup command with no button and no translation
 * key anywhere. **Their Rust commands are still registered**, so nothing on
 * that side changed and a future caller can wrap them again in ten lines. Both
 * gaps are written up in the watch log rather than left as dead code that reads
 * like a feature.
 */
@Injectable({ providedIn: 'root' })
export class SystemGateway {
  openFile(path: string): Promise<void> {
    return tauriInvoke<void>('open_file', { path });
  }

  revealInFolder(path: string): Promise<void> {
    return tauriInvoke<void>('reveal_in_folder', { path });
  }

  importReadFile(path: string): Promise<{ fileType: string; content: string }> {
    return tauriInvoke<{ fileType: string; content: string }>('import_read_file', { path });
  }

  importPreview(rows: ImportRawRow[]): Promise<ImportPreviewRow[]> {
    return tauriInvoke<ImportPreviewRow[]>('import_preview', { rows });
  }

  importConfirm(
    rows: ImportRawRow[],
    importedFrom: string,
    followupDaysAfterApply: number,
  ): Promise<ImportResult> {
    return tauriInvoke<ImportResult>('import_confirm', {
      rows,
      importedFrom,
      followupDaysAfterApply,
    });
  }

  healthCheck(): Promise<HealthReport> {
    return tauriInvoke<HealthReport>('health_check');
  }

  hashText(text: string): Promise<string> {
    return tauriInvoke<string>('hash_text', { text });
  }
}

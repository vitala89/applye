import { DocumentLibraryItem } from '@applye/core';
import { DocumentExportService, ExportFormat, ReviewDocumentKind } from '@applye/application';

/**
 * The save dialog is a desktop effect. The application service only names the
 * file and writes the path the dialog returns. A cancel stops here: no write,
 * no error.
 */
export async function exportThroughSaveDialog(
  exportSvc: DocumentExportService,
  kind: ReviewDocumentKind,
  format: ExportFormat,
  item: DocumentLibraryItem | null,
  onExported: (kind: ReviewDocumentKind) => Promise<void>,
): Promise<void> {
  const filename = exportSvc.beginExport(kind, format, item);
  if (!filename || !item) return;
  let filePath: string | null;
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    filePath = await save({ defaultPath: filename });
  } catch (cause) {
    exportSvc.failDialog(cause);
    return;
  }
  if (!filePath) {
    exportSvc.cancelExport();
    return;
  }
  await exportSvc.exportTo(kind, format, item, filePath, onExported);
}

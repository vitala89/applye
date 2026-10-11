import { signal } from '@angular/core';
import { DocumentLibraryItem } from '@applye/core';
import { DocumentExportService } from '@applye/application';
import { exportThroughSaveDialog } from './save-dialog-export';

const save = jest.fn();
jest.mock('@tauri-apps/plugin-dialog', () => ({
  save: (...args: unknown[]) => save(...args),
}));

const item = { id: 11, docType: 'cv', label: 'My CV' } as DocumentLibraryItem;

describe('exportThroughSaveDialog', () => {
  function service() {
    const calls: { path: string }[] = [];
    const cancelled: string[] = [];
    const exportSvc = {
      exporting: signal<string | false>(false),
      status: signal(''),
      error: signal(false),
      beginExport: jest.fn((kind: string, format: string, doc: DocumentLibraryItem | null) => {
        if (!doc) return null;
        exportSvc.exporting.set(`${kind}-${format}`);
        return 'My CV.pdf';
      }),
      cancelExport: jest.fn(() => {
        cancelled.push('cancel');
        exportSvc.exporting.set(false);
      }),
      exportTo: jest.fn(
        async (_kind: string, _format: string, _doc: DocumentLibraryItem, path: string) => {
          calls.push({ path });
          exportSvc.exporting.set(false);
        },
      ),
    };
    return {
      exportSvc: exportSvc as unknown as DocumentExportService,
      calls,
      cancelled,
      raw: exportSvc,
    };
  }

  beforeEach(() => {
    save.mockReset();
  });

  it('writes the path the save dialog returns', async () => {
    save.mockResolvedValue('/tmp/out.pdf');
    const s = service();

    await exportThroughSaveDialog(s.exportSvc, 'cv', 'pdf', item, async () => undefined);

    expect(save).toHaveBeenCalledWith({ defaultPath: 'My CV.pdf' });
    expect(s.calls).toEqual([{ path: '/tmp/out.pdf' }]);
    expect(s.cancelled).toEqual([]);
  });

  it('stops on cancel without writing or reporting an error', async () => {
    save.mockResolvedValue(null);
    const s = service();

    await exportThroughSaveDialog(s.exportSvc, 'cv', 'pdf', item, async () => undefined);

    expect(s.calls).toEqual([]);
    expect(s.cancelled).toEqual(['cancel']);
    expect(s.raw.error()).toBe(false);
    expect(s.raw.status()).toBe('');
  });

  it('does not open the dialog when there is nothing to export', async () => {
    const s = service();

    await exportThroughSaveDialog(s.exportSvc, 'cv', 'pdf', null, async () => undefined);

    expect(save).not.toHaveBeenCalled();
    expect(s.calls).toEqual([]);
  });
});

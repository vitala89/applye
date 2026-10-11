import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DocumentLibraryItem } from '@applye/core';
import { DocumentsGateway } from '@applye/data';
import { DocumentExportService } from '@applye/application';
import { TranslateService } from '@applye/i18n';
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
      failDialog: jest.fn((cause: unknown) => {
        exportSvc.status.set(`jobs.wizard.export_failed: ${String(cause)}`);
        exportSvc.error.set(true);
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

  it('stops the spinner and records the error when the save dialog rejects', async () => {
    save.mockRejectedValueOnce(new Error('dialog crashed'));
    const pdf = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        DocumentExportService,
        {
          provide: DocumentsGateway,
          useValue: {
            cvDocumentExportPdfWysiwyg: pdf,
            cvDocumentExport: jest.fn(),
            coverLetterDocumentExport: jest.fn(),
            coverLetterDocumentExportPdfWysiwyg: jest.fn(),
          },
        },
        { provide: TranslateService, useValue: { t: signal((key: string) => key) } },
      ],
    });
    const exportSvc = TestBed.inject(DocumentExportService);

    await exportThroughSaveDialog(exportSvc, 'cv', 'pdf', item, async () => undefined);

    expect(exportSvc.exporting()).toBe(false);
    expect(exportSvc.error()).toBe(true);
    expect(exportSvc.status()).toContain('jobs.wizard.export_failed');
    expect(pdf).not.toHaveBeenCalled();
  });
});

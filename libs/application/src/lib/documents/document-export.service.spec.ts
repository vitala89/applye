import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DbService, SystemGateway } from '@applye/data';
import { DocumentLibraryItem } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DocumentExportService } from './document-export.service';

const save = jest.fn();
jest.mock('@tauri-apps/plugin-dialog', () => ({ save: (...a: unknown[]) => save(...a) }), {
  virtual: true,
});

/**
 * Covers the behaviour that used to live inline in `JobsComponent`. The Tauri
 * save dialog is mocked; everything else is the real code path.
 */
describe('DocumentExportService', () => {
  let db: Record<string, jest.Mock>;

  const cv = { id: 11, docType: 'cv', label: 'My CV' } as unknown as DocumentLibraryItem;
  const letter = {
    id: 22,
    docType: 'cover_letter',
    label: 'Letter',
  } as unknown as DocumentLibraryItem;

  function make(): DocumentExportService {
    save.mockReset().mockResolvedValue('/tmp/out.pdf');
    db = {
      cvDocumentExport: jest.fn(async () => undefined),
      cvDocumentExportPdfWysiwyg: jest.fn(async () => undefined),
      coverLetterDocumentExport: jest.fn(async () => undefined),
      coverLetterDocumentExportPdfWysiwyg: jest.fn(async () => undefined),
      openFile: jest.fn(async () => undefined),
      revealInFolder: jest.fn(async () => undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DocumentExportService,
        { provide: DbService, useValue: db },
        { provide: SystemGateway, useValue: db },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
      ],
    });
    return TestBed.inject(DocumentExportService);
  }

  const noop = async () => undefined;

  it('starts idle', () => {
    const s = make();
    expect(s.exporting()).toBe(false);
    expect(s.status()).toBe('');
    expect(s.error()).toBe(false);
    expect(s.lastExport()).toBeNull();
  });

  it('warns instead of exporting when the document is missing', async () => {
    const s = make();
    await s.run('cv', 'pdf', null, noop);

    expect(s.status()).toBe('jobs.wizard.export_missing_cv_warning');
    expect(s.error()).toBe(true);
    expect(save).not.toHaveBeenCalled();

    await s.run('cover_letter', 'pdf', null, noop);
    expect(s.status()).toBe('jobs.wizard.export_missing_cover_letter_warning');
  });

  it('routes a CV PDF through the WYSIWYG engine, DOCX through the plain export', async () => {
    const s = make();
    await s.run('cv', 'pdf', cv, noop);
    expect(db.cvDocumentExportPdfWysiwyg).toHaveBeenCalledWith(11, '/tmp/out.pdf');
    expect(db.cvDocumentExport).not.toHaveBeenCalled();

    const s2 = make();
    await s2.run('cv', 'docx', cv, noop);
    expect(db.cvDocumentExport).toHaveBeenCalledWith(11, 'docx', '/tmp/out.pdf');
    expect(db.cvDocumentExportPdfWysiwyg).not.toHaveBeenCalled();
  });

  it('routes a cover letter the same way', async () => {
    const s = make();
    await s.run('cover_letter', 'pdf', letter, noop);
    expect(db.coverLetterDocumentExportPdfWysiwyg).toHaveBeenCalledWith(22, '/tmp/out.pdf');

    const s2 = make();
    await s2.run('cover_letter', 'docx', letter, noop);
    expect(db.coverLetterDocumentExport).toHaveBeenCalledWith(22, 'docx', '/tmp/out.pdf');
  });

  // The naming rule itself lives in `export-filename.spec.ts`; these two only
  // check that the dialog is offered what that rule produced.
  it('suggests the label as a readable name, not a slug', async () => {
    const s = make();
    await s.run('cv', 'pdf', { ...cv, label: '  My CV (2026)! ' } as never, noop);
    expect(save).toHaveBeenCalledWith({ defaultPath: 'My CV (2026)!.pdf' });
  });

  it('falls back to the document type when nothing of the label survives', async () => {
    const s = make();
    await s.run('cv', 'docx', { ...cv, label: '///' } as never, noop);
    expect(save).toHaveBeenCalledWith({ defaultPath: 'cv.docx' });
  });

  it('reports the saved path and commits the document', async () => {
    const s = make();
    const onExported = jest.fn(async () => undefined);

    await s.run('cv', 'pdf', cv, onExported);

    expect(s.status()).toBe('jobs.wizard.export_saved: /tmp/out.pdf');
    expect(s.error()).toBe(false);
    expect(s.lastExport()).toEqual({ filePath: '/tmp/out.pdf', format: 'pdf' });
    expect(onExported).toHaveBeenCalledWith('cv');
    expect(s.exporting()).toBe(false);
  });

  it('does nothing further when the save dialog is cancelled', async () => {
    const s = make();
    save.mockResolvedValue(null);
    const onExported = jest.fn(async () => undefined);

    await s.run('cv', 'pdf', cv, onExported);

    expect(db.cvDocumentExportPdfWysiwyg).not.toHaveBeenCalled();
    expect(onExported).not.toHaveBeenCalled();
    expect(s.status()).toBe('');
    expect(s.error()).toBe(false);
    expect(s.lastExport()).toBeNull();
    expect(s.exporting()).toBe(false);
  });

  it('reports a write failure and clears the in-flight key', async () => {
    const s = make();
    db.cvDocumentExportPdfWysiwyg.mockRejectedValue(new Error('disk full'));

    await s.run('cv', 'pdf', cv, noop);

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('jobs.wizard.export_failed');
    expect(s.status()).toContain('disk full');
    expect(s.exporting()).toBe(false);
  });

  it('a failing commit is reported on the same status line', async () => {
    const s = make();

    await s.run('cv', 'pdf', cv, async () => {
      throw new Error('commit failed');
    });

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('commit failed');
  });

  it('marks the in-flight key as kind-format while the export runs', async () => {
    const s = make();
    let seen: string | false = false;
    save.mockImplementation(async () => {
      seen = s.exporting();
      return '/tmp/out.pdf';
    });

    await s.run('cover_letter', 'docx', letter, noop);

    expect(seen).toBe('cover_letter-docx');
    expect(s.exporting()).toBe(false);
  });

  it('resetStatus clears the status line and the last export', async () => {
    const s = make();
    await s.run('cv', 'pdf', cv, noop);

    s.resetStatus();

    expect(s.status()).toBe('');
    expect(s.error()).toBe(false);
    expect(s.lastExport()).toBeNull();
  });

  it('opens and reveals through the db bridge', () => {
    const s = make();
    s.openFile('/tmp/out.pdf');
    s.revealFile('/tmp/out.pdf');

    expect(db.openFile).toHaveBeenCalledWith('/tmp/out.pdf');
    expect(db.revealInFolder).toHaveBeenCalledWith('/tmp/out.pdf');
  });
});

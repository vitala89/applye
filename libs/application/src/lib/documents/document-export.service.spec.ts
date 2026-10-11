import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { DocumentLibraryItem } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DocumentExportService } from './document-export.service';

/**
 * Covers the behaviour that used to live inline in `JobsComponent`. The save
 * dialog is the desktop's; these tests cover the write the service still owns.
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
    db = {
      cvDocumentExport: jest.fn(async () => undefined),
      cvDocumentExportPdfWysiwyg: jest.fn(async () => undefined),
      coverLetterDocumentExport: jest.fn(async () => undefined),
      coverLetterDocumentExportPdfWysiwyg: jest.fn(async () => undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DocumentExportService,
        { provide: JobsGateway, useValue: db },
        { provide: DocumentsGateway, useValue: db },
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

  it('warns instead of exporting when the document is missing', () => {
    const s = make();
    expect(s.beginExport('cv', 'pdf', null)).toBeNull();

    expect(s.status()).toBe('jobs.wizard.export_missing_cv_warning');
    expect(s.error()).toBe(true);
    expect(s.exporting()).toBe(false);

    expect(s.beginExport('cover_letter', 'pdf', null)).toBeNull();
    expect(s.status()).toBe('jobs.wizard.export_missing_cover_letter_warning');
  });

  it('routes a CV PDF through the WYSIWYG engine, DOCX through the plain export', async () => {
    const s = make();
    s.beginExport('cv', 'pdf', cv);
    await s.exportTo('cv', 'pdf', cv, '/tmp/out.pdf', noop);
    expect(db.cvDocumentExportPdfWysiwyg).toHaveBeenCalledWith(11, '/tmp/out.pdf');
    expect(db.cvDocumentExport).not.toHaveBeenCalled();

    const s2 = make();
    s2.beginExport('cv', 'docx', cv);
    await s2.exportTo('cv', 'docx', cv, '/tmp/out.pdf', noop);
    expect(db.cvDocumentExport).toHaveBeenCalledWith(11, 'docx', '/tmp/out.pdf');
    expect(db.cvDocumentExportPdfWysiwyg).not.toHaveBeenCalled();
  });

  it('routes a cover letter the same way', async () => {
    const s = make();
    s.beginExport('cover_letter', 'pdf', letter);
    await s.exportTo('cover_letter', 'pdf', letter, '/tmp/out.pdf', noop);
    expect(db.coverLetterDocumentExportPdfWysiwyg).toHaveBeenCalledWith(22, '/tmp/out.pdf');

    const s2 = make();
    s2.beginExport('cover_letter', 'docx', letter);
    await s2.exportTo('cover_letter', 'docx', letter, '/tmp/out.pdf', noop);
    expect(db.coverLetterDocumentExport).toHaveBeenCalledWith(22, 'docx', '/tmp/out.pdf');
  });

  // The naming rule itself lives in `document-filename.spec.ts`; these two only
  // check that the dialog is offered what that rule produced.
  it('suggests the label as a readable name, not a slug', () => {
    const s = make();
    expect(s.beginExport('cv', 'pdf', { ...cv, label: '  My CV (2026)! ' } as never)).toBe(
      'My CV (2026)!.pdf',
    );
  });

  it('falls back to the document type when nothing of the label survives', () => {
    const s = make();
    expect(s.beginExport('cv', 'docx', { ...cv, label: '///' } as never)).toBe('cv.docx');
  });

  it('reports the saved path and commits the document', async () => {
    const s = make();
    const onExported = jest.fn(async () => undefined);

    s.beginExport('cv', 'pdf', cv);
    await s.exportTo('cv', 'pdf', cv, '/tmp/out.pdf', onExported);

    expect(s.status()).toBe('jobs.wizard.export_saved: /tmp/out.pdf');
    expect(s.error()).toBe(false);
    expect(s.lastExport()).toEqual({ filePath: '/tmp/out.pdf', format: 'pdf' });
    expect(onExported).toHaveBeenCalledWith('cv');
    expect(s.exporting()).toBe(false);
  });

  it('a cancelled dialog clears the in-flight flag and writes nothing', () => {
    const s = make();
    s.beginExport('cv', 'pdf', cv);

    s.cancelExport();

    expect(db.cvDocumentExportPdfWysiwyg).not.toHaveBeenCalled();
    expect(s.status()).toBe('');
    expect(s.error()).toBe(false);
    expect(s.lastExport()).toBeNull();
    expect(s.exporting()).toBe(false);
  });

  it('reports a write failure and clears the in-flight key', async () => {
    const s = make();
    db.cvDocumentExportPdfWysiwyg.mockRejectedValue(new Error('disk full'));

    s.beginExport('cv', 'pdf', cv);
    await s.exportTo('cv', 'pdf', cv, '/tmp/out.pdf', noop);

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('jobs.wizard.export_failed');
    expect(s.status()).toContain('disk full');
    expect(s.exporting()).toBe(false);
  });

  it('a failing commit is reported on the same status line', async () => {
    const s = make();

    s.beginExport('cv', 'pdf', cv);
    await s.exportTo('cv', 'pdf', cv, '/tmp/out.pdf', async () => {
      throw new Error('commit failed');
    });

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('commit failed');
  });

  it('marks the in-flight key as kind-format while the export runs', async () => {
    const s = make();
    let seen: string | false = false;
    db.coverLetterDocumentExport.mockImplementation(async () => {
      seen = s.exporting();
    });

    s.beginExport('cover_letter', 'docx', letter);
    await s.exportTo('cover_letter', 'docx', letter, '/tmp/out.pdf', noop);

    expect(seen).toBe('cover_letter-docx');
    expect(s.exporting()).toBe(false);
  });

  it('resetStatus clears the status line and the last export', async () => {
    const s = make();
    s.beginExport('cv', 'pdf', cv);
    await s.exportTo('cv', 'pdf', cv, '/tmp/out.pdf', noop);

    s.resetStatus();

    expect(s.status()).toBe('');
    expect(s.error()).toBe(false);
    expect(s.lastExport()).toBeNull();
  });

  it('records a dialog failure and stops the spinner without writing', () => {
    const s = make();
    s.beginExport('cv', 'pdf', cv);
    s.failDialog(new Error('dialog crashed'));

    expect(s.exporting()).toBe(false);
    expect(s.error()).toBe(true);
    expect(s.status()).toContain('jobs.wizard.export_failed');
    expect(db.cvDocumentExportPdfWysiwyg).not.toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { DocumentsGateway } from './documents.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * The command strings and argument shapes, for the reason `drafts.gateway.spec.ts`
 * states: every consumer stubs the gateway, so a method invoking the wrong Rust
 * command leaves the whole suite green and fails only in the running app.
 *
 * **This gateway's own trap is symmetry.** The CV and cover-letter exports are
 * four methods with two identical signatures - `(id, format, savePath)` and
 * `(id, savePath)` - and the only thing separating a CV export from a cover
 * letter export is the command string. Nothing else would catch a copy-paste
 * between them, which is why all four are asserted rather than sampled.
 *
 * `documentLibraryList` is the one method whose argument is legitimately
 * `undefined` when the caller wants every type, so that case is pinned too.
 */
describe('DocumentsGateway', () => {
  let gateway: DocumentsGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [DocumentsGateway] });
    gateway = TestBed.inject(DocumentsGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('reads the library filtered and unfiltered', async () => {
    await gateway.documentLibraryList('cv');
    expect(invoke).toHaveBeenCalledWith('document_library_list', { docType: 'cv' });
    await gateway.documentLibraryList();
    expect(invoke).toHaveBeenCalledWith('document_library_list', { docType: undefined });
  });

  it('gets, commits and deletes a library row by id', async () => {
    await gateway.documentLibraryGet(4);
    expect(invoke).toHaveBeenCalledWith('document_library_get', { id: 4 });
    await gateway.documentLibraryCommit(4);
    expect(invoke).toHaveBeenCalledWith('document_library_commit', { id: 4 });
    await gateway.documentLibraryDelete(4);
    expect(invoke).toHaveBeenCalledWith('document_library_delete', { id: 4 });
  });

  it('upserts a library row and a template under one input key', async () => {
    const input = { docType: 'cv', title: 'Mine' };
    await gateway.documentLibraryUpsert(input as never);
    expect(invoke).toHaveBeenCalledWith('document_library_upsert', { input });
    await gateway.cvTemplateUpsert(input as never);
    expect(invoke).toHaveBeenCalledWith('cv_template_upsert', { input });
  });

  it('lists templates and signals print readiness with no arguments', async () => {
    await gateway.cvTemplatesList();
    expect(invoke).toHaveBeenCalledWith('cv_templates_list', undefined);
    await gateway.printWindowReady();
    expect(invoke).toHaveBeenCalledWith('print_window_ready', undefined);
  });

  it('reads an imported CV and a photo by path, through different commands', async () => {
    await gateway.cvImportReadFile('/tmp/cv.docx');
    expect(invoke).toHaveBeenCalledWith('cv_import_read_file', { path: '/tmp/cv.docx' });
    await gateway.cvPhotoReadFile('/tmp/me.jpg');
    expect(invoke).toHaveBeenCalledWith('cv_photo_read_file', { path: '/tmp/me.jpg' });
  });

  it('keeps the CV and cover-letter exports apart, in both variants', async () => {
    // Four methods, two signatures, and only the command string separates a CV
    // export from a cover-letter one. A copy-paste between them type-checks.
    await gateway.cvDocumentExport(1, 'pdf', '/tmp/a.pdf');
    expect(invoke).toHaveBeenCalledWith('cv_document_export', {
      id: 1,
      format: 'pdf',
      savePath: '/tmp/a.pdf',
    });
    await gateway.coverLetterDocumentExport(1, 'pdf', '/tmp/b.pdf');
    expect(invoke).toHaveBeenCalledWith('cover_letter_document_export', {
      id: 1,
      format: 'pdf',
      savePath: '/tmp/b.pdf',
    });
    await gateway.cvDocumentExportPdfWysiwyg(2, '/tmp/c.pdf');
    expect(invoke).toHaveBeenCalledWith('cv_document_export_pdf_wysiwyg', {
      id: 2,
      savePath: '/tmp/c.pdf',
    });
    await gateway.coverLetterDocumentExportPdfWysiwyg(2, '/tmp/d.pdf');
    expect(invoke).toHaveBeenCalledWith('cover_letter_document_export_pdf_wysiwyg', {
      id: 2,
      savePath: '/tmp/d.pdf',
    });
  });

  it('checks style safety with the style json', async () => {
    await gateway.checkStyleSafety('{}');
    expect(invoke).toHaveBeenCalledWith('check_style_safety', { styleJson: '{}' });
  });

  it('sends fifteen distinct commands, one per method', async () => {
    await gateway.cvTemplatesList();
    await gateway.documentLibraryList();
    await gateway.documentLibraryGet(1);
    await gateway.documentLibraryUpsert({} as never);
    await gateway.documentLibraryCommit(1);
    await gateway.documentLibraryDelete(1);
    await gateway.cvTemplateUpsert({} as never);
    await gateway.cvImportReadFile('a');
    await gateway.cvPhotoReadFile('a');
    await gateway.cvDocumentExport(1, 'pdf', 'a');
    await gateway.cvDocumentExportPdfWysiwyg(1, 'a');
    await gateway.printWindowReady();
    await gateway.coverLetterDocumentExport(1, 'pdf', 'a');
    await gateway.coverLetterDocumentExportPdfWysiwyg(1, 'a');
    await gateway.checkStyleSafety();
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(new Set(commands).size).toBe(15);
  });
});

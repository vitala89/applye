import { TestBed } from '@angular/core/testing';
import type { DocumentLibraryItem } from '@applye/core';
import { DbService, DocumentsGateway, JobsGateway } from '@applye/data';
import { CoverLetterListStore } from './cover-letter-list.store';

const item = (over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem =>
  ({
    id: 1,
    label: 'Acme',
    source: 'generated',
    contentJson: '{}',
    ...over,
  }) as DocumentLibraryItem;

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    documentLibraryList: jest.fn().mockResolvedValue([item()]),
    listJobs: jest.fn().mockResolvedValue([{ id: 5, company: 'Acme', title: 'Engineer' }]),
    listApplications: jest.fn().mockResolvedValue([{ id: 9, jobId: 5, coverLetterDocumentId: 1 }]),
    documentLibraryUpsert: jest.fn().mockResolvedValue(item({ id: 2 })),
    documentLibraryDelete: jest.fn().mockResolvedValue(undefined),
    coverLetterDocumentExport: jest.fn().mockResolvedValue('/tmp/a.docx'),
    coverLetterDocumentExportPdfWysiwyg: jest.fn().mockResolvedValue('/tmp/a.pdf'),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CoverLetterListStore,
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(CoverLetterListStore), db };
}

describe('CoverLetterListStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('loading', () => {
    it('asks the library only for cover letters', async () => {
      const { store, db } = createStore();

      expect(await store.load()).toBe(true);
      expect(db.documentLibraryList).toHaveBeenCalledWith('cover_letter');
      expect(store.hasCoverLetters()).toBe(true);
      expect(store.loadError()).toBe(false);
    });

    it('raises loadError and records the message', async () => {
      const { store } = createStore({ listJobs: jest.fn().mockRejectedValue(new Error('gone')) });

      expect(await store.load()).toBe(false);
      expect(store.loadError()).toBe(true);
      expect(store.error()).toContain('gone');
      expect(store.loading()).toBe(false);
    });
  });

  describe('the linked job', () => {
    /** Application points at the document, job at the application - two hops,
     * and either can be missing. */
    it('follows the document to its job', async () => {
      const { store } = createStore();
      await store.load();

      expect(store.linkedJobFacts(item({ id: 1 }))).toEqual(['Acme', 'Engineer']);
    });

    it('is empty for a document no application claims', async () => {
      const { store } = createStore();
      await store.load();

      expect(store.linkedJobFacts(item({ id: 77 }))).toEqual([]);
    });

    it('drops a missing half rather than leaving a gap for the page to join', async () => {
      const { store } = createStore({
        listJobs: jest.fn().mockResolvedValue([{ id: 5, company: 'Acme' }]),
      });
      await store.load();

      expect(store.linkedJobFacts(item({ id: 1 }))).toEqual(['Acme']);
    });
  });

  describe('duplicating', () => {
    /** The label is composed by the page, because naming a copy needs two
     * translation keys. */
    it('copies the content under the label it was given', async () => {
      const { store, db } = createStore();
      await store.load();

      expect(await store.duplicate(item({ contentJson: '{"a":1}' }), 'Acme (copy)')).toBe(true);
      expect(db.documentLibraryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: 'cover_letter',
          label: 'Acme (copy)',
          contentJson: '{"a":1}',
          isDefault: false,
        }),
      );
    });

    it('reloads the library so the copy appears', async () => {
      const { store, db } = createStore();
      await store.load();

      await store.duplicate(item(), 'copy');

      expect(db.documentLibraryList).toHaveBeenCalledTimes(2);
    });

    it('records a failure', async () => {
      const { store } = createStore({
        documentLibraryUpsert: jest.fn().mockRejectedValue(new Error('full')),
      });
      await store.load();

      expect(await store.duplicate(item(), 'copy')).toBe(false);
      expect(store.error()).toContain('full');
    });
  });

  describe('exporting', () => {
    /** PDF goes through the WYSIWYG engine so the file matches the editor;
     * anything else takes the plain path. */
    it('sends PDF through the WYSIWYG engine and docx through the other', async () => {
      const { store, db } = createStore();

      await store.exportDoc(item(), 'pdf', '/tmp/a.pdf');
      expect(db.coverLetterDocumentExportPdfWysiwyg).toHaveBeenCalledWith(1, '/tmp/a.pdf');

      await store.exportDoc(item(), 'docx', '/tmp/a.docx');
      expect(db.coverLetterDocumentExport).toHaveBeenCalledWith(1, 'docx', '/tmp/a.docx');
    });

    it('refuses a second export while one is running', async () => {
      const { store, db } = createStore({
        coverLetterDocumentExportPdfWysiwyg: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('/tmp/a.pdf'), 5);
            }),
        ),
      });

      const first = store.exportDoc(item(), 'pdf', '/tmp/a.pdf');
      expect(await store.exportDoc(item({ id: 2 }), 'pdf', '/tmp/b.pdf')).toBeNull();
      await first;

      expect(db.coverLetterDocumentExportPdfWysiwyg).toHaveBeenCalledTimes(1);
      expect(store.exportBusyId()).toBeNull();
    });

    it('clears the busy id after a failure', async () => {
      const { store } = createStore({
        coverLetterDocumentExportPdfWysiwyg: jest.fn().mockRejectedValue(new Error('denied')),
      });

      expect(await store.exportDoc(item(), 'pdf', '/tmp/a.pdf')).toBe(false);
      expect(store.error()).toContain('denied');
      expect(store.exportBusyId()).toBeNull();
    });
  });

  describe('deleting', () => {
    it('refuses when nothing is targeted', async () => {
      const { store, db } = createStore();

      expect(await store.confirmDelete()).toBeNull();
      expect(db.documentLibraryDelete).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('deletes, closes the confirmation and reloads', async () => {
      const { store, db } = createStore();
      await store.load();
      store.requestDelete(item({ id: 3 }));

      expect(await store.confirmDelete()).toBe(true);
      expect(db.documentLibraryDelete).toHaveBeenCalledWith(3);
      expect(store.deleteTarget()).toBeNull();
      expect(db.documentLibraryList).toHaveBeenCalledTimes(2);
    });

    /** A failed delete keeps the confirmation open: the document is still
     * there, and closing would say otherwise. */
    it('keeps the confirmation open after a failure', async () => {
      const { store } = createStore({
        documentLibraryDelete: jest.fn().mockRejectedValue(new Error('locked')),
      });
      await store.load();
      store.requestDelete(item({ id: 3 }));

      expect(await store.confirmDelete()).toBe(false);
      expect(store.error()).toContain('locked');
      expect(store.deleteTarget()).not.toBeNull();
      expect(store.deleting()).toBe(false);
    });
  });
});

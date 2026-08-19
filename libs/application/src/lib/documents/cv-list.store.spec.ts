import { TestBed } from '@angular/core/testing';
import type { Application, CvTemplate, DocumentLibraryItem, Job } from '@applye/core';
import { DbService, DocumentsGateway } from '@applye/data';
import { CvListStore } from './cv-list.store';

const CVS = [
  { id: 1, label: 'Backend DE', source: 'generated' },
  { id: 2, label: 'Frontend US', source: 'uploaded' },
] as DocumentLibraryItem[];

const TEMPLATES = [{ id: 7, name: 'DE classic', regionTag: 'de' }] as CvTemplate[];
const JOBS = [{ id: 5, company: 'Acme', title: 'Engineer' }] as Job[];
const APPS = [{ id: 3, jobId: 5, cvDocumentId: 1 }] as Application[];

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    documentLibraryList: jest.fn().mockResolvedValue(CVS),
    cvTemplatesList: jest.fn().mockResolvedValue(TEMPLATES),
    listJobs: jest.fn().mockResolvedValue(JOBS),
    listApplications: jest.fn().mockResolvedValue(APPS),
    documentLibraryUpsert: jest.fn().mockResolvedValue({ id: 9 }),
    documentLibraryDelete: jest.fn().mockResolvedValue(undefined),
    cvDocumentExport: jest.fn().mockResolvedValue(undefined),
    cvDocumentExportPdfWysiwyg: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CvListStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(CvListStore), db };
}

describe('CvListStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('loading', () => {
    it('reads the library, the templates and both job lists in one pass', async () => {
      const { store, db } = createStore();

      expect(await store.load()).toBe(true);

      expect(db.documentLibraryList).toHaveBeenCalledWith('cv');
      expect(store.cvs()).toEqual(CVS);
      expect(store.templates()).toEqual(TEMPLATES);
      expect(store.trackedJobs()).toEqual(JOBS);
      expect(store.applications()).toEqual(APPS);
      expect(store.hasCvs()).toBe(true);
      expect(store.loading()).toBe(false);
      expect(store.loadError()).toBe(false);
    });

    it('raises loadError and carries what to say about it', async () => {
      const { store } = createStore({
        documentLibraryList: jest.fn().mockRejectedValue(new Error('locked')),
      });

      expect(await store.load()).toBe(false);

      expect(store.loadError()).toBe(true);
      expect(store.error()).toContain('locked');
      expect(store.loading()).toBe(false);
    });
  });

  describe('the job a CV belongs to', () => {
    it('hands over the facts, unjoined', async () => {
      const { store } = createStore();
      await store.load();

      expect(store.linkedJobFacts(CVS[0])).toEqual(['Acme', 'Engineer']);
    });

    it('says nothing for a CV no application points at', async () => {
      const { store } = createStore();
      await store.load();

      expect(store.linkedJobFacts(CVS[1])).toEqual([]);
    });
  });

  describe('duplicating', () => {
    it('writes the copy under the label the page composed and reloads', async () => {
      const { store, db } = createStore();

      expect(await store.duplicate(CVS[0], 'Backend DE (copy)')).toBe(true);

      expect(db.documentLibraryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ docType: 'cv', label: 'Backend DE (copy)', isDefault: false }),
      );
      expect(db.documentLibraryList).toHaveBeenCalled();
    });

    it('reports a failure', async () => {
      const { store } = createStore({
        documentLibraryUpsert: jest.fn().mockRejectedValue(new Error('disk')),
      });

      expect(await store.duplicate(CVS[0], 'copy')).toBe(false);
      expect(store.error()).toContain('disk');
    });
  });

  describe('exporting', () => {
    it('sends PDF through the WYSIWYG engine', async () => {
      const { store, db } = createStore();

      expect(await store.exportDoc(CVS[0], 'pdf', '/tmp/cv.pdf')).toBe(true);

      expect(db.cvDocumentExportPdfWysiwyg).toHaveBeenCalledWith(1, '/tmp/cv.pdf');
      expect(db.cvDocumentExport).not.toHaveBeenCalled();
      expect(store.exportBusyId()).toBeNull();
    });

    it('sends DOCX through the document exporter', async () => {
      const { store, db } = createStore();

      await store.exportDoc(CVS[0], 'docx', '/tmp/cv.docx');

      expect(db.cvDocumentExport).toHaveBeenCalledWith(1, 'docx', '/tmp/cv.docx');
    });

    /** A refusal says nothing, so it must not leave an older sentence standing. */
    it('refuses a second export and clears what the last failure said', async () => {
      const { store, db } = createStore();
      store.error.set('an older failure');
      store.exportBusyId.set(1);

      expect(await store.exportDoc(CVS[0], 'pdf', '/tmp/cv.pdf')).toBeNull();

      expect(store.error()).toBe('');
      expect(db.cvDocumentExportPdfWysiwyg).not.toHaveBeenCalled();
    });

    it('reports a failure and releases the busy flag', async () => {
      const { store } = createStore({
        cvDocumentExportPdfWysiwyg: jest.fn().mockRejectedValue(new Error('no such path')),
      });

      expect(await store.exportDoc(CVS[0], 'pdf', '/tmp/cv.pdf')).toBe(false);
      expect(store.error()).toContain('no such path');
      expect(store.exportBusyId()).toBeNull();
    });
  });

  describe('deleting', () => {
    it('holds the target until it is confirmed', () => {
      const { store } = createStore();

      store.requestDelete(CVS[0]);
      expect(store.deleteTarget()).toEqual(CVS[0]);

      store.cancelDelete();
      expect(store.deleteTarget()).toBeNull();
    });

    it('deletes, clears the target and reloads', async () => {
      const { store, db } = createStore();
      store.requestDelete(CVS[0]);

      expect(await store.confirmDelete()).toBe(true);

      expect(db.documentLibraryDelete).toHaveBeenCalledWith(1);
      expect(store.deleteTarget()).toBeNull();
      expect(store.deleting()).toBe(false);
    });

    it('refuses when there is nothing to delete, and clears what was said before', async () => {
      const { store, db } = createStore();
      store.error.set('an older failure');

      expect(await store.confirmDelete()).toBeNull();

      expect(store.error()).toBe('');
      expect(db.documentLibraryDelete).not.toHaveBeenCalled();
    });

    it('reports a failure and keeps the target', async () => {
      const { store } = createStore({
        documentLibraryDelete: jest.fn().mockRejectedValue(new Error('in use')),
      });
      store.requestDelete(CVS[0]);

      expect(await store.confirmDelete()).toBe(false);
      expect(store.error()).toContain('in use');
      expect(store.deleteTarget()).toEqual(CVS[0]);
      expect(store.deleting()).toBe(false);
    });
  });
});

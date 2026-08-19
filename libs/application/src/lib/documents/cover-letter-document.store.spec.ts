import { TestBed } from '@angular/core/testing';
import type { DocumentLibraryItem } from '@applye/core';
import { DbService, DocumentsGateway } from '@applye/data';
import { CoverLetterContentStore } from './cover-letter-content.store';
import { CoverLetterDocumentStore } from './cover-letter-document.store';
import { CoverLetterStyleStore } from './cover-letter-style.store';

function doc(over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem {
  return {
    id: 7,
    docType: 'cover_letter',
    source: 'generated',
    label: 'Letter',
    regionTag: 'de',
    language: 'en',
    isDefault: false,
    ...over,
  } as DocumentLibraryItem;
}

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    documentLibraryGet: jest.fn().mockResolvedValue(doc()),
    documentLibraryList: jest.fn().mockResolvedValue([]),
    documentLibraryUpsert: jest.fn((input) => Promise.resolve({ ...doc(), ...input })),
    checkStyleSafety: jest.fn().mockResolvedValue([]),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CoverLetterDocumentStore,
      CoverLetterContentStore,
      CoverLetterStyleStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return {
    store: TestBed.inject(CoverLetterDocumentStore),
    letter: TestBed.inject(CoverLetterContentStore),
    styles: TestBed.inject(CoverLetterStyleStore),
    db,
  };
}

describe('CoverLetterDocumentStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts loading, with no document and no error', () => {
    const { store } = createStore();
    expect(store.loading()).toBe(true);
    expect(store.loadError()).toBe(false);
    expect(store.doc()).toBeNull();
  });

  describe('load', () => {
    it('fills the row fields from the document', async () => {
      const { store } = createStore();
      await store.load(7);
      expect(store.doc()?.id).toBe(7);
      expect(store.label()).toBe('Letter');
      expect(store.regionTag()).toBe('de');
      expect(store.isDefault()).toBe(false);
      expect(store.loading()).toBe(false);
      expect(store.loadError()).toBe(false);
    });

    it('falls back to an empty label and the generic region for a bare row', async () => {
      const { store } = createStore({
        documentLibraryGet: jest.fn().mockResolvedValue(doc({ label: null, regionTag: null })),
      });
      await store.load(7);
      expect(store.label()).toBe('');
      expect(store.regionTag()).toBe('generic');
    });

    it('hands the content and the style to the stores that own them', async () => {
      const { store, letter, styles } = createStore({
        documentLibraryGet: jest.fn().mockResolvedValue(
          doc({
            contentJson: JSON.stringify({ subject: 'Hired?' }),
            styleJson: JSON.stringify({ fontSizePt: 13 }),
          }),
        ),
      });
      await store.load(7);
      expect(letter.content().subject).toBe('Hired?');
      expect(styles.style().fontSizePt).toBe(13);
    });

    it('reports a missing document as a load error, without a document', async () => {
      const { store } = createStore({
        documentLibraryGet: jest.fn().mockResolvedValue(null),
      });
      await store.load(7);
      expect(store.loadError()).toBe(true);
      expect(store.doc()).toBeNull();
      expect(store.loading()).toBe(false);
    });

    it('reports a gateway failure as a load error rather than rejecting', async () => {
      const { store } = createStore({
        documentLibraryGet: jest.fn().mockRejectedValue(new Error('offline')),
      });
      await expect(store.load(7)).resolves.toBeUndefined();
      expect(store.loadError()).toBe(true);
      expect(store.loading()).toBe(false);
    });

    it('reports malformed stored JSON as a load error, because hydrate throws', async () => {
      const { store } = createStore({
        documentLibraryGet: jest.fn().mockResolvedValue(doc({ contentJson: '{oops' })),
      });
      await store.load(7);
      expect(store.loadError()).toBe(true);
      expect(store.loading()).toBe(false);
    });

    it('leaves the loaded document in place when a later load finds nothing', async () => {
      const get = jest
        .fn()
        .mockResolvedValueOnce(doc({ label: 'Kept' }))
        .mockResolvedValueOnce(null);
      const { store } = createStore({ documentLibraryGet: get });
      await store.load(7);
      await store.load(8);
      expect(store.loadError()).toBe(true);
      expect(store.doc()?.label).toBe('Kept');
    });

    it('clears a previous error when a later load succeeds', async () => {
      const get = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(doc());
      const { store } = createStore({ documentLibraryGet: get });
      await store.load(7);
      expect(store.loadError()).toBe(true);
      await store.load(7);
      expect(store.loadError()).toBe(false);
    });
  });

  describe('save', () => {
    it('writes the row the editor holds and keeps the saved document', async () => {
      const { store, letter, styles, db } = createStore();
      await store.load(7);
      store.label.set('New label');
      store.regionTag.set('us');
      letter.updateField('subject', 'Application');
      styles.updateStyle({ fontSizePt: 13 });

      const saved = await store.save();

      expect(db.documentLibraryUpsert).toHaveBeenCalledTimes(1);
      const input = db.documentLibraryUpsert.mock.calls[0][0];
      expect(input.label).toBe('New label');
      expect(input.regionTag).toBe('us');
      expect(JSON.parse(input.contentJson).subject).toBe('Application');
      expect(JSON.parse(input.styleJson).fontSizePt).toBe(13);
      expect(store.doc()).toBe(saved);
      expect(store.saving()).toBe(false);
    });

    it('does nothing without a loaded document', async () => {
      const { store, db } = createStore();
      await expect(store.save()).resolves.toBeNull();
      expect(db.documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('refuses a second save while the first is still running', async () => {
      const { store } = createStore();
      await store.load(7);
      const first = store.save();
      expect(store.saving()).toBe(true);
      await expect(store.save()).resolves.toBeNull();
      await first;
    });

    it('leaves siblings alone when this letter is not the default', async () => {
      const { store, db } = createStore();
      await store.load(7);
      await store.save();
      expect(db.documentLibraryList).not.toHaveBeenCalled();
      expect(db.documentLibraryUpsert).toHaveBeenCalledTimes(1);
    });

    it('displaces the other default in the same region before writing', async () => {
      const { store, db } = createStore({
        documentLibraryList: jest
          .fn()
          .mockResolvedValue([
            doc({ id: 8, isDefault: true, regionTag: 'de' }),
            doc({ id: 9, isDefault: true, regionTag: 'us' }),
          ]),
      });
      await store.load(7);
      store.isDefault.set(true);
      await store.save();

      expect(db.documentLibraryList).toHaveBeenCalledWith('cover_letter');
      expect(db.documentLibraryUpsert).toHaveBeenCalledTimes(2);
      const displaced = db.documentLibraryUpsert.mock.calls[0][0];
      expect(displaced.id).toBe(8);
      expect(displaced.isDefault).toBe(false);
      expect(db.documentLibraryUpsert.mock.calls[1][0].isDefault).toBe(true);
    });

    it('propagates a write failure and still clears the saving flag', async () => {
      const { store } = createStore({
        documentLibraryUpsert: jest.fn().mockRejectedValue(new Error('disk full')),
      });
      await store.load(7);
      await expect(store.save()).rejects.toThrow('disk full');
      expect(store.saving()).toBe(false);
    });
  });
});

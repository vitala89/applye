import { TestBed } from '@angular/core/testing';
import { COVER_LETTER_LENGTH_DEFAULT, COVER_LETTER_TONE_DEFAULT } from '@applye/core';
import type { DocumentLibraryItem } from '@applye/core';
import { DbService } from '@applye/data';
import { CoverLetterPrintStore } from './cover-letter-print.store';

const item = (over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem =>
  ({
    id: 5,
    docType: 'cover_letter',
    label: 'Letter',
    language: 'en',
    ...over,
  }) as DocumentLibraryItem;

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    documentLibraryGet: jest.fn().mockResolvedValue(item()),
    printWindowReady: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [CoverLetterPrintStore, { provide: DbService, useValue: db }],
  });
  return { store: TestBed.inject(CoverLetterPrintStore), db };
}

describe('CoverLetterPrintStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing until the row has loaded', () => {
    const { store } = createStore();
    expect(store.loaded()).toBe(false);
  });

  /**
   * The window stays blank rather than printing a default letter: the Rust side
   * times out and reports the failure, which is the honest outcome. Printing a
   * blank template would produce a PDF the user did not ask for.
   */
  it('reports a missing row without loading', async () => {
    const { store } = createStore({ documentLibraryGet: jest.fn().mockResolvedValue(null) });
    expect(await store.load(5)).toBe(false);
    expect(store.loaded()).toBe(false);
  });

  it('fills tone and length defaults the editor also fills', async () => {
    const { store } = createStore({
      documentLibraryGet: jest
        .fn()
        .mockResolvedValue(item({ contentJson: JSON.stringify({ subject: 'Hello' }) })),
    });
    await store.load(5);
    expect(store.content().subject).toBe('Hello');
    expect(store.content().tone).toBe(COVER_LETTER_TONE_DEFAULT);
    expect(store.content().length).toBe(COVER_LETTER_LENGTH_DEFAULT);
  });

  it('keeps a tone the document actually stored', async () => {
    const { store } = createStore({
      documentLibraryGet: jest
        .fn()
        .mockResolvedValue(item({ contentJson: JSON.stringify({ tone: 'enthusiastic' }) })),
    });
    await store.load(5);
    expect(store.content().tone).toBe('enthusiastic');
  });

  it('merges a partial style over the defaults rather than replacing them', async () => {
    const { store } = createStore({
      documentLibraryGet: jest
        .fn()
        .mockResolvedValue(item({ styleJson: JSON.stringify({ fontSizePt: 13 }) })),
    });
    await store.load(5);
    expect(store.style().fontSizePt).toBe(13);
    expect(store.style().fontFamily).toBeDefined();
  });

  /** The export must be fed the language the editor showed, or a German letter
   * prints with an English date. */
  it('takes the document language, falling back to en', async () => {
    const { store } = createStore({
      documentLibraryGet: jest.fn().mockResolvedValue(item({ language: 'de' })),
    });
    await store.load(5);
    expect(store.language()).toBe('de');

    const fallback = createStore({
      documentLibraryGet: jest.fn().mockResolvedValue(item({ language: undefined })),
    });
    await fallback.store.load(5);
    expect(fallback.store.language()).toBe('en');
  });

  it('tells the print window it is ready', async () => {
    const { store, db } = createStore();
    await store.notifyReady();
    expect(db.printWindowReady).toHaveBeenCalledTimes(1);
  });
});

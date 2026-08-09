import { TestBed } from '@angular/core/testing';
import type { CvContent, CvSection, DocumentLibraryItem } from '@applye/core';
import { DbService } from '@applye/data';
import { CvPrintStore } from './cv-print.store';

const item = (over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem =>
  ({ id: 5, docType: 'cv', label: 'CV', ...over }) as DocumentLibraryItem;

/** The identity normalizer: these tests are about what the store does with the
 * sections, not about `normalizeCvContent`, which has its own spec in the app. */
const identity = (content: CvContent): CvContent => content;

const sections = (...list: Partial<CvSection>[]): CvSection[] => list as CvSection[];

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    documentLibraryGet: jest.fn().mockResolvedValue(item()),
    printWindowReady: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [CvPrintStore, { provide: DbService, useValue: db }],
  });
  return { store: TestBed.inject(CvPrintStore), db };
}

function withContent(content: CvContent) {
  return createStore({
    documentLibraryGet: jest.fn().mockResolvedValue(item({ contentJson: JSON.stringify(content) })),
  });
}

describe('CvPrintStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing until the row has loaded', () => {
    const { store } = createStore();
    expect(store.loaded()).toBe(false);
  });

  it('reports a missing row without loading', async () => {
    const { store } = createStore({ documentLibraryGet: jest.fn().mockResolvedValue(null) });
    expect(await store.load(5, identity)).toBe(false);
    expect(store.loaded()).toBe(false);
  });

  /** The preview renders sections in array order, so a document whose stored
   * order disagrees with its array order must be sorted or the PDF is shuffled. */
  it('sorts sections by their order, not the order they were stored in', async () => {
    const { store } = withContent({
      sections: sections(
        { key: 'skills', order: 2 },
        { key: 'summary', order: 0 },
        { key: 'experience', order: 1 },
      ),
    } as CvContent);
    await store.load(5, identity);
    expect(store.sections().map((s) => s.key)).toEqual(['summary', 'experience', 'skills']);
  });

  it('takes the photo toggles from the photo section', async () => {
    const { store } = withContent({
      sections: sections({
        key: 'photo',
        order: 0,
        visible: true,
        dataUri: 'data:image/png;base64,x',
        placement: 'right',
      }),
    } as CvContent);
    await store.load(5, identity);
    expect(store.includePhoto()).toBe(true);
    expect(store.photoDataUri()).toBe('data:image/png;base64,x');
    expect(store.photoPlacement()).toBe('right');
  });

  it('prints no photo when the document has no photo section', async () => {
    const { store } = withContent({
      sections: sections({ key: 'summary', order: 0 }),
    } as CvContent);
    await store.load(5, identity);
    expect(store.includePhoto()).toBe(false);
    expect(store.photoDataUri()).toBeNull();
    expect(store.photoPlacement()).toBe('above_left');
  });

  /**
   * Birthdate and marital status are printed only when the document carries
   * them - these are personal details a user may deliberately have left out,
   * and an empty labelled row would look like a rendering fault.
   */
  it('includes personal details only when they have a value', async () => {
    const { store } = withContent({
      sections: sections({ key: 'personal_details', order: 0, birthDate: '1990-01-01' }),
    } as CvContent);
    await store.load(5, identity);
    expect(store.includeBirthdate()).toBe(true);
    expect(store.includeMaritalStatus()).toBe(false);
  });

  it('passes the raw content through the normalizer it is given', async () => {
    const normalize = jest.fn((c: CvContent) => c);
    const { store } = withContent({
      sections: sections({ key: 'summary', order: 0 }),
    } as CvContent);
    await store.load(5, normalize);
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it('seeds the style from the theme and lets the document override it', async () => {
    const { store } = createStore({
      documentLibraryGet: jest
        .fn()
        .mockResolvedValue(item({ themeId: 2, styleJson: JSON.stringify({ fontSizePt: 9 }) })),
    });
    await store.load(5, identity);
    expect(store.themeId()).toBe(2);
    expect(store.style().fontSizePt).toBe(9);
  });

  it('tells the print window it is ready', async () => {
    const { store, db } = createStore();
    await store.notifyReady();
    expect(db.printWindowReady).toHaveBeenCalledTimes(1);
  });
});

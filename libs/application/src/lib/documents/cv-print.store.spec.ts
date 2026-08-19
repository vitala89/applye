import { TestBed } from '@angular/core/testing';
import type { CvContent, CvSection, DocumentLibraryItem } from '@applye/core';
import { DbService, DocumentsGateway, JobsGateway } from '@applye/data';
import { CvPrintStore } from './cv-print.store';

const item = (over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem =>
  ({ id: 5, docType: 'cv', label: 'CV', ...over }) as DocumentLibraryItem;

const sections = (...list: Partial<CvSection>[]): CvSection[] => list as CvSection[];

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    documentLibraryGet: jest.fn().mockResolvedValue(item()),
    printWindowReady: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CvPrintStore,
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
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
    expect(await store.load(5)).toBe(false);
    expect(store.loaded()).toBe(false);
  });

  /** The preview renders sections in array order, so a document whose stored
   * order disagrees with its array order must be sorted or the PDF is shuffled.
   * `personal_details` leads because `normalizeCvContent` inserts it at order 0
   * when the stored document has none - see the migration test below. */
  it('sorts sections by their order, not the order they were stored in', async () => {
    const { store } = withContent({
      sections: sections(
        { key: 'skills', order: 2 },
        { key: 'summary', order: 0 },
        { key: 'experience', order: 1 },
      ),
    } as CvContent);
    await store.load(5);
    expect(store.sections().map((s) => s.key)).toEqual([
      'personal_details',
      'summary',
      'experience',
      'skills',
    ]);
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
    await store.load(5);
    expect(store.includePhoto()).toBe(true);
    expect(store.photoDataUri()).toBe('data:image/png;base64,x');
    expect(store.photoPlacement()).toBe('right');
  });

  it('prints no photo when the document has no photo section', async () => {
    const { store } = withContent({
      sections: sections({ key: 'summary', order: 0 }),
    } as CvContent);
    await store.load(5);
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
    await store.load(5);
    expect(store.includeBirthdate()).toBe(true);
    expect(store.includeMaritalStatus()).toBe(false);
  });

  /**
   * A CV stored before skills gained groups holds `items: string[]`. The print
   * window renders groups, so an unmigrated row would print an empty skills
   * section - the shape `normalizeCvContent` exists to repair, and the reason
   * this store runs it rather than rendering what the row literally holds.
   */
  it('migrates a legacy skills section into a group before rendering it', async () => {
    const { store } = withContent({
      sections: sections({
        key: 'skills',
        order: 1,
        visible: true,
        items: ['TypeScript', 'Rust'],
      }),
    } as unknown as CvContent);
    await store.load(5);
    const skills = store.sections().find((s) => s.key === 'skills') as Extract<
      CvSection,
      { key: 'skills' }
    >;
    expect(skills.groups).toEqual([{ label: 'Skills', values: ['TypeScript', 'Rust'] }]);
  });

  it('seeds the style from the theme and lets the document override it', async () => {
    const { store } = createStore({
      documentLibraryGet: jest
        .fn()
        .mockResolvedValue(item({ themeId: 2, styleJson: JSON.stringify({ fontSizePt: 9 }) })),
    });
    await store.load(5);
    expect(store.themeId()).toBe(2);
    expect(store.style().fontSizePt).toBe(9);
  });

  it('tells the print window it is ready', async () => {
    const { store, db } = createStore();
    await store.notifyReady();
    expect(db.printWindowReady).toHaveBeenCalledTimes(1);
  });
});

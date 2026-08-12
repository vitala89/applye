import { TestBed } from '@angular/core/testing';
import type { CvParsedContent, CvTemplate, DocumentLibraryItem } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { CvImportStore } from './cv-import.store';

const CVS = [
  { id: 1, source: 'uploaded', inputHash: 'known-hash' },
  { id: 2, source: 'generated', inputHash: 'generated-hash' },
] as DocumentLibraryItem[];

const TEMPLATES = [
  { id: 7, name: 'US modern', regionTag: 'us' },
  { id: 8, name: 'DE classic', regionTag: 'de' },
] as CvTemplate[];

const LABELS = { untitled: 'Untitled CV' };

const PARSED = {
  personalDetails: { fullName: 'Anna Schmidt' },
  experience: [],
  education: [],
  skills: [],
  languages: [],
  lowConfidenceNotes: [],
} as unknown as CvParsedContent;

/** What the `cv-import` skill answers. The store reads it with the real
 * `parseCvSkillResponse`, so the tests hand it text a model could actually
 * return rather than a stand-in that agrees with them by construction. */
const ANSWER = JSON.stringify({ personalDetails: { fullName: 'Anna Schmidt' } });

/** An answer the model could return for a CV with no name on it. */
const NAMELESS_ANSWER = JSON.stringify({ personalDetails: {}, summary: 'Engineer' });

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    cvImportReadFile: jest.fn().mockResolvedValue({ text: 'CV text', inputHash: 'fresh-hash' }),
    getSettings: jest.fn().mockResolvedValue({
      uiLanguage: 'de',
      defaultDocLanguage: 'fr',
      aiMode: 'api',
      provider: 'openai',
      economyModel: 'small',
    }),
    documentLibraryUpsert: jest.fn().mockResolvedValue({ id: 42 }),
    ...over,
  };
  const ai = {
    renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
    run: jest.fn().mockResolvedValue({ text: ANSWER }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CvImportStore,
      { provide: DbService, useValue: db },
      { provide: AiService, useValue: ai },
    ],
  });
  return { store: TestBed.inject(CvImportStore), db, ai };
}

describe('CvImportStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('opening', () => {
    it('opens on a clean slate', () => {
      const { store } = createStore();
      store.step.set('done');
      store.error.set('an older failure');
      store.parsed.set(PARSED);
      store.existingId.set(3);

      store.start();

      expect(store.open()).toBe(true);
      expect(store.step()).toBe('pick');
      expect(store.error()).toBe('');
      expect(store.parsed()).toBeNull();
      expect(store.existingId()).toBeNull();
    });
  });

  describe('reading the picked file', () => {
    it('parses into the preview step and adopts the configured defaults', async () => {
      const { store, ai } = createStore();

      expect(await store.parseFile('/tmp/cv.pdf', CVS, TEMPLATES, LABELS)).toBe('parsed');

      expect(ai.renderSkill).toHaveBeenCalledWith(
        'cv-import',
        expect.objectContaining({ cv_text: 'CV text', language: 'de' }),
      );
      expect(store.step()).toBe('preview');
      expect(store.label()).toBe('Anna Schmidt');
      expect(store.inputHash()).toBe('fresh-hash');
      expect(store.language()).toBe('fr');
      expect(store.templateId()).toBe(8);
      expect(store.busy()).toBe(false);
    });

    it('falls back to the page label when the CV carries no name', async () => {
      const { store } = createStore({
        run: jest.fn().mockResolvedValue({ text: NAMELESS_ANSWER }),
      });

      await store.parseFile('/tmp/cv.pdf', CVS, TEMPLATES, LABELS);

      expect(store.label()).toBe('Untitled CV');
    });

    /** The whole point of hashing first: recognising the file must not cost an
     * AI call the user already paid for once. */
    it('recognises an already-imported file before calling the model', async () => {
      const { store, ai } = createStore({
        cvImportReadFile: jest.fn().mockResolvedValue({ text: 'x', inputHash: 'known-hash' }),
      });
      store.open.set(true);

      expect(await store.parseFile('/tmp/cv.pdf', CVS, TEMPLATES, LABELS)).toBe('existing');

      expect(ai.run).not.toHaveBeenCalled();
      expect(store.existingId()).toBe(1);
      expect(store.open()).toBe(false);
      expect(store.error()).toBe('');
    });

    /** A generated document sharing a hash is not the same thing as having
     * imported this file before. */
    it('ignores a matching hash on a document that was not uploaded', async () => {
      const { store, ai } = createStore({
        cvImportReadFile: jest.fn().mockResolvedValue({ text: 'x', inputHash: 'generated-hash' }),
      });

      expect(await store.parseFile('/tmp/cv.pdf', CVS, TEMPLATES, LABELS)).toBe('parsed');
      expect(ai.run).toHaveBeenCalled();
    });

    it('reports an unreadable answer as a failure', async () => {
      const { store } = createStore({
        run: jest.fn().mockResolvedValue({ text: 'I could not read that CV' }),
      });

      expect(await store.parseFile('/tmp/cv.pdf', CVS, TEMPLATES, LABELS)).toBe('failed');
      // The real parser puts the model's own words in the message, which is what
      // makes the failure actionable rather than "something went wrong".
      expect(store.error()).toContain('invalid JSON');
      expect(store.error()).toContain('I could not read that CV');
      expect(store.busy()).toBe(false);
    });

    it('refuses a second parse and clears what the last failure said', async () => {
      const { store, db } = createStore();
      store.error.set('an older failure');
      store.busy.set(true);

      expect(await store.parseFile('/tmp/cv.pdf', CVS, TEMPLATES, LABELS)).toBe('busy');

      expect(store.error()).toBe('');
      expect(db.cvImportReadFile).not.toHaveBeenCalled();
    });
  });

  describe('saving the preview', () => {
    it('writes the CV against the chosen template and reaches the done step', async () => {
      const { store, db } = createStore();
      store.parsed.set(PARSED);
      store.label.set('Anna Schmidt');
      store.inputHash.set('fresh-hash');
      store.regionTag.set('us');
      store.templateId.set(7);

      expect(await store.save(TEMPLATES)).toBe('saved');

      // The row carries the laid-out content, not the parsed answer: what is
      // asserted is that the real `buildCvContent` ran over what was previewed.
      const written = JSON.parse(db.documentLibraryUpsert.mock.calls[0][0].contentJson);
      const personal = written.sections.find((s: { key: string }) => s.key === 'personal_details');
      expect(personal.fullName).toBe('Anna Schmidt');
      expect(db.documentLibraryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: 'cv',
          source: 'uploaded',
          label: 'Anna Schmidt',
          templateId: 7,
          regionTag: 'us',
          inputHash: 'fresh-hash',
        }),
      );
      expect(store.step()).toBe('done');
    });

    it('refuses when nothing was parsed', async () => {
      const { store, db } = createStore();
      store.error.set('an older failure');

      expect(await store.save(TEMPLATES)).toBe('busy');

      expect(store.error()).toBe('');
      expect(db.documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('reports a failure and stays on the preview step', async () => {
      const { store } = createStore({
        documentLibraryUpsert: jest.fn().mockRejectedValue(new Error('disk')),
      });
      store.parsed.set(PARSED);
      store.step.set('preview');

      expect(await store.save(TEMPLATES)).toBe('failed');
      expect(store.error()).toContain('disk');
      expect(store.step()).toBe('preview');
      expect(store.busy()).toBe(false);
    });
  });
});

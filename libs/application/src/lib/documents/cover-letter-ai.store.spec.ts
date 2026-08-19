import { TestBed } from '@angular/core/testing';
import type { CoverLetterContent, DocumentLibraryItem } from '@applye/core';
import { AiService, DbService, DocumentsGateway, JobsGateway, SystemGateway } from '@applye/data';
import { CoverLetterAiStore } from './cover-letter-ai.store';
import { CoverLetterContentStore } from './cover-letter-content.store';
import { CoverLetterDocumentStore } from './cover-letter-document.store';
import { CoverLetterNoProfileError } from './cover-letter-generation';
import { CoverLetterStyleStore } from './cover-letter-style.store';

function doc(over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem {
  return {
    id: 7,
    docType: 'cover_letter',
    source: 'generated',
    label: 'Letter',
    regionTag: 'de',
    language: 'de',
    isDefault: false,
    ...over,
  } as DocumentLibraryItem;
}

/** What the model answers. It is serialised into `ai.run`'s reply and read back
 * by the store's own `parseCoverLetterResponse`, so a test that sets a letter
 * here is also exercising the real parse rather than agreeing with a stub. */
let answer: Partial<CoverLetterContent> = {};

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    documentLibraryGet: jest.fn().mockResolvedValue(doc()),
    documentLibraryList: jest.fn().mockResolvedValue([]),
    documentLibraryUpsert: jest.fn((input) => Promise.resolve({ ...doc(), ...input })),
    checkStyleSafety: jest.fn().mockResolvedValue([]),
    getProfile: jest.fn().mockResolvedValue({ fullMd: '# Profile' }),
    getSettings: jest.fn().mockResolvedValue({
      aiMode: 'local',
      provider: 'ollama',
      defaultModel: 'llama',
      defaultDocLanguage: 'pl',
    }),
    hashText: jest.fn().mockResolvedValue('hash-1'),
    ...over,
  };
  const ai = {
    renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 'sys', userPrompt: 'usr' }),
    run: jest.fn(() => Promise.resolve({ text: JSON.stringify(answer) })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CoverLetterAiStore,
      CoverLetterContentStore,
      CoverLetterDocumentStore,
      // The document store hands the loaded row's style to this one; the AI
      // paths never touch it, but the injector still has to resolve it.
      CoverLetterStyleStore,
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: SystemGateway, useValue: db },
      { provide: AiService, useValue: ai },
    ],
  });
  return {
    store: TestBed.inject(CoverLetterAiStore),
    letter: TestBed.inject(CoverLetterContentStore),
    document: TestBed.inject(CoverLetterDocumentStore),
    db,
    ai,
  };
}

describe('CoverLetterAiStore', () => {
  beforeEach(() => {
    answer = {};
  });
  afterEach(() => TestBed.resetTestingModule());

  it('starts idle', () => {
    const { store } = createStore();
    expect(store.drafting()).toBe(false);
    expect(store.regeneratingBlock()).toBeNull();
  });

  describe('draftWithAI', () => {
    it('does nothing without a loaded document', async () => {
      const { store, ai } = createStore();
      await expect(store.draftWithAI()).resolves.toBe(false);
      expect(ai.run).not.toHaveBeenCalled();
    });

    it('asks for the whole letter with the current tone and length', async () => {
      const { store, letter, document, ai } = createStore();
      await document.load(7);
      letter.setTone('Enthusiastic');
      letter.setLength('Detailed');

      await expect(store.draftWithAI()).resolves.toBe(true);

      expect(ai.renderSkill).toHaveBeenCalledWith('cover-letter-generate', {
        profile_md: '# Profile',
        job_description: 'General job application',
        language: 'de',
        section: 'all',
        tone: 'Enthusiastic',
        length: 'Detailed',
        earliest_start: '',
        salary_expectation: '',
        notice_period: '',
      });
      expect(store.drafting()).toBe(false);
    });

    it("sends the document's language, not the user's default", async () => {
      const { store, document, ai } = createStore();
      await document.load(7);
      await store.draftWithAI();
      expect(ai.run.mock.calls[0][0].language).toBe('de');
    });

    it("falls back to the user's default when the document has none", async () => {
      const { store, document, ai } = createStore({
        documentLibraryGet: jest.fn().mockResolvedValue(doc({ language: undefined })),
      });
      await document.load(7);
      await store.draftWithAI();
      expect(ai.run.mock.calls[0][0].language).toBe('pl');
    });

    it('sends the pasted job description when there is one', async () => {
      const { store, letter, document, ai } = createStore();
      await document.load(7);
      letter.updateField('jobDescription', 'Senior Angular dev');
      await store.draftWithAI();
      expect(ai.renderSkill.mock.calls[0][1].job_description).toBe('Senior Angular dev');
    });

    it("writes the model's letter into the content store", async () => {
      const { store, letter, document } = createStore();
      await document.load(7);
      answer = { subject: 'Drafted', bodyParagraphs: ['One.'] };
      await store.draftWithAI();
      expect(letter.content().subject).toBe('Drafted');
      expect(letter.content().bodyParagraphs).toEqual(['One.']);
    });

    it('never saves - the user reviews and decides', async () => {
      const { store, document, db } = createStore();
      await document.load(7);
      await store.draftWithAI();
      expect(db.documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('raises a typed error for a profile with no markdown, and calls no model', async () => {
      const { store, document, ai } = createStore({
        getProfile: jest.fn().mockResolvedValue({ fullMd: '' }),
      });
      await document.load(7);
      await expect(store.draftWithAI()).rejects.toBeInstanceOf(CoverLetterNoProfileError);
      expect(ai.run).not.toHaveBeenCalled();
      expect(store.drafting()).toBe(false);
    });

    it('raises the same typed error when there is no profile at all', async () => {
      const { store, document } = createStore({
        getProfile: jest.fn().mockResolvedValue(null),
      });
      await document.load(7);
      await expect(store.draftWithAI()).rejects.toBeInstanceOf(CoverLetterNoProfileError);
    });

    it('clears the flag when the model call fails', async () => {
      const { store, document, ai } = createStore();
      await document.load(7);
      ai.run.mockRejectedValueOnce(new Error('model offline'));
      await expect(store.draftWithAI()).rejects.toThrow('model offline');
      expect(store.drafting()).toBe(false);
    });

    it('refuses to start while a draft is already running', async () => {
      const { store, document } = createStore();
      await document.load(7);
      const first = store.draftWithAI();
      expect(store.drafting()).toBe(true);
      await expect(store.draftWithAI()).resolves.toBe(false);
      await first;
    });

    it('refuses to start while a block is regenerating', async () => {
      const { store, document } = createStore();
      await document.load(7);
      const first = store.regenerateBlock('greeting', undefined);
      await expect(store.draftWithAI()).resolves.toBe(false);
      await first;
    });
  });

  describe('regenerateBlock', () => {
    it('does nothing without a loaded document', async () => {
      const { store, ai } = createStore();
      await expect(store.regenerateBlock('greeting', undefined)).resolves.toBe(false);
      expect(ai.run).not.toHaveBeenCalled();
    });

    it('asks for the named block and writes it back', async () => {
      const { store, letter, document, ai } = createStore();
      await document.load(7);
      answer = { greeting: 'Sehr geehrte Damen und Herren,' };

      await expect(store.regenerateBlock('greeting', undefined)).resolves.toBe(true);

      expect(ai.renderSkill.mock.calls[0][1].section).toBe('greeting');
      expect(letter.content().greeting).toBe('Sehr geehrte Damen und Herren,');
      expect(letter.content().hashes?.greeting).toBe('hash-1');
      expect(store.regeneratingBlock()).toBeNull();
    });

    it('addresses a body paragraph by position, in the skill and in the flag', async () => {
      const { store, document, ai } = createStore();
      await document.load(7);
      let seen: string | null = null;
      ai.renderSkill.mockImplementation(() => {
        seen = store.regeneratingBlock();
        return Promise.resolve({ systemPrompt: 's', userPrompt: 'u' });
      });
      await store.regenerateBlock('body', 1);
      expect(seen).toBe('body_1');
      expect(ai.renderSkill.mock.calls[0][1].section).toBe('body_1');
    });

    it('skips the call when the stored hash already matches these inputs', async () => {
      const { store, letter, document, ai } = createStore();
      await document.load(7);
      letter.content.set({ ...letter.content(), hashes: { greeting: 'hash-1' } });

      await expect(store.regenerateBlock('greeting', undefined)).resolves.toBe(false);

      expect(ai.renderSkill).not.toHaveBeenCalled();
      expect(ai.run).not.toHaveBeenCalled();
      expect(store.regeneratingBlock()).toBeNull();
    });

    it('calls the model when the stored hash is for different inputs', async () => {
      const { store, letter, document, ai } = createStore();
      await document.load(7);
      letter.content.set({ ...letter.content(), hashes: { greeting: 'stale' } });
      await expect(store.regenerateBlock('greeting', undefined)).resolves.toBe(true);
      expect(ai.run).toHaveBeenCalled();
    });

    it('folds tone, length and the availability answers into the hash', async () => {
      const { store, letter, document, db } = createStore();
      await document.load(7);
      letter.setTone('Friendly');
      letter.updateField('earliestStart', 'ab sofort');
      await store.regenerateBlock('greeting', undefined);

      const hashed = db.hashText.mock.calls[0][0] as string;
      expect(hashed).toContain('Friendly');
      expect(hashed).toContain('ab sofort');
      expect(hashed).toContain('greeting');
    });

    it('never saves', async () => {
      const { store, document, db } = createStore();
      await document.load(7);
      await store.regenerateBlock('greeting', undefined);
      expect(db.documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('raises a typed error for a profile with no markdown, and calls no model', async () => {
      const { store, document, ai } = createStore({
        getProfile: jest.fn().mockResolvedValue({ fullMd: '' }),
      });
      await document.load(7);
      await expect(store.regenerateBlock('greeting', undefined)).rejects.toBeInstanceOf(
        CoverLetterNoProfileError,
      );
      expect(ai.run).not.toHaveBeenCalled();
      expect(store.regeneratingBlock()).toBeNull();
    });

    it('clears the flag when the model call fails', async () => {
      const { store, document, ai } = createStore();
      await document.load(7);
      ai.run.mockRejectedValueOnce(new Error('model offline'));
      await expect(store.regenerateBlock('greeting', undefined)).rejects.toThrow('model offline');
      expect(store.regeneratingBlock()).toBeNull();
    });

    it('refuses a second block while one is regenerating', async () => {
      const { store, document } = createStore();
      await document.load(7);
      const first = store.regenerateBlock('greeting', undefined);
      await expect(store.regenerateBlock('closing', undefined)).resolves.toBe(false);
      await first;
    });

    it('refuses to start while a draft is running', async () => {
      const { store, document } = createStore();
      await document.load(7);
      const first = store.draftWithAI();
      await expect(store.regenerateBlock('greeting', undefined)).resolves.toBe(false);
      await first;
    });
  });
});

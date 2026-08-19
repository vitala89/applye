import { TestBed } from '@angular/core/testing';
import type { Job } from '@applye/core';
import { AiService, DbService, DocumentsGateway } from '@applye/data';
import { CoverLetterGenerateStore } from './cover-letter-generate.store';

const JOBS = [
  { id: 5, company: 'Acme', title: 'Engineer', jdText: 'Build things' },
  { id: 6, company: 'Globex', title: 'Designer', jdText: '' },
] as Job[];

const LABELS = { documentLabel: 'Acme - Cover letter' };
const CODEC = { parse: (text: string) => JSON.parse(text) };

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    getSettings: jest.fn().mockResolvedValue({
      defaultDocLanguage: 'de',
      aiMode: 'api',
      provider: 'openai',
      defaultModel: 'big',
    }),
    getProfile: jest.fn().mockResolvedValue({ fullMd: '# Anna' }),
    documentLibraryUpsert: jest.fn().mockResolvedValue({ id: 42 }),
    ...over,
  };
  const ai = {
    renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
    run: jest
      .fn()
      .mockResolvedValue({ text: '{"greeting":"Hi"}', tokensInput: 10, tokensOutput: 20 }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CoverLetterGenerateStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: AiService, useValue: ai },
    ],
  });
  return { store: TestBed.inject(CoverLetterGenerateStore), db, ai };
}

describe('CoverLetterGenerateStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('opening', () => {
    it('adopts the configured document language', async () => {
      const { store } = createStore();

      await store.start();

      expect(store.language()).toBe('de');
      expect(store.open()).toBe(true);
    });

    /** A failed settings read only means the language stays at its default;
     * refusing to open the modal over that would be the worse answer. */
    it('still opens when settings cannot be read', async () => {
      const { store } = createStore({ getSettings: jest.fn().mockRejectedValue(new Error('x')) });

      await store.start();

      expect(store.open()).toBe(true);
      expect(store.language()).toBe('en');
    });

    it('clears what the last run left behind', async () => {
      const { store } = createStore();
      store.customJdText.set('old text');
      store.selectedJobId.set(5);

      await store.start();

      expect(store.customJdText()).toBe('');
      expect(store.selectedJobId()).toBeNull();
      expect(store.createdId()).toBeNull();
    });
  });

  describe('what the letter is written against', () => {
    it('uses the selected job description over anything typed', async () => {
      const { store, ai } = createStore();
      store.selectedJobId.set(5);
      store.customJdText.set('ignored');

      await store.generate(JOBS, LABELS, CODEC);

      expect(ai.renderSkill).toHaveBeenCalledWith(
        'cover-letter-generate',
        expect.objectContaining({ job_description: 'Build things', section: 'all' }),
      );
    });

    /** A job with no pasted description still has to send something stable, or
     * the cache key moves under the model. */
    it('falls back to the placeholder for a job with no description', async () => {
      const { store, ai } = createStore();
      store.selectedJobId.set(6);

      await store.generate(JOBS, LABELS, CODEC);

      expect(ai.renderSkill).toHaveBeenCalledWith(
        'cover-letter-generate',
        expect.objectContaining({ job_description: 'General job application' }),
      );
    });

    it('uses the pasted text when no job is picked', async () => {
      const { store, ai } = createStore();
      store.customJdText.set('  Pasted posting  ');

      await store.generate(JOBS, LABELS, CODEC);

      expect(ai.renderSkill).toHaveBeenCalledWith(
        'cover-letter-generate',
        expect.objectContaining({ job_description: 'Pasted posting' }),
      );
    });

    it('names the selected company for the page to label with', () => {
      const { store } = createStore();
      store.selectedJobId.set(5);

      expect(store.selectedCompany(JOBS)).toBe('Acme');
      store.selectedJobId.set(null);
      expect(store.selectedCompany(JOBS)).toBe('');
    });
  });

  describe('outcomes', () => {
    /**
     * A missing profile is a refusal rather than a failure - the user has not
     * done something yet - so nothing is written to `error` and the older
     * neighbour's thrown `CoverLetterNoProfileError` is deliberately not used
     * here.
     */
    it('reports no-profile without calling the model', async () => {
      const { store, ai } = createStore({ getProfile: jest.fn().mockResolvedValue(null) });

      expect(await store.generate(JOBS, LABELS, CODEC)).toBe('no-profile');
      expect(ai.run).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('reports bad-json with a truncated excerpt of what came back', async () => {
      const { store } = createStore({
        run: jest
          .fn()
          .mockResolvedValue({ text: 'x'.repeat(500), tokensInput: 1, tokensOutput: 1 }),
      });
      store.open.set(true);

      expect(await store.generate(JOBS, LABELS, CODEC)).toBe('bad-json');
      expect(store.error()).toBe('x'.repeat(100));
      expect(store.open()).toBe(true);
    });

    it('writes the document, records its id and closes', async () => {
      const { store, db } = createStore();
      store.regionTag.set('uk');

      expect(await store.generate(JOBS, LABELS, CODEC)).toBe('generated');
      expect(db.documentLibraryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: 'cover_letter',
          source: 'generated',
          label: 'Acme - Cover letter',
          regionTag: 'uk',
          modelUsed: 'big',
          tokensInput: 10,
          tokensOutput: 20,
        }),
      );
      expect(store.createdId()).toBe(42);
      expect(store.open()).toBe(false);
    });

    it('reports a failure and leaves the modal open', async () => {
      const { store } = createStore({
        documentLibraryUpsert: jest.fn().mockRejectedValue(new Error('disk')),
      });
      store.open.set(true);

      expect(await store.generate(JOBS, LABELS, CODEC)).toBe('failed');
      expect(store.error()).toContain('disk');
      expect(store.open()).toBe(true);
      expect(store.busy()).toBe(false);
    });

    it('refuses a second run while one is in flight', async () => {
      const { store } = createStore();
      store.busy.set(true);

      expect(await store.generate(JOBS, LABELS, CODEC)).toBe('busy');
    });
  });
});

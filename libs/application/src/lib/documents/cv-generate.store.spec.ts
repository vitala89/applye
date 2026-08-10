import { TestBed } from '@angular/core/testing';
import type { Application, CvParsedContent, CvTemplate, Job } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { CvGenerateStore } from './cv-generate.store';

const JOBS = [{ id: 5, company: 'Acme', title: 'Engineer', jdText: 'Build things' }] as Job[];
const TEMPLATES = [
  { id: 7, name: 'US modern', regionTag: 'us' },
  { id: 8, name: 'DE classic', regionTag: 'de' },
] as CvTemplate[];
const APPS = [{ id: 3, jobId: 5 }] as Application[];
const LABELS = { documentLabel: 'Engineer - Acme' };

const PARSED = { personalDetails: {} } as unknown as CvParsedContent;

const CODEC = {
  parse: jest.fn(() => PARSED),
  buildContent: jest.fn(() => ({ sections: [] })),
  cleanScoring: jest.fn((text: string) => text),
};

function createStore(over: Record<string, jest.Mock> = {}) {
  CODEC.parse.mockClear();
  CODEC.buildContent.mockClear();
  CODEC.cleanScoring.mockClear();
  const db = {
    getProfile: jest.fn().mockResolvedValue({
      fullMd: '# Anna',
      scoringJson: '{"fit":8}',
      targetArchetypes: '["backend","data"]',
    }),
    getSettings: jest.fn().mockResolvedValue({
      defaultDocLanguage: 'fr',
      aiMode: 'api',
      provider: 'openai',
      defaultModel: 'big',
    }),
    documentLibraryUpsert: jest.fn().mockResolvedValue({ id: 42 }),
    listApplications: jest.fn().mockResolvedValue(APPS),
    upsertApplication: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  const ai = {
    renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
    run: jest.fn().mockResolvedValue({ text: '{}', tokensInput: 10, tokensOutput: 20 }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CvGenerateStore,
      { provide: DbService, useValue: db },
      { provide: AiService, useValue: ai },
    ],
  });
  return { store: TestBed.inject(CvGenerateStore), db, ai };
}

describe('CvGenerateStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('opening', () => {
    it('adopts the first target archetype, the document language and a regional template', async () => {
      const { store } = createStore();

      expect(await store.start(TEMPLATES)).toBe(true);

      expect(store.archetypeTag()).toBe('backend');
      expect(store.language()).toBe('fr');
      expect(store.templateId()).toBe(8);
      expect(store.open()).toBe(true);
    });

    it('falls back to the first template when no region matches', async () => {
      const { store } = createStore();
      store.regionTag.set('uk');

      await store.start(TEMPLATES);

      expect(store.templateId()).toBe(7);
    });

    /** The modal opens either way - refusing over unreadable defaults would be
     * the worse answer - but the page is told, because it toasts. */
    it('opens and reports when the defaults cannot be read', async () => {
      const { store } = createStore({ getProfile: jest.fn().mockRejectedValue(new Error('x')) });

      expect(await store.start(TEMPLATES)).toBe(false);

      expect(store.open()).toBe(true);
      expect(store.error()).toContain('x');
    });

    it('clears what the last run left behind', async () => {
      const { store } = createStore();
      store.selectedJobId.set(5);
      store.createdId.set(99);

      await store.start(TEMPLATES);

      expect(store.selectedJobId()).toBeNull();
      expect(store.createdId()).toBeNull();
    });
  });

  describe('what the CV is written against', () => {
    it('sends the profile scoring untouched for a general CV', async () => {
      const { store, ai } = createStore();
      store.archetypeTag.set('backend');

      await store.generate(JOBS, TEMPLATES, LABELS, CODEC);

      expect(ai.renderSkill).toHaveBeenCalledWith(
        'cv-generate-baseline',
        expect.objectContaining({
          scoring_json: '{"fit":8}',
          archetype_tag: 'backend',
          section: 'all',
        }),
      );
    });

    it('wraps the posting and the profile scoring together when a job is picked', async () => {
      const { store, ai } = createStore();
      store.selectedJobId.set(5);

      await store.generate(JOBS, TEMPLATES, LABELS, CODEC);

      expect(CODEC.cleanScoring).toHaveBeenCalledWith('{"fit":8}');
      const args = ai.renderSkill.mock.calls[0][1] as { scoring_json: string };
      expect(JSON.parse(args.scoring_json)).toEqual({
        targetJobTitle: 'Engineer',
        targetCompany: 'Acme',
        jobDescription: 'Build things',
        originalScoring: { fit: 8 },
      });
    });

    /** A profile that never scored is not a reason to refuse a CV. */
    it('sends an empty scoring object when the stored scoring is unreadable', async () => {
      const { store, ai } = createStore();
      store.selectedJobId.set(5);
      CODEC.cleanScoring.mockReturnValueOnce('{not json');

      await store.generate(JOBS, TEMPLATES, LABELS, CODEC);

      const args = ai.renderSkill.mock.calls[0][1] as { scoring_json: string };
      expect(JSON.parse(args.scoring_json).originalScoring).toEqual({});
    });

    it('sends a generalist archetype when the field was left empty', async () => {
      const { store, ai } = createStore();
      store.archetypeTag.set('');

      await store.generate(JOBS, TEMPLATES, LABELS, CODEC);

      expect(ai.renderSkill).toHaveBeenCalledWith(
        'cv-generate-baseline',
        expect.objectContaining({ archetype_tag: 'generalist' }),
      );
    });

    it('names the selected job for the page to label with', () => {
      const { store } = createStore();

      expect(store.selectedJob(JOBS)).toBeNull();
      store.selectedJobId.set(5);
      expect(store.selectedJob(JOBS)).toEqual(JOBS[0]);
    });
  });

  describe('outcomes', () => {
    it('reports no-profile without calling the model, and says nothing', async () => {
      const { store, ai } = createStore({ getProfile: jest.fn().mockResolvedValue(null) });

      expect(await store.generate(JOBS, TEMPLATES, LABELS, CODEC)).toBe('no-profile');
      expect(ai.run).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    it('reports bad-json and leaves the modal open', async () => {
      CODEC.parse.mockImplementationOnce(() => {
        throw new Error('AI returned invalid JSON');
      });
      const { store, db } = createStore();
      store.open.set(true);

      expect(await store.generate(JOBS, TEMPLATES, LABELS, CODEC)).toBe('bad-json');

      expect(store.error()).toContain('invalid JSON');
      expect(store.open()).toBe(true);
      expect(db.documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('writes the document, records its id and closes', async () => {
      const { store, db } = createStore();
      store.regionTag.set('us');
      store.templateId.set(7);
      store.archetypeTag.set('backend');

      expect(await store.generate(JOBS, TEMPLATES, LABELS, CODEC)).toBe('generated');

      expect(CODEC.buildContent).toHaveBeenCalledWith(PARSED, TEMPLATES[0]);
      expect(db.documentLibraryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: 'cv',
          source: 'generated',
          label: 'Engineer - Acme',
          templateId: 7,
          regionTag: 'us',
          archetypeTag: 'backend',
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

      expect(await store.generate(JOBS, TEMPLATES, LABELS, CODEC)).toBe('failed');
      expect(store.error()).toContain('disk');
      expect(store.open()).toBe(true);
      expect(store.busy()).toBe(false);
    });

    it('refuses a second run and clears what the last failure said', async () => {
      const { store, ai } = createStore();
      store.error.set('an older failure');
      store.busy.set(true);

      expect(await store.generate(JOBS, TEMPLATES, LABELS, CODEC)).toBe('busy');

      expect(store.error()).toBe('');
      expect(ai.run).not.toHaveBeenCalled();
    });
  });

  describe('linking the CV to the job it was written for', () => {
    /** A caller that had to remember a second step would eventually forget it,
     * and an unlinked CV looks identical to a linked one. */
    it('attaches the new document to the job application in the same call', async () => {
      const { store, db } = createStore();
      store.selectedJobId.set(5);

      await store.generate(JOBS, TEMPLATES, LABELS, CODEC);

      expect(db.upsertApplication).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, jobId: 5, cvDocumentId: 42 }),
      );
    });

    it('links nothing for a general CV', async () => {
      const { store, db } = createStore();

      await store.generate(JOBS, TEMPLATES, LABELS, CODEC);

      expect(db.listApplications).not.toHaveBeenCalled();
      expect(db.upsertApplication).not.toHaveBeenCalled();
    });

    it('leaves a job with no application row alone', async () => {
      const { store, db } = createStore({ listApplications: jest.fn().mockResolvedValue([]) });
      store.selectedJobId.set(5);

      expect(await store.generate(JOBS, TEMPLATES, LABELS, CODEC)).toBe('generated');
      expect(db.upsertApplication).not.toHaveBeenCalled();
    });
  });
});

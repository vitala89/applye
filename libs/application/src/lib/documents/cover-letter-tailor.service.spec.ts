import { TestBed } from '@angular/core/testing';
import { AiService, DocumentsGateway, JobsGateway } from '@applye/data';
import { CoverLetterTailorContext, CoverLetterTailorService } from './cover-letter-tailor.service';

describe('CoverLetterTailorService', () => {
  let svc: CoverLetterTailorService;
  let skills: { skill: string; vars: Record<string, string> }[];
  let upserted: Record<string, unknown>[];
  let applications: Record<string, unknown>[];
  let listed: number;
  let aiText: string;

  const JOB = { id: 7, company: 'Acme', title: 'Engineer', jdText: 'JD' };
  const PROFILE = { fullMd: 'PROFILE' };
  const SETTINGS = { aiMode: 'cloud', provider: 'anthropic', defaultModel: 'big' };

  const LETTERS = [
    {
      id: 11,
      language: 'de',
      isDefault: false,
      regionTag: 'de',
      contentJson: JSON.stringify({ bodyParagraphs: ['DE'] }),
    },
    {
      id: 22,
      language: 'en',
      isDefault: true,
      regionTag: 'uk',
      contentJson: JSON.stringify({ bodyParagraphs: ['BASE'] }),
    },
  ];

  function context(overrides: Partial<CoverLetterTailorContext> = {}): CoverLetterTailorContext {
    return {
      job: JOB,
      profile: PROFILE,
      settings: SETTINGS,
      letters: LETTERS,
      application: { id: 3, jobId: 7, coverLetterDocumentId: null },
      label: (job) => `${job.company} - Tailored Cover Letter`,
      ...overrides,
    } as unknown as CoverLetterTailorContext;
  }

  beforeEach(() => {
    skills = [];
    upserted = [];
    applications = [];
    listed = 0;
    aiText = '{"bodyParagraphs":["TAILORED"]}';

    const db = {
      documentLibraryList: () => {
        listed += 1;
        return Promise.resolve(LETTERS);
      },
      documentLibraryUpsert: (d: Record<string, unknown>) => {
        upserted.push(d);
        return Promise.resolve({ ...d, id: 99 });
      },
      upsertApplication: (a: Record<string, unknown>) => {
        applications.push(a);
        return Promise.resolve({ ...a });
      },
    };
    const ai = {
      renderSkill: (skill: string, vars: Record<string, string>) => {
        skills.push({ skill, vars });
        return Promise.resolve({ systemPrompt: 's', userPrompt: 'u' });
      },
      run: () => Promise.resolve({ text: aiText, tokensInput: 10, tokensOutput: 20 }),
    };

    TestBed.configureTestingModule({
      providers: [
        CoverLetterTailorService,
        { provide: JobsGateway, useValue: db },
        { provide: DocumentsGateway, useValue: db },
        { provide: AiService, useValue: ai },
      ],
    });

    svc = TestBed.inject(CoverLetterTailorService);
  });

  describe('prepare', () => {
    it('preselects the default letter in the settings language', async () => {
      const letters = await svc.prepare({ defaultDocLanguage: 'en' } as never);

      expect(letters).toBe(LETTERS);
      expect(svc.modalOpen()).toBe(true);
      expect(svc.language()).toBe('en');
      expect(svc.selectedId()).toBe(22);
    });

    it('falls back to any letter in that language when none is the default', async () => {
      await svc.prepare({ defaultDocLanguage: 'de' } as never);

      expect(svc.selectedId()).toBe(11);
    });

    it('opens with the list untouched when the library read fails', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          CoverLetterTailorService,
          { provide: JobsGateway, useValue: { documentLibraryList: () => Promise.reject('down') } },
          { provide: AiService, useValue: {} },
        ],
      });
      const failing = TestBed.inject(CoverLetterTailorService);

      expect(await failing.prepare(null)).toBeNull();
      expect(failing.modalOpen()).toBe(true);
      expect(failing.error()).toBe('');
    });
  });

  describe('run', () => {
    it('rewrites the body of the selected letter and keeps its region', async () => {
      await svc.prepare({ defaultDocLanguage: 'en' } as never);
      const result = await svc.run(context());

      expect(svc.error()).toBe('');
      expect(skills[0].skill).toBe('cover-letter-tailor');
      expect(skills[0].vars['body_paragraphs']).toBe(JSON.stringify(['BASE']));
      expect(upserted[0]['regionTag']).toBe('uk');
      expect(JSON.parse(upserted[0]['contentJson'] as string).bodyParagraphs).toEqual(['TAILORED']);
      expect(result?.document.id).toBe(99);
    });

    it('generates a whole letter when no base letter is selected', async () => {
      aiText = '{"bodyParagraphs":["FRESH"],"subject":"NEW SUBJ","greeting":"Hallo"}';
      const result = await svc.run(context());

      expect(skills[0].skill).toBe('cover-letter-generate');
      const content = JSON.parse(upserted[0]['contentJson'] as string);
      expect(content.subject).toBe('NEW SUBJ');
      expect(content.greeting).toBe('Hallo');
      expect(result).not.toBeNull();
    });

    it('links the created document to the application', async () => {
      await svc.run(context());

      expect(applications[0]['coverLetterDocumentId']).toBe(99);
    });

    it('leaves the application alone when the job has no draft yet', async () => {
      const result = await svc.run(context({ application: null }));

      expect(applications).toEqual([]);
      expect(result?.application).toBeNull();
    });

    it('closes the modal only on success', async () => {
      await svc.prepare(null);
      await svc.run(context());

      expect(svc.modalOpen()).toBe(false);
    });

    it('reports a missing profile through the error signal instead of throwing', async () => {
      await svc.prepare(null);
      const result = await svc.run(context({ profile: null }));

      expect(result).toBeNull();
      expect(svc.error()).toContain('Add a profile first');
      expect(svc.modalOpen()).toBe(true);
      expect(svc.running()).toBe(false);
      expect(upserted).toEqual([]);
    });

    it('clears the running flag after a failed AI pass', async () => {
      aiText = 'not json at all';

      expect(await svc.run(context())).toBeNull();
      expect(svc.running()).toBe(false);
      expect(svc.error()).not.toBe('');
    });

    it('refuses a second run while one is in flight', async () => {
      const first = svc.run(context());

      expect(await svc.run(context())).toBeNull();
      await first;
      expect(listed).toBe(0);
      expect(upserted.length).toBe(1);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { CvGapDialogService } from './cv-gap-dialog.service';
import {
  CvDraftContext,
  CvDraftService,
  applyDateAnswers,
  dateGapQuestions,
} from './cv-draft.service';
import { DocumentGenService } from './document-gen.service';

type Parsed = ReturnType<typeof makeParsed>;

function makeParsed(overrides: Partial<{ experience: unknown[]; education: unknown[] }> = {}) {
  return {
    summary: '',
    skills: [],
    experience: [],
    education: [],
    ...overrides,
  } as unknown as {
    experience: { company?: string; role?: string; startDate?: string; endDate?: string }[];
    education: { degree?: string; institution?: string; startDate?: string; endDate?: string }[];
  };
}

describe('dateGapQuestions', () => {
  const t = (key: string) => key;

  it('asks only about entries with no start date, tagging the list in the id', () => {
    const parsed = makeParsed({
      experience: [{ company: 'Acme', role: 'Dev', startDate: '2020' }, { company: 'Beta' }],
      education: [{ institution: 'Uni', degree: 'BSc' }],
    });

    expect(dateGapQuestions(parsed as Parsed, t).map((q) => q.id)).toEqual([
      'expdate:1',
      'edudate:0',
    ]);
  });

  it('treats a whitespace-only start date as missing', () => {
    const parsed = makeParsed({ experience: [{ company: 'Acme', startDate: '   ' }] });

    expect(dateGapQuestions(parsed as Parsed, t)).toHaveLength(1);
  });

  it('asks nothing when everything is dated', () => {
    const parsed = makeParsed({
      experience: [{ company: 'Acme', startDate: '2020' }],
      education: [{ institution: 'Uni', startDate: '2016' }],
    });

    expect(dateGapQuestions(parsed as Parsed, t)).toEqual([]);
  });
});

describe('applyDateAnswers', () => {
  it('routes each answer back to its own entry by list and index', () => {
    const parsed = makeParsed({
      experience: [{ company: 'A' }, { company: 'B' }],
      education: [{ institution: 'Uni' }],
    });

    applyDateAnswers(parsed as Parsed, [
      { id: 'expdate:1', answer: '2019 - 2021' },
      { id: 'edudate:0', answer: '2015 - 2019' },
    ]);

    expect(parsed.experience[0].startDate).toBeUndefined();
    expect(parsed.experience[1].startDate).toBe('2019');
    expect(parsed.experience[1].endDate).toBe('2021');
    expect(parsed.education[0].startDate).toBe('2015');
  });

  it('skips a blank answer and an id pointing at no entry', () => {
    const parsed = makeParsed({ experience: [{ company: 'A' }] });

    applyDateAnswers(parsed as Parsed, [
      { id: 'expdate:0', answer: '   ' },
      { id: 'expdate:9', answer: '2020' },
    ]);

    expect(parsed.experience[0].startDate).toBeUndefined();
    expect(parsed.experience).toHaveLength(1);
  });

  it('takes the answer verbatim rather than inventing a date it cannot read', () => {
    // `parseDateAnswer` does not validate: what the user typed is what the CV
    // shows. Pinned because it is the behaviour, not because it is ideal - the
    // alternative would be to guess, and a guessed employment date is worse.
    const parsed = makeParsed({ experience: [{ company: 'A' }] });

    applyDateAnswers(parsed as Parsed, [{ id: 'expdate:0', answer: 'sometime around then' }]);

    expect(parsed.experience[0].startDate).toBe('sometime around then');
  });
});

describe('CvDraftService', () => {
  let svc: CvDraftService;
  let docGen: DocumentGenService;
  let aiPrompts: string[];
  let upserted: Record<string, unknown>[];
  let hashed: string[];
  let aiFails: boolean;

  const JOB = { id: 7, company: 'Acme', title: 'Engineer' };
  const SETTINGS = { aiMode: 'cloud', provider: 'anthropic', economyModel: 'm' };

  function context(overrides: Partial<CvDraftContext> = {}): CvDraftContext {
    return {
      job: JOB,
      settings: SETTINGS,
      tailoredMd: 'TAILORED',
      language: 'en',
      region: 'generic',
      label: 'Acme - Engineer - Tailored CV',
      ensureApplication: () => Promise.resolve({ id: 1, jobId: 7, cvDocumentId: null }),
      analyzeGaps: () => Promise.resolve([]),
      askGaps: () => Promise.resolve(null),
      saveToProfile: () => Promise.resolve(),
      ...overrides,
    } as unknown as CvDraftContext;
  }

  beforeEach(() => {
    aiPrompts = [];
    upserted = [];
    hashed = [];
    aiFails = false;

    const db = {
      hashText: (v: string) => {
        hashed.push(v);
        return Promise.resolve('HASH');
      },
      documentLibraryUpsert: (d: Record<string, unknown>) => {
        upserted.push(d);
        return Promise.resolve({ ...d, id: d['id'] ?? 42 });
      },
      upsertApplication: (a: Record<string, unknown>) => Promise.resolve({ ...a }),
    };
    const ai = {
      renderSkill: (_skill: string, vars: Record<string, string>) => {
        aiPrompts.push(vars['cv_text']);
        return Promise.resolve({ systemPrompt: 's', userPrompt: 'u' });
      },
      run: () => {
        if (aiFails) return Promise.reject(new Error('ai down'));
        return Promise.resolve({ text: '{"experience":[],"education":[]}' });
      },
    };

    TestBed.configureTestingModule({
      providers: [
        CvDraftService,
        CvGapDialogService,
        TranslateService,
        { provide: DbService, useValue: db },
        { provide: AiService, useValue: ai },
      ],
    });

    svc = TestBed.inject(CvDraftService);
    docGen = TestBed.inject(DocumentGenService);
  });

  it('refuses a second run while one is in flight, and does not end the first', async () => {
    docGen.begin(7, 'cv');

    expect(await svc.create(context())).toBeNull();
    expect(docGen.isPreparing(7, 'cv')).toBe(true);
  });

  it('marks the job preparing for the run and clears it even when the AI throws', async () => {
    aiFails = true;

    await expect(svc.create(context())).rejects.toThrow('ai down');
    expect(docGen.isPreparing(7, 'cv')).toBe(false);
  });

  it('folds gap answers into the text it structures, but not into the input hash', async () => {
    await svc.create(
      context({
        analyzeGaps: () => Promise.resolve([{ id: 'q1', category: 'other', question: 'Q?' }]),
        askGaps: () =>
          Promise.resolve({ answers: [{ id: 'q1', answer: 'A' }], saveToProfile: false }),
      }),
    );

    expect(aiPrompts[0]).toContain('TAILORED');
    expect(aiPrompts[0]).toContain('A');
    // The hash keys the draft to the tailoring, so answering gaps must not
    // change it - otherwise every answered run looks like a different input.
    expect(hashed[0]).toBe(['7', 'TAILORED', 'en', 'generic'].join('\x00'));
  });

  it('structures the tailored text unchanged when the user cancels the gap dialog', async () => {
    await svc.create(
      context({
        analyzeGaps: () => Promise.resolve([{ id: 'q1', category: 'other', question: 'Q?' }]),
        askGaps: () => Promise.resolve(null),
      }),
    );

    expect(aiPrompts[0]).toBe('TAILORED');
  });

  it('finishes the draft even when saving the answers to the profile fails', async () => {
    const result = await svc.create(
      context({
        analyzeGaps: () => Promise.resolve([{ id: 'q1', category: 'other', question: 'Q?' }]),
        askGaps: () =>
          Promise.resolve({ answers: [{ id: 'q1', answer: 'A' }], saveToProfile: true }),
        saveToProfile: () => Promise.reject(new Error('profile write failed')),
      }),
    );

    expect(result?.document).toBeTruthy();
  });

  it('clears the analyzing flag whether the analysis succeeds or throws', async () => {
    await svc.create(context());
    expect(TestBed.inject(CvGapDialogService).analyzing()).toBe(false);

    await expect(
      svc.create(context({ analyzeGaps: () => Promise.reject(new Error('nope')) })),
    ).rejects.toThrow('nope');
    expect(TestBed.inject(CvGapDialogService).analyzing()).toBe(false);
  });

  it('reuses the linked CV row so a retailor updates it instead of duplicating it', async () => {
    await svc.create(
      context({
        ensureApplication: () => Promise.resolve({ id: 1, jobId: 7, cvDocumentId: 99 } as never),
      }),
    );

    expect(upserted[0]['id']).toBe(99);
    expect(upserted[0]['isApplicationDraft']).toBe(true);
    expect(upserted[0]['label']).toBe('Acme - Engineer - Tailored CV');
  });

  it('mints a new row for a job with no CV yet', async () => {
    const result = await svc.create(context());

    expect(upserted[0]['id']).toBeUndefined();
    expect(result?.application.cvDocumentId).toBe(42);
  });
});

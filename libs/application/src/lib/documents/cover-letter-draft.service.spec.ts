import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AiService, DbService } from '@applye/data';
import { CoverLetterDraftContext, CoverLetterDraftService } from './cover-letter-draft.service';
import { CvGapDialogService } from './cv-gap-dialog.service';
import { DocumentGenService } from './document-gen.service';
import { foldInGapAnswers } from './gap-fill';

describe('foldInGapAnswers', () => {
  const analyzing = signal(false);

  beforeEach(() => analyzing.set(false));

  it('returns the source untouched when the analysis finds nothing to ask', async () => {
    const text = await foldInGapAnswers(
      'SOURCE',
      {
        analyzeGaps: () => Promise.resolve({ ok: true as const, questions: [] }),
        askGaps: () => Promise.resolve(null),
        saveToProfile: () => Promise.resolve(),
      },
      analyzing,
    );

    expect(text).toBe('SOURCE');
    expect(analyzing()).toBe(false);
  });

  it('appends the answered block to the source', async () => {
    const text = await foldInGapAnswers(
      'SOURCE',
      {
        analyzeGaps: () =>
          Promise.resolve({
            ok: true as const,
            questions: [{ id: 'q1', category: 'other' as const, question: 'Q?', hint: null }],
          }),
        askGaps: () =>
          Promise.resolve({ answers: [{ id: 'q1', answer: 'ANSWERED' }], saveToProfile: false }),
        saveToProfile: () => Promise.resolve(),
      },
      analyzing,
    );

    expect(text).toContain('SOURCE');
    expect(text).toContain('ANSWERED');
  });

  /**
   * A failed analysis and an empty one both continue to a document - that is
   * the fail-open posture, and it stays. What changed is that they are no
   * longer the same value: `ok: false` means the model was never reached, and
   * whoever produced it has already told the user. The dialog must not open on
   * that path, because there is nothing to ask.
   */
  it('continues without asking when the analysis failed', async () => {
    let asked = 0;
    const text = await foldInGapAnswers(
      'SOURCE',
      {
        analyzeGaps: () => Promise.resolve({ ok: false as const, error: 'provider down' }),
        askGaps: () => {
          asked += 1;
          return Promise.resolve(null);
        },
        saveToProfile: () => Promise.resolve(),
      },
      analyzing,
    );

    expect(text).toBe('SOURCE');
    expect(asked).toBe(0);
    expect(analyzing()).toBe(false);
  });

  it('returns the source when the user cancels the dialog', async () => {
    const text = await foldInGapAnswers(
      'SOURCE',
      {
        analyzeGaps: () =>
          Promise.resolve({
            ok: true as const,
            questions: [{ id: 'q1', category: 'other' as const, question: 'Q?', hint: null }],
          }),
        askGaps: () => Promise.resolve(null),
        saveToProfile: () => Promise.resolve(),
      },
      analyzing,
    );

    expect(text).toBe('SOURCE');
  });

  it('clears the analyzing flag even when the analysis throws', async () => {
    await expect(
      foldInGapAnswers(
        'SOURCE',
        {
          analyzeGaps: () => Promise.reject(new Error('down')),
          askGaps: () => Promise.resolve(null),
          saveToProfile: () => Promise.resolve(),
        },
        analyzing,
      ),
    ).rejects.toThrow('down');
    expect(analyzing()).toBe(false);
  });

  it('carries on when saving the answers to the profile fails', async () => {
    const text = await foldInGapAnswers(
      'SOURCE',
      {
        analyzeGaps: () =>
          Promise.resolve({
            ok: true as const,
            questions: [{ id: 'q1', category: 'other' as const, question: 'Q?', hint: null }],
          }),
        askGaps: () =>
          Promise.resolve({ answers: [{ id: 'q1', answer: 'ANSWERED' }], saveToProfile: true }),
        saveToProfile: () => Promise.reject(new Error('write failed')),
      },
      analyzing,
    );

    expect(text).toContain('ANSWERED');
  });
});

describe('CoverLetterDraftService', () => {
  let svc: CoverLetterDraftService;
  let docGen: DocumentGenService;
  let prompts: Record<string, string>[];
  let upserted: Record<string, unknown>[];
  let hashed: string[];
  let analyzed: number;

  const JOB = { id: 7, company: 'Acme', title: 'Engineer', jdText: 'JD' };
  const PROFILE = { fullMd: 'PROFILE' };
  const SETTINGS = { aiMode: 'cloud', provider: 'anthropic', defaultModel: 'big' };

  function context(overrides: Partial<CoverLetterDraftContext> = {}): CoverLetterDraftContext {
    return {
      job: JOB,
      profile: PROFILE,
      settings: SETTINGS,
      language: 'en',
      region: 'generic',
      label: 'Acme - Engineer - Cover Letter',
      skipGapFill: true,
      ensureApplication: () =>
        Promise.resolve({ id: 1, jobId: 7, coverLetterDocumentId: null } as never),
      analyzeGaps: () => {
        analyzed += 1;
        return Promise.resolve({
          ok: true as const,
          questions: [{ id: 'q1', category: 'other' as const, question: 'Q?', hint: null }],
        });
      },
      askGaps: () =>
        Promise.resolve({ answers: [{ id: 'q1', answer: 'EXTRA' }], saveToProfile: false }),
      saveToProfile: () => Promise.resolve(),
      ...overrides,
    } as unknown as CoverLetterDraftContext;
  }

  beforeEach(() => {
    prompts = [];
    upserted = [];
    hashed = [];
    analyzed = 0;

    const db = {
      hashText: (v: string) => {
        hashed.push(v);
        return Promise.resolve('HASH');
      },
      documentLibraryUpsert: (d: Record<string, unknown>) => {
        upserted.push(d);
        return Promise.resolve({ ...d, id: d['id'] ?? 55 });
      },
      upsertApplication: (a: Record<string, unknown>) => Promise.resolve({ ...a }),
    };
    const ai = {
      renderSkill: (_skill: string, vars: Record<string, string>) => {
        prompts.push(vars);
        return Promise.resolve({ systemPrompt: 's', userPrompt: 'u' });
      },
      run: () => Promise.resolve({ text: '{"greeting":"Hi"}', tokensInput: 10, tokensOutput: 20 }),
    };

    TestBed.configureTestingModule({
      providers: [
        CoverLetterDraftService,
        CvGapDialogService,
        { provide: DbService, useValue: db },
        { provide: AiService, useValue: ai },
      ],
    });

    svc = TestBed.inject(CoverLetterDraftService);
    docGen = TestBed.inject(DocumentGenService);
  });

  it('refuses a second run while one is in flight', async () => {
    docGen.begin(7, 'cover_letter');

    expect(await svc.create(context())).toBeNull();
    expect(docGen.isPreparing(7, 'cover_letter')).toBe(true);
  });

  it('skips the gap pass entirely when the CV flow already ran it', async () => {
    await svc.create(context({ skipGapFill: true }));

    expect(analyzed).toBe(0);
    expect(prompts[0]['profile_md']).toBe('PROFILE');
  });

  it('runs the gap pass and folds the answers into the profile text otherwise', async () => {
    await svc.create(context({ skipGapFill: false }));

    expect(analyzed).toBe(1);
    expect(prompts[0]['profile_md']).toContain('PROFILE');
    expect(prompts[0]['profile_md']).toContain('EXTRA');
  });

  it('keys the input hash on the saved profile, not on the gap-augmented text', async () => {
    await svc.create(context({ skipGapFill: false }));

    expect(hashed[0]).toBe(['7', 'PROFILE', 'JD', 'en', 'generic'].join('\x00'));
  });

  it('defaults the fields the AI may omit, and carries the job description into the content', async () => {
    await svc.create(context());
    const content = JSON.parse(upserted[0]['contentJson'] as string);

    expect(content.bodyParagraphs).toEqual([]);
    expect(content.jobDescription).toBe('JD');
    expect(content.tone).toBeTruthy();
    expect(content.length).toBeTruthy();
  });

  it('sends the availability fields empty, so a first letter cannot invent them', async () => {
    await svc.create(context());

    expect(prompts[0]['earliest_start']).toBe('');
    expect(prompts[0]['salary_expectation']).toBe('');
    expect(prompts[0]['notice_period']).toBe('');
  });

  it('reuses the linked row so a regenerate updates it instead of duplicating it', async () => {
    await svc.create(
      context({
        ensureApplication: () =>
          Promise.resolve({ id: 1, jobId: 7, coverLetterDocumentId: 88 } as never),
      }),
    );

    expect(upserted[0]['id']).toBe(88);
    expect(upserted[0]['isApplicationDraft']).toBe(true);
    expect(upserted[0]['modelUsed']).toBe('big');
  });

  it('clears the preparing flag when the run finishes', async () => {
    await svc.create(context());

    expect(docGen.isPreparing(7, 'cover_letter')).toBe(false);
  });
});

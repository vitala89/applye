import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { PortalAnswersService } from './portal-answers.service';
import { ToastService } from '../core/toast/toast.service';

/**
 * Covers the behaviour that used to live inline in `JobsComponent`. The service
 * was extracted without changing it, so these are the first tests it has ever
 * had - they pin the cache-key inputs, the guard conditions that make a call a
 * no-op, and the JSON parsing the AI response goes through.
 */
describe('PortalAnswersService', () => {
  const job = { id: 7, jdText: 'a job' } as never;
  const profile = { scoringHash: 'ph', scoringJson: '{}' } as never;
  const settings = { defaultModel: 'm', aiMode: 'local', provider: 'p' } as never;

  let db: {
    hashText: jest.Mock;
    portalAnswersGet: jest.Mock;
    portalAnswersSave: jest.Mock;
  };
  let ai: { renderSkill: jest.Mock; run: jest.Mock };
  let toast: { error: jest.Mock };

  function make(): PortalAnswersService {
    db = {
      hashText: jest.fn(async (s: string) => `hash:${s}`),
      portalAnswersGet: jest.fn(async () => null),
      portalAnswersSave: jest.fn(async () => undefined),
    };
    ai = {
      renderSkill: jest.fn(async () => ({ systemPrompt: 'sys', userPrompt: 'usr' })),
      run: jest.fn(async () => ({
        text: '{"answers":[{"question":"Q","answer":"A"}]}',
        tokensInput: 10,
        tokensOutput: 5,
      })),
    };
    toast = { error: jest.fn() };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PortalAnswersService,
        { provide: DbService, useValue: db },
        { provide: AiService, useValue: ai },
        { provide: ToastService, useValue: toast },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
      ],
    });
    return TestBed.inject(PortalAnswersService);
  }

  it('starts on the default question set', () => {
    expect(make().questions()).toEqual(PortalAnswersService.DEFAULT_QUESTIONS);
  });

  it('reset restores the defaults and applies the given language', () => {
    const s = make();
    s.questions.set(['only one']);
    s.answers.set([{ question: 'Q', answer: 'A' }]);
    s.fromCache.set(true);
    s.error.set(true);
    s.status.set('boom');

    s.reset('de');

    expect(s.questions()).toEqual(PortalAnswersService.DEFAULT_QUESTIONS);
    expect(s.answers()).toEqual([]);
    expect(s.fromCache()).toBe(false);
    expect(s.error()).toBe(false);
    expect(s.status()).toBe('');
    expect(s.language()).toBe('de');
  });

  it('edits questions and answers immutably', () => {
    const s = make();
    s.questions.set(['a', 'b']);
    const before = s.questions();

    s.updateQuestion(1, 'B');
    expect(before).toEqual(['a', 'b']);
    expect(s.questions()).toEqual(['a', 'B']);

    s.addQuestion();
    expect(s.questions()).toEqual(['a', 'B', '']);
    s.removeQuestion(0);
    expect(s.questions()).toEqual(['B', '']);

    s.answers.set([{ question: 'Q', answer: 'A' }]);
    s.editAnswer(0, 'A2');
    expect(s.answers()).toEqual([{ question: 'Q', answer: 'A2' }]);
    s.editAnswer(9, 'ignored');
    expect(s.answers()).toEqual([{ question: 'Q', answer: 'A2' }]);
  });

  it('hashes only the trimmed, non-empty questions plus language and model', async () => {
    const s = make();
    s.questions.set([' one ', '', '  ', 'two']);
    s.language.set('fr');

    await s.loadFromCache(job, profile, settings);

    expect(db.hashText).toHaveBeenCalledWith(
      JSON.stringify({ q: ['one', 'two'], lang: 'fr', model: 'm' }),
    );
  });

  it('loadFromCache adopts a cache hit and marks it cached', async () => {
    const s = make();
    db.portalAnswersGet.mockResolvedValue({
      answersJson: '[{"question":"Q","answer":"cached"}]',
    });

    await s.loadFromCache(job, profile, settings);

    expect(s.answers()).toEqual([{ question: 'Q', answer: 'cached' }]);
    expect(s.fromCache()).toBe(true);
  });

  it('loadFromCache swallows a cache read failure', async () => {
    const s = make();
    db.portalAnswersGet.mockRejectedValue(new Error('db down'));

    await expect(s.loadFromCache(job, profile, settings)).resolves.toBeUndefined();
    expect(s.answers()).toEqual([]);
    expect(s.error()).toBe(false);
  });

  it('loadFromCache and draft are no-ops without a job, profile, settings or questions', async () => {
    const s = make();
    await s.loadFromCache(null, profile, settings);
    await s.loadFromCache(job, null, settings);
    await s.loadFromCache(job, profile, null);
    await s.draft(null, profile, settings);
    await s.draft(job, null, settings);
    await s.draft(job, profile, null);
    s.questions.set(['   ']);
    await s.draft(job, profile, settings);

    expect(db.portalAnswersGet).not.toHaveBeenCalled();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('draft calls the AI once, stores the result and reports the token cost', async () => {
    const s = make();
    await s.draft(job, profile, settings);

    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(s.answers()).toEqual([{ question: 'Q', answer: 'A' }]);
    expect(s.fromCache()).toBe(false);
    expect(s.status()).toBe('15 tokens used.');
    expect(s.drafting()).toBe(false);
    expect(db.portalAnswersSave).toHaveBeenCalledTimes(1);
  });

  it('draft returns the cached answers without calling the AI', async () => {
    const s = make();
    db.portalAnswersGet.mockResolvedValue({
      answersJson: '[{"question":"Q","answer":"cached"}]',
    });

    await s.draft(job, profile, settings);

    expect(ai.run).not.toHaveBeenCalled();
    expect(s.answers()).toEqual([{ question: 'Q', answer: 'cached' }]);
    expect(s.fromCache()).toBe(true);
    expect(s.status()).toBe('jobs.portal_cached');
  });

  it('draft surfaces a failure through the error flag, status and a toast', async () => {
    const s = make();
    ai.run.mockRejectedValue(new Error('provider offline'));

    await s.draft(job, profile, settings);

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('provider offline');
    expect(toast.error).toHaveBeenCalled();
    expect(s.drafting()).toBe(false);
  });

  it('draft rejects a non-JSON AI response without saving anything', async () => {
    const s = make();
    ai.run.mockResolvedValue({ text: 'not json at all', tokensInput: 1, tokensOutput: 1 });

    await s.draft(job, profile, settings);

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('AI returned invalid JSON');
    expect(db.portalAnswersSave).not.toHaveBeenCalled();
  });

  it('draft strips a fenced code block before parsing', async () => {
    const s = make();
    ai.run.mockResolvedValue({
      text: '```json\n{"answers":[{"question":"Q","answer":"fenced"}]}\n```',
      tokensInput: 1,
      tokensOutput: 1,
    });

    await s.draft(job, profile, settings);

    expect(s.answers()).toEqual([{ question: 'Q', answer: 'fenced' }]);
  });

  it('redraft replaces one answer and leaves its neighbours alone', async () => {
    const s = make();
    s.answers.set([
      { question: 'Q0', answer: 'A0' },
      { question: 'Q1', answer: 'A1' },
    ]);
    ai.run.mockResolvedValue({
      text: '{"answers":[{"question":"Q1","answer":"fresh"}]}',
      tokensInput: 1,
      tokensOutput: 1,
    });

    await s.redraft(1, job, profile, settings);

    expect(s.answers()).toEqual([
      { question: 'Q0', answer: 'A0' },
      { question: 'Q1', answer: 'fresh' },
    ]);
    expect(s.redrafting()).toBeNull();
  });

  it('redraft never reads the batch cache and always calls the AI', async () => {
    const s = make();
    s.answers.set([{ question: 'Q0', answer: 'A0' }]);

    await s.redraft(0, job, profile, settings);

    expect(db.portalAnswersGet).not.toHaveBeenCalled();
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(db.portalAnswersSave).toHaveBeenCalledTimes(1);
  });

  it('redraft keeps the current answer when the AI returns nothing usable', async () => {
    const s = make();
    s.answers.set([{ question: 'Q0', answer: 'A0' }]);
    ai.run.mockResolvedValue({ text: '{"answers":[]}', tokensInput: 1, tokensOutput: 1 });

    await s.redraft(0, job, profile, settings);

    expect(s.answers()).toEqual([{ question: 'Q0', answer: 'A0' }]);
  });

  it('redraft is a no-op for an index with no answer', async () => {
    const s = make();
    await s.redraft(3, job, profile, settings);
    expect(ai.run).not.toHaveBeenCalled();
  });
});

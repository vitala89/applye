import { TestBed } from '@angular/core/testing';
import { AiService } from '@applye/data';
import { CvGapDialogService } from './cv-gap-dialog.service';

/**
 * The reported bug: starting a cover letter while a CV was still generating
 * raised a second gap dialog, and one of the two documents then sat on
 * "Generating" forever. Both flows awaited the same single resolver, so the
 * second overwrote the first and the first promise never settled.
 */
describe('CvGapDialogService', () => {
  let ai: { renderSkill: jest.Mock; run: jest.Mock };

  const job = { id: 7, jdText: 'a job' } as never;
  const settings = { aiMode: 'api', provider: 'claude', economyModel: 'm' } as never;

  function make(): CvGapDialogService {
    ai = {
      renderSkill: jest.fn(async () => ({ systemPrompt: 's', userPrompt: 'u' })),
      run: jest.fn(async () => ({
        text: JSON.stringify({
          questions: [{ id: 'q1', category: 'experience', question: 'When?', hint: 'h' }],
        }),
        tokensInput: 1,
        tokensOutput: 1,
      })),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [CvGapDialogService, { provide: AiService, useValue: ai }],
    });
    return TestBed.inject(CvGapDialogService);
  }

  const questions = [{ id: 'q1', category: 'experience' as const, question: 'When?', hint: 'h' }];
  const answer = { answers: [{ id: 'q1', answer: '2020' }], saveToProfile: false };

  it('starts closed and unowned', () => {
    const s = make();
    expect(s.open()).toBe(false);
    expect(s.taken).toBe(false);
    expect(s.busy()).toBe(false);
  });

  it('opens on ask and resolves with the submitted answers', async () => {
    const s = make();
    const pending = s.ask(questions);
    expect(s.open()).toBe(true);
    expect(s.questions()).toEqual(questions);
    expect(s.taken).toBe(true);

    s.submit(answer);

    await expect(pending).resolves.toEqual(answer);
    expect(s.open()).toBe(false);
    expect(s.taken).toBe(false);
  });

  it('resolves null on cancel', async () => {
    const s = make();
    const pending = s.ask(questions);
    s.cancel();
    await expect(pending).resolves.toBeNull();
  });

  // The regression itself.
  it('answers a second caller null and leaves the first one owning the dialog', async () => {
    const s = make();
    const first = s.ask(questions);
    const second = s.ask([{ id: 'q2', category: 'other', question: 'Other?', hint: '' }]);

    await expect(second).resolves.toBeNull();
    // The dialog still belongs to the first caller, showing its questions.
    expect(s.open()).toBe(true);
    expect(s.questions()).toEqual(questions);

    s.submit(answer);
    await expect(first).resolves.toEqual(answer);
  });

  it('settles the first caller even though a second one arrived', async () => {
    const s = make();
    const first = s.ask(questions);
    void s.ask(questions);

    s.cancel();

    // Before the fix this promise never settled and its caller's `finally`
    // never ran, which is what left a document stuck on "Generating".
    await expect(first).resolves.toBeNull();
  });

  it('hands the dialog to the next caller once it is free', async () => {
    const s = make();
    const first = s.ask(questions);
    s.submit(answer);
    await first;

    const next = [{ id: 'q9', category: 'other' as const, question: 'Next?', hint: '' }];
    const second = s.ask(next);
    expect(s.open()).toBe(true);
    expect(s.questions()).toEqual(next);
    s.cancel();
    await expect(second).resolves.toBeNull();
  });

  it('dispose releases a waiting caller and closes the dialog', async () => {
    const s = make();
    const pending = s.ask(questions);

    s.dispose();

    await expect(pending).resolves.toBeNull();
    expect(s.open()).toBe(false);
    expect(s.analyzing()).toBe(false);
    expect(s.questions()).toEqual([]);
    expect(s.taken).toBe(false);
  });

  it('dispose is safe with nothing waiting', () => {
    const s = make();
    expect(() => s.dispose()).not.toThrow();
  });

  it('submit and cancel are safe with nothing waiting', () => {
    const s = make();
    expect(() => s.submit(answer)).not.toThrow();
    expect(() => s.cancel()).not.toThrow();
  });

  it('busy covers analysing as well as the open dialog', () => {
    const s = make();
    s.analyzing.set(true);
    expect(s.busy()).toBe(true);
    s.analyzing.set(false);
    expect(s.busy()).toBe(false);
    void s.ask(questions);
    expect(s.busy()).toBe(true);
  });

  describe('analyze', () => {
    it('returns the parsed questions', async () => {
      const s = make();
      await expect(s.analyze('cv text', job, settings, 'en')).resolves.toHaveLength(1);
      expect(ai.run).toHaveBeenCalledWith(expect.objectContaining({ model: 'm' }));
    });

    it('asks nothing when the model fails - gap-fill never blocks generation', async () => {
      const s = make();
      ai.run.mockRejectedValue(new Error('provider down'));
      await expect(s.analyze('cv text', job, settings, 'en')).resolves.toEqual([]);
    });

    it('asks nothing when the answer will not parse', async () => {
      const s = make();
      ai.run.mockResolvedValue({ text: 'not json', tokensInput: 1, tokensOutput: 1 });
      await expect(s.analyze('cv text', job, settings, 'en')).resolves.toEqual([]);
    });

    it('is a no-op without a job or settings', async () => {
      const s = make();
      await expect(s.analyze('cv', null, settings, 'en')).resolves.toEqual([]);
      await expect(s.analyze('cv', job, null, 'en')).resolves.toEqual([]);
      expect(ai.run).not.toHaveBeenCalled();
    });
  });
});

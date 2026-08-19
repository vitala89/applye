import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AiService, DbService, DraftsGateway, SystemGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { TailorContext, TailoringService } from './tailoring.service';
import { WizardActivityService } from './wizard-activity.service';
import { ToastService } from '../shell/toast.service';

/**
 * Covers the behaviour that used to live inline in `JobsComponent`. The pass
 * pipeline had no coverage at all, and its sharpest edge is the cache key: each
 * pass is hashed over the results of the passes before it, so a key that forgot
 * them would serve a stale build.
 */
describe('TailoringService', () => {
  let db: { hashText: jest.Mock };
  let drafts: { tailoringCacheGet: jest.Mock; tailoringCacheSave: jest.Mock };
  let ai: { renderSkill: jest.Mock; run: jest.Mock };
  let toast: { warning: jest.Mock };

  const JOB_ID = 7;

  function ctx(over: Partial<TailorContext> = {}): TailorContext {
    return {
      job: { id: JOB_ID, jdText: 'a job' } as never,
      profile: { fullMd: 'baseline profile' } as never,
      settings: {
        aiMode: 'api',
        provider: 'claude',
        defaultModel: 'm',
        defaultDocLanguage: 'en',
      } as never,
      jdText: 'a job',
      scoring: null,
      baseCvId: null,
      matchingCvs: [],
      ...over,
    };
  }

  /** A well-formed pass response; `result_md` carries the pass number so the
   * chaining assertions can tell the passes apart. */
  function passResponse(pass: number) {
    return {
      text: JSON.stringify({
        result_md: `md-${pass}`,
        changes: [`change-${pass}`],
        gaps: [`gap-${pass}`],
      }),
      tokensInput: 10,
      tokensOutput: 5,
    };
  }

  function make(): TailoringService {
    db = {
      hashText: jest.fn(async (s: string) => `hash(${s})`),
    };
    drafts = {
      tailoringCacheGet: jest.fn(async () => null),
      tailoringCacheSave: jest.fn(async () => undefined),
    };
    toast = { warning: jest.fn() };
    let call = 0;
    ai = {
      renderSkill: jest.fn(async () => ({ systemPrompt: 'sys', userPrompt: 'usr' })),
      run: jest.fn(async () => passResponse(++call)),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        TailoringService,
        WizardActivityService,
        { provide: DbService, useValue: db },
        { provide: SystemGateway, useValue: db },
        { provide: DraftsGateway, useValue: drafts },
        { provide: AiService, useValue: ai },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    return TestBed.inject(TailoringService);
  }

  it('starts with nothing tailored', () => {
    const s = make();
    expect(s.results()).toEqual([]);
    expect(s.isTailored()).toBe(false);
    expect(s.status()).toBe('');
    expect(s.error()).toBe(false);
  });

  it('runs all three passes on one call', async () => {
    const s = make();
    await s.run(ctx());

    expect(ai.run).toHaveBeenCalledTimes(3);
    expect(s.results().map((r) => r.pass)).toEqual([1, 2, 3]);
    expect(s.isTailored()).toBe(true);
    expect(s.error()).toBe(false);
  });

  it('flattens changes and gaps across the passes', async () => {
    const s = make();
    await s.run(ctx());

    expect(s.allChanges()).toEqual(['change-1', 'change-2', 'change-3']);
    expect(s.allGaps()).toEqual(['gap-1', 'gap-2', 'gap-3']);
  });

  it('feeds each pass the results of the ones before it', async () => {
    const s = make();
    await s.run(ctx());

    const third = ai.renderSkill.mock.calls[2][1];
    expect(third.pass).toBe('3');
    expect(third.pass1_result).toBe('md-1');
    expect(third.pass2_result).toBe('md-2');
  });

  it('keys the cache on the earlier passes, so pass 3 cannot go stale', async () => {
    const s = make();
    await s.run(ctx());

    const [, , thirdHash] = db.hashText.mock.calls.map((c) => c[0] as string);
    expect(thirdHash).toContain('md-1');
    expect(thirdHash).toContain('md-2');
    expect(thirdHash).toContain('baseline profile');
    expect(thirdHash).toContain('a job');
  });

  it('serves a cached pass without calling the AI or re-saving it', async () => {
    const s = make();
    drafts.tailoringCacheGet.mockResolvedValue({
      resultMd: 'cached',
      changesJson: '["c"]',
      gapsJson: '["g"]',
    });

    await s.run(ctx());

    expect(ai.run).not.toHaveBeenCalled();
    expect(drafts.tailoringCacheSave).not.toHaveBeenCalled();
    expect(s.results()).toHaveLength(3);
    expect(s.results()[0].fromCache).toBe(true);
    expect(s.status()).toContain('0 tokens');
  });

  it('saves an uncached pass with its token cost', async () => {
    const s = make();
    await s.run(ctx());

    expect(drafts.tailoringCacheSave).toHaveBeenCalledTimes(3);
    expect(drafts.tailoringCacheSave).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, pass: 1, resultMd: 'md-1', modelUsed: 'm' }),
    );
    expect(s.status()).toBe('Pass 3 done - 10 in / 5 out');
  });

  it('tailors the selected base CV instead of the profile', async () => {
    const s = make();
    await s.run(
      ctx({
        baseCvId: 4,
        matchingCvs: [
          {
            id: 4,
            contentJson: JSON.stringify({
              sections: [{ key: 'summary', visible: true, text: 'from the chosen CV' }],
            }),
          } as never,
        ],
      }),
    );

    expect(ai.renderSkill.mock.calls[0][1].profile_md).toContain('from the chosen CV');
  });

  /**
   * The fallback stays - an unreadable base CV must not cost the user the run.
   * The regression is that it used to be silent: three passes rewrote the
   * profile while the wizard still named the selected CV, so the result was a
   * tailored version of a document that was never opened.
   */
  it('falls back to the profile when the selected CV will not parse, and says so once', async () => {
    const s = make();
    await s.run(ctx({ baseCvId: 4, matchingCvs: [{ id: 4, contentJson: '{not json' } as never] }));

    expect(ai.renderSkill.mock.calls[0][1].profile_md).toBe('baseline profile');
    // The stub `t` echoes the key, so this pins WHICH sentence was chosen and
    // that the CV id was interpolated into it - not the English wording, which
    // now lives in the locale files.
    expect(s.baselineWarning()).toContain('jobs.tailor_base_cv_unreadable');
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('raises no baseline warning when the selected CV reads', async () => {
    const s = make();
    await s.run(ctx());

    expect(s.baselineWarning()).toBeNull();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('stops on a failing pass and reports it', async () => {
    const s = make();
    ai.run.mockResolvedValueOnce(passResponse(1)).mockRejectedValueOnce(new Error('provider down'));

    await s.run(ctx());

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('provider down');
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it('rejects a pass that does not return JSON', async () => {
    const s = make();
    ai.run.mockResolvedValue({ text: 'not json', tokensInput: 1, tokensOutput: 1 });

    await s.run(ctx());

    expect(s.error()).toBe(true);
    expect(s.status()).toContain('Pass 1 returned invalid JSON');
    expect(drafts.tailoringCacheSave).not.toHaveBeenCalled();
  });

  it('discards every partial result when cancelled mid-run', async () => {
    const s = make();
    ai.run.mockImplementation(async () => {
      s.cancelled.set(true);
      return passResponse(1);
    });

    await s.run(ctx());

    expect(s.results()).toEqual([]);
    expect(s.status()).toBe('jobs.wizard.tailor_cancelled');
    expect(s.isTailored()).toBe(false);
    expect(s.cancelled()).toBe(false);
  });

  it('cancel only arms while a run for that job is in flight', () => {
    const s = make();
    s.cancel(JOB_ID);
    expect(s.cancelled()).toBe(false);

    TestBed.inject(WizardActivityService).begin(JOB_ID, 'tailoring');
    s.cancel(JOB_ID);
    expect(s.cancelled()).toBe(true);
  });

  it('cancel is a no-op without a job', () => {
    const s = make();
    s.cancel(undefined);
    expect(s.cancelled()).toBe(false);
  });

  it('clears the in-flight marker even when a pass throws', async () => {
    const s = make();
    const activity = TestBed.inject(WizardActivityService);
    ai.run.mockRejectedValue(new Error('boom'));

    await s.run(ctx());

    expect(activity.isRunning(JOB_ID, 'tailoring')).toBe(false);
  });

  it('is a no-op without a job, profile or settings', async () => {
    const s = make();
    await s.run(ctx({ job: null }));
    await s.run(ctx({ profile: null }));
    await s.run(ctx({ settings: null }));

    expect(ai.run).not.toHaveBeenCalled();
  });

  describe('restoreFromCache', () => {
    it('rebuilds every cached pass without spending a token', async () => {
      const s = make();
      drafts.tailoringCacheGet.mockResolvedValue({
        resultMd: 'cached',
        changesJson: '["c"]',
        gapsJson: '["g"]',
      });

      await s.restoreFromCache(ctx());

      expect(s.results()).toHaveLength(3);
      expect(s.isTailored()).toBe(true);
      expect(ai.run).not.toHaveBeenCalled();
      expect(s.results().every((r) => r.fromCache && r.tokensIn === 0)).toBe(true);
    });

    it('stops at the first miss - later passes are keyed on what is missing', async () => {
      const s = make();
      drafts.tailoringCacheGet
        .mockResolvedValueOnce({ resultMd: 'md-1', changesJson: '[]', gapsJson: '[]' })
        .mockResolvedValueOnce(null);

      await s.restoreFromCache(ctx());

      expect(s.results()).toHaveLength(1);
      expect(s.isTailored()).toBe(false);
      expect(drafts.tailoringCacheGet).toHaveBeenCalledTimes(2);
    });

    it('leaves the results alone when nothing is cached', async () => {
      const s = make();
      await s.restoreFromCache(ctx());

      expect(s.results()).toEqual([]);
    });

    it('hashes against the profile, never a selected CV', async () => {
      const s = make();
      await s.restoreFromCache(
        ctx({
          baseCvId: 4,
          matchingCvs: [
            {
              id: 4,
              contentJson: JSON.stringify({
                sections: [{ key: 'summary', visible: true, text: 'chosen' }],
              }),
            } as never,
          ],
        }),
      );

      expect(db.hashText.mock.calls[0][0]).toContain('baseline profile');
      expect(db.hashText.mock.calls[0][0]).not.toContain('chosen');
    });

    it('is a no-op without a job, profile or settings', async () => {
      const s = make();
      await s.restoreFromCache(ctx({ job: null }));
      await s.restoreFromCache(ctx({ profile: null }));
      await s.restoreFromCache(ctx({ settings: null }));

      expect(drafts.tailoringCacheGet).not.toHaveBeenCalled();
    });
  });

  it('reset drops the results and the status line', async () => {
    const s = make();
    await s.run(ctx());
    s.error.set(true);

    s.reset();

    expect(s.results()).toEqual([]);
    expect(s.status()).toBe('');
    expect(s.error()).toBe(false);
  });
});

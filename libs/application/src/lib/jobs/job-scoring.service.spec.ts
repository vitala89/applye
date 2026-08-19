import { TestBed } from '@angular/core/testing';
import {
  AiService,
  AtsService,
  DocumentsGateway,
  JobsGateway,
  JobsStore,
  SystemGateway,
} from '@applye/data';
import { JobScoringService, ScoreContext, parseScoreResponse } from './job-scoring.service';
import { TailorScoreService } from './tailor-score.service';
import { WizardActivityService } from './wizard-activity.service';
import { FinalChecksService } from './final-checks.service';

/**
 * Scoring extracted out of the jobs page component. The behaviour worth
 * pinning is the asymmetry between the two paths: the baseline score is cached
 * and written to `scoring_cache`, while the post-tailor rescore is held in
 * memory until the user commits, because both would occupy the same unique key.
 */
describe('JobScoringService', () => {
  let db: {
    scoreCacheGet: jest.Mock;
    scoreCacheLatest: jest.Mock;
    scoreCacheSave: jest.Mock;
  };
  let ai: { renderSkill: jest.Mock; run: jest.Mock };
  let ats: { check: jest.Mock };
  let jobsStore: { patchOverviewRow: jest.Mock };

  const reply = {
    score: 82,
    dimensions: [],
    missing_keywords: ['rust'],
    red_flags: [],
    ats_pass: true,
    ats_notes: 'fine',
    summary: 'good fit',
  };

  const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
    job: { id: 7, jdHash: 'jd1' } as never,
    profile: { scoringJson: '{}', scoringHash: 'p1' } as never,
    settings: { aiMode: 'api', provider: 'claude', economyModel: 'm' } as never,
    jdText: 'a job',
    legitimacyNotes: [],
    tailoredResumeMd: '',
    reviewRegion: 'eu',
    ...over,
  });

  function make(): JobScoringService {
    db = {
      scoreCacheGet: jest.fn(async () => null),
      scoreCacheLatest: jest.fn(async () => null),
      scoreCacheSave: jest.fn(async (row) => ({ ...row, id: 1 })),
    };
    ai = {
      renderSkill: jest.fn(async () => ({ systemPrompt: 's', userPrompt: 'u' })),
      run: jest.fn(async () => ({
        text: JSON.stringify(reply),
        tokensInput: 10,
        tokensOutput: 20,
      })),
    };
    ats = { check: jest.fn(async () => ({ pass: true })) };
    jobsStore = { patchOverviewRow: jest.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        JobScoringService,
        FinalChecksService,
        TailorScoreService,
        WizardActivityService,
        { provide: JobsGateway, useValue: db },
        { provide: DocumentsGateway, useValue: db },
        { provide: SystemGateway, useValue: db },
        { provide: AiService, useValue: ai },
        { provide: AtsService, useValue: ats },
        { provide: JobsStore, useValue: jobsStore },
      ],
    });
    return TestBed.inject(JobScoringService);
  }

  describe('parseScoreResponse', () => {
    it('parses a bare JSON reply', () => {
      expect(parseScoreResponse('{"score":5}').score).toBe(5);
    });

    it('unwraps a ```json fenced reply', () => {
      expect(parseScoreResponse('```json\n{"score":5}\n```').score).toBe(5);
    });

    it('unwraps an unlabelled fence', () => {
      expect(parseScoreResponse('```\n{"score":5}\n```').score).toBe(5);
    });

    it('throws with a truncated excerpt when the reply is not JSON', () => {
      expect(() => parseScoreResponse('sorry, I cannot')).toThrow(/AI returned invalid JSON/);
    });
  });

  describe('score', () => {
    it('serves the cached score without spending tokens', async () => {
      const s = make();
      db.scoreCacheGet.mockResolvedValueOnce({ id: 1, score: 70 });
      await s.score(ctx());
      expect(ai.run).not.toHaveBeenCalled();
      expect(s.cache()?.score).toBe(70);
      expect(s.fromCache()).toBe(true);
      expect(s.status()).toContain('0 tokens');
    });

    it('skips the cache lookup on force refresh', async () => {
      const s = make();
      await s.score(ctx(), true);
      expect(db.scoreCacheGet).not.toHaveBeenCalled();
      expect(ai.run).toHaveBeenCalled();
    });

    it('saves a fresh score and patches the My Jobs row', async () => {
      const s = make();
      await s.score(ctx());
      expect(db.scoreCacheSave).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 7, profileHash: 'p1', score: 82 }),
      );
      expect(jobsStore.patchOverviewRow).toHaveBeenCalledWith(7, { score: 82 });
      expect(s.cache()?.score).toBe(82);
      expect(s.fromCache()).toBe(false);
      expect(s.error()).toBe(false);
      expect(s.running()).toBe(false);
    });

    it('reports a failure and clears the running flag', async () => {
      const s = make();
      ai.run.mockRejectedValueOnce(new Error('provider down'));
      await s.score(ctx());
      expect(s.error()).toBe(true);
      expect(s.status()).toContain('Scoring failed');
      expect(s.running()).toBe(false);
      expect(db.scoreCacheSave).not.toHaveBeenCalled();
    });

    it('does nothing without a scored profile', async () => {
      const s = make();
      await s.score(ctx({ profile: { scoringJson: null } as never }));
      expect(ai.run).not.toHaveBeenCalled();
      expect(db.scoreCacheGet).not.toHaveBeenCalled();
    });
  });

  describe('loadCached', () => {
    it('flags a fallback score as stale', async () => {
      const s = make();
      db.scoreCacheLatest.mockResolvedValueOnce({ id: 2, score: 60 });
      await s.loadCached(7, 'p1');
      expect(s.cache()?.score).toBe(60);
      expect(s.stale()).toBe(true);
    });

    it('does not flag an exact profile-version hit as stale', async () => {
      const s = make();
      db.scoreCacheGet.mockResolvedValueOnce({ id: 1, score: 90 });
      await s.loadCached(7, 'p1');
      expect(s.stale()).toBe(false);
      expect(db.scoreCacheLatest).not.toHaveBeenCalled();
    });

    it('leaves the score alone when the profile has no scoring hash', async () => {
      const s = make();
      await s.loadCached(7, null);
      expect(db.scoreCacheGet).not.toHaveBeenCalled();
      expect(s.cache()).toBeNull();
    });
  });

  describe('rescoreAfterTailor', () => {
    it('keeps the rescore out of scoring_cache', async () => {
      const s = make();
      await s.rescoreAfterTailor(ctx({ tailoredResumeMd: '# CV' }));
      expect(ai.run).toHaveBeenCalled();
      expect(db.scoreCacheSave).not.toHaveBeenCalled();
      expect(TestBed.inject(TailorScoreService).resultFor(7)?.score).toBe(82);
    });

    it('runs the deterministic ATS check against the tailored CV', async () => {
      const s = make();
      await s.rescoreAfterTailor(ctx({ tailoredResumeMd: '# CV' }));
      expect(ats.check).toHaveBeenCalledWith('# CV', 'a job', 'eu');
    });

    it('does nothing without a tailored resume', async () => {
      const s = make();
      await s.rescoreAfterTailor(ctx());
      expect(ai.run).not.toHaveBeenCalled();
      expect(ats.check).not.toHaveBeenCalled();
    });

    /**
     * The report stays null and the card still falls back to the AI's advisory
     * verdict - that part is unchanged. What changed is that the reason is now
     * readable: a null report meant both "not run" and "failed", and the only
     * record of the failure was a console line no user will ever see.
     */
    it('leaves the ATS report null when the local check throws, and says why', async () => {
      const s = make();
      ats.check.mockRejectedValueOnce(new Error('nope'));
      await s.rescoreAfterTailor(ctx({ tailoredResumeMd: '# CV' }));
      expect(s.atsReport()).toBeNull();
      expect(s.atsError()).toContain('nope');
    });

    it('carries no ATS error when the check succeeds', async () => {
      const s = make();
      await s.rescoreAfterTailor(ctx({ tailoredResumeMd: '# CV' }));
      expect(s.atsError()).toBeNull();
    });
  });

  describe('savePostTailor', () => {
    it('writes the rescore once and patches the My Jobs row', async () => {
      const s = make();
      await s.rescoreAfterTailor(ctx({ tailoredResumeMd: '# CV' }));
      await s.savePostTailor(7);
      await s.savePostTailor(7);
      expect(db.scoreCacheSave).toHaveBeenCalledTimes(1);
      expect(jobsStore.patchOverviewRow).toHaveBeenCalledWith(7, { score: 82 });
    });

    it('allows a retry after a failed write', async () => {
      const s = make();
      await s.rescoreAfterTailor(ctx({ tailoredResumeMd: '# CV' }));
      db.scoreCacheSave.mockRejectedValueOnce(new Error('disk full'));
      await s.savePostTailor(7);
      expect(s.postTailorSaved()).toBe(false);
      await s.savePostTailor(7);
      expect(db.scoreCacheSave).toHaveBeenCalledTimes(2);
    });

    it('does nothing without a rescore to save', async () => {
      const s = make();
      await s.savePostTailor(7);
      expect(db.scoreCacheSave).not.toHaveBeenCalled();
    });
  });

  it('reset drops the shown score', async () => {
    const s = make();
    db.scoreCacheGet.mockResolvedValueOnce({ id: 1, score: 70 });
    await s.score(ctx());
    s.reset();
    expect(s.cache()).toBeNull();
    expect(s.fromCache()).toBe(false);
    expect(s.stale()).toBe(false);
  });
});

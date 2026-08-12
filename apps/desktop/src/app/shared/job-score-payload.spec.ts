import {
  ScoreResponse,
  ScoreRunResult,
  parseScoreResponse,
  postTailorSaveInput,
  scoreCacheSaveInput,
  tailoredScoringCache,
} from './job-score-payload';

/**
 * The pure half of job scoring, asserted without a database or an AI client.
 *
 * The three payload builders exist because scoring writes the same fourteen
 * fields three times, and the interesting part is where they deliberately
 * differ: the two builders fed by a fresh parse default only the one field the
 * skill may omit, while the commit path defaults every field, because by then
 * the row has been through an in-memory hop and a save that threw on one absent
 * column would lose a score the user has already been shown.
 */
describe('job-score-payload', () => {
  const parsed: ScoreResponse = {
    score: 72,
    dimensions: [{ name: 'skills', score: 8 } as never],
    missing_keywords: ['kubernetes'],
    red_flags: ['unpaid overtime'],
    ats_pass: true,
    ats_notes: 'clean',
    summary: 'a good fit',
    before_you_submit: ['add a metric'],
  };

  const run: ScoreRunResult = { parsed, modelUsed: 'economy', tokensInput: 100, tokensOutput: 50 };

  describe('parseScoreResponse', () => {
    it('reads a plain JSON reply', () => {
      expect(parseScoreResponse(JSON.stringify({ score: 5 })).score).toBe(5);
    });

    it('strips the fence some models wrap the reply in', () => {
      expect(parseScoreResponse('```json\n{"score":5}\n```').score).toBe(5);
    });

    it('throws with a slice of what came back', () => {
      expect(() => parseScoreResponse('not json at all')).toThrow(
        /AI returned invalid JSON: not json at all/,
      );
    });
  });

  describe('scoreCacheSaveInput', () => {
    const input = scoreCacheSaveInput({
      jobId: 7,
      profileHash: 'ph1',
      language: 'en',
      run,
    });

    it('encodes the three lists as JSON columns', () => {
      expect(input.dimensionsJson).toBe(JSON.stringify(parsed.dimensions));
      expect(input.missingKeywordsJson).toBe('["kubernetes"]');
      expect(input.redFlagsJson).toBe('["unpaid overtime"]');
      expect(input.beforeYouSubmitJson).toBe('["add a metric"]');
    });

    it('carries the model and the token cost of the call that produced it', () => {
      expect(input.modelUsed).toBe('economy');
      expect(input.tokensInput).toBe(100);
      expect(input.tokensOutput).toBe(50);
    });

    it('defaults the one field the skill is allowed to omit', () => {
      const withoutOptional = scoreCacheSaveInput({
        jobId: 7,
        profileHash: 'ph1',
        language: 'en',
        run: { ...run, parsed: { ...parsed, before_you_submit: undefined } },
      });
      expect(withoutOptional.beforeYouSubmitJson).toBe('[]');
    });
  });

  describe('tailoredScoringCache', () => {
    const cache = tailoredScoringCache({
      jobId: 7,
      profileHash: 'ph1',
      jdHash: 'jd1',
      language: 'en',
      run,
    });

    it('marks the row as never having been persisted', () => {
      expect(cache.id).toBe(-1);
    });

    it('keeps the jd hash, which the baseline row is keyed on too', () => {
      expect(cache.jdHash).toBe('jd1');
    });

    it('carries the same encoded lists as the persisted path', () => {
      expect(cache.missingKeywordsJson).toBe('["kubernetes"]');
      expect(cache.beforeYouSubmitJson).toBe('["add a metric"]');
      expect(cache.score).toBe(72);
    });
  });

  describe('postTailorSaveInput', () => {
    it('carries a complete row through unchanged', () => {
      const complete = tailoredScoringCache({
        jobId: 7,
        profileHash: 'ph1',
        jdHash: 'jd1',
        language: 'en',
        run,
      });

      expect(postTailorSaveInput(complete, 7)).toEqual({
        jobId: 7,
        profileHash: 'ph1',
        language: 'en',
        score: 72,
        dimensionsJson: JSON.stringify(parsed.dimensions),
        missingKeywordsJson: '["kubernetes"]',
        redFlagsJson: '["unpaid overtime"]',
        atsPass: true,
        atsNotes: 'clean',
        summary: 'a good fit',
        beforeYouSubmitJson: '["add a metric"]',
        modelUsed: 'economy',
        tokensInput: 100,
        tokensOutput: 50,
      });
    });

    /**
     * The asymmetry with the two builders above, and the reason it is here: a
     * row that lost a column on the in-memory hop must still save. Losing a
     * score the user has already seen is worse than saving it with an empty
     * column.
     */
    it('defaults every absent column rather than refusing to save', () => {
      const sparse = { profileHash: 'ph1', score: 40 } as never;

      expect(postTailorSaveInput(sparse, 7)).toEqual({
        jobId: 7,
        profileHash: 'ph1',
        language: 'en',
        score: 40,
        dimensionsJson: '[]',
        missingKeywordsJson: '[]',
        redFlagsJson: '[]',
        atsPass: false,
        atsNotes: '',
        summary: '',
        beforeYouSubmitJson: '[]',
        modelUsed: '',
        tokensInput: 0,
        tokensOutput: 0,
      });
    });

    it('takes the job id from the caller, not from the stored row', () => {
      const other = { profileHash: 'ph1', score: 40, jobId: 999 } as never;
      expect(postTailorSaveInput(other, 7).jobId).toBe(7);
    });
  });
});

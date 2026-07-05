import { ScoringCache } from '@applye/core';
import {
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
  starRating,
} from './scoring.utils';

function makeCache(overrides: Partial<ScoringCache> = {}): ScoringCache {
  return {
    id: 1,
    jobId: 1,
    profileHash: 'h',
    jdHash: 'h',
    score: 80,
    ...overrides,
  } as ScoringCache;
}

describe('scoring.utils', () => {
  it('parses dimensions JSON', () => {
    const c = makeCache({ dimensionsJson: JSON.stringify([{ name: 'Skills', score: 8 }]) });
    expect(parseDimensions(c)).toEqual([{ name: 'Skills', score: 8 }]);
  });

  it('returns empty array on invalid dimensions JSON', () => {
    const c = makeCache({ dimensionsJson: 'not json' });
    expect(parseDimensions(c)).toEqual([]);
  });

  it('parses missing keywords', () => {
    const c = makeCache({ missingKeywordsJson: JSON.stringify(['Kubernetes']) });
    expect(parseMissingKeywords(c)).toEqual(['Kubernetes']);
  });

  it('parses red flags', () => {
    const c = makeCache({ redFlagsJson: JSON.stringify(['No salary listed']) });
    expect(parseRedFlags(c)).toEqual(['No salary listed']);
  });

  it('parses before-you-submit notes', () => {
    const c = makeCache({ beforeYouSubmitJson: JSON.stringify(['Deadline in 3 days']) });
    expect(parseBeforeYouSubmit(c)).toEqual(['Deadline in 3 days']);
  });

  it('computes star rating from score', () => {
    expect(starRating(100)).toBe('5.0');
    expect(starRating(0)).toBe('1.0');
  });
});

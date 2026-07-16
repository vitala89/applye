import { ScoringCache } from '@applye/core';
import {
  dimensionBand,
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
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

  it('bands a dimension score on the same 75/50 thresholds as the gauge', () => {
    // Displayed as `score * 10`%, so these boundaries mirror 75% / 50%.
    expect(dimensionBand(8)).toBe('high'); // 80%
    expect(dimensionBand(7.5)).toBe('high'); // 75%
    expect(dimensionBand(7)).toBe('mid'); // 70%
    expect(dimensionBand(5)).toBe('mid'); // 50%
    expect(dimensionBand(4)).toBe('low'); // 40%
  });
});

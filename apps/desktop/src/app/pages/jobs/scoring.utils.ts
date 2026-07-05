import { ScoreDimension, ScoringCache } from '@applye/core';

export function parseDimensions(c: ScoringCache): ScoreDimension[] {
  try {
    return JSON.parse(c.dimensionsJson ?? '[]');
  } catch {
    return [];
  }
}

export function parseMissingKeywords(c: ScoringCache): string[] {
  try {
    return JSON.parse(c.missingKeywordsJson ?? '[]');
  } catch {
    return [];
  }
}

export function parseRedFlags(c: ScoringCache): string[] {
  try {
    return JSON.parse(c.redFlagsJson ?? '[]');
  } catch {
    return [];
  }
}

export function parseBeforeYouSubmit(c: ScoringCache): string[] {
  try {
    return JSON.parse(c.beforeYouSubmitJson ?? '[]');
  } catch {
    return [];
  }
}

export function starRating(score: number): string {
  return ((score / 100) * 4 + 1).toFixed(1);
}

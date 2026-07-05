import { ScoreDimension, ScoringCache } from '@applye/core';
import { LucideIconData } from 'lucide-angular';

export interface JobDetailIcons {
  atsPass: LucideIconData;
  atsFail: LucideIconData;
  tag: LucideIconData;
  flag: LucideIconData;
  scan: LucideIconData;
  checklist: LucideIconData;
  next: LucideIconData;
  star: LucideIconData;
  db: LucideIconData;
  bookmark: LucideIconData;
  wand: LucideIconData;
  close: LucideIconData;
  back: LucideIconData;
  checkCircle: LucideIconData;
  languages: LucideIconData;
  chevronDown: LucideIconData;
  chevronUp: LucideIconData;
  shieldCheck: LucideIconData;
  sparkles: LucideIconData;
  gitCompare: LucideIconData;
  alertTriangle: LucideIconData;
  minus: LucideIconData;
  plus: LucideIconData;
  pencil: LucideIconData;
  hammer: LucideIconData;
  scanSearch: LucideIconData;
  pencilLine: LucideIconData;
  fileText: LucideIconData;
  fileDown: LucideIconData;
  externalLink: LucideIconData;
  copy: LucideIconData;
  check: LucideIconData;
}

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

export type ScoreVerdictKey = 'reject' | 'consider' | 'strong';

export function scoreVerdictKey(score: number): ScoreVerdictKey {
  if (score >= 75) return 'strong';
  if (score >= 50) return 'consider';
  return 'reject';
}

const VERDICT_LABEL_KEYS: Record<ScoreVerdictKey, string> = {
  reject: 'jobs.verdict_reject',
  consider: 'jobs.verdict_consider',
  strong: 'jobs.verdict_strong',
};

export function scoreVerdictLabelKey(score: number): string {
  return VERDICT_LABEL_KEYS[scoreVerdictKey(score)];
}

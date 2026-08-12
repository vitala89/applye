import {
  CvContent,
  DocumentLibraryItem,
  Job,
  Profile,
  ScoringCache,
  Settings,
  cvContentToMd,
} from '@applye/core';

/**
 * The pure half of the three-pass tailoring pipeline: what a pass is, what it
 * reads, and how a model's reply becomes one.
 *
 * Split out of `tailoring.service.ts` rather than extracted for its own sake.
 * The service was 305 lines against the 250 the application layer allows every
 * file, and none of what follows needs a database, an AI client or an injector -
 * so it is the half that can be asserted directly, and the half whose move costs
 * nothing.
 */

export interface PassResult {
  pass: number;
  resultMd: string;
  changes: string[];
  gaps: string[];
  inputHash: string;
  fromCache: boolean;
  tokensIn: number;
  tokensOut: number;
}

/** Everything a run reads. Owned by the caller and passed per call, so there is
 * no second copy of the job, profile or selected CV to keep in sync. */
export interface TailorContext {
  job: Job | null;
  profile: Profile | null;
  settings: Settings | null;
  jdText: string;
  scoring: ScoringCache | null;
  baseCvId: number | null;
  matchingCvs: DocumentLibraryItem[];
}

export const PASSES = [1, 2, 3] as const;
export type PassNumber = (typeof PASSES)[number];

/** The raw shape one pass is stored and rebuilt from - cache row or fresh reply
 * alike, which is what lets both paths land through one builder. */
export interface PassResultInput {
  pass: number;
  resultMd: string;
  changesJson: string | undefined;
  gapsJson: string | undefined;
  inputHash: string;
  fromCache: boolean;
  tokensIn: number;
  tokensOut: number;
}

/** Total by design: a row whose JSON will not parse yields an empty list rather
 * than aborting a restore that has already produced usable passes. */
export function parseJsonArray(json: string | undefined): string[] {
  try {
    return JSON.parse(json ?? '[]');
  } catch {
    return [];
  }
}

export function buildPassResult(input: PassResultInput): PassResult {
  return {
    pass: input.pass,
    resultMd: input.resultMd,
    inputHash: input.inputHash,
    fromCache: input.fromCache,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    changes: parseJsonArray(input.changesJson),
    gaps: parseJsonArray(input.gapsJson),
  };
}

export function resultMdForPass(passes: readonly PassResult[], pass: number): string {
  return passes.find((r) => r.pass === pass)?.resultMd ?? '';
}

/** The text the passes rewrite: the chosen base CV when there is one, the
 * profile markdown otherwise. An unparseable CV falls back to the profile
 * rather than tailoring an empty document. */
export function baselineFor(ctx: TailorContext): string {
  const fallback = ctx.profile?.fullMd ?? '';
  if (!ctx.baseCvId) return fallback;
  const cvItem = ctx.matchingCvs.find((c) => c.id === ctx.baseCvId);
  if (!cvItem?.contentJson) return fallback;
  try {
    return cvContentToMd(JSON.parse(cvItem.contentJson) as CvContent);
  } catch {
    return fallback;
  }
}

/**
 * Unwraps the ```json fence some models add and reads the pass out of it.
 *
 * @throws when the reply is not JSON once unwrapped. Deliberately loud: a pass
 * that produced nothing usable must stop the run rather than append an empty
 * result the next pass would then be keyed on.
 */
export function parsePassResult(
  text: string,
  pass: number,
): { result_md: string; changes: string[]; gaps: string[] } {
  try {
    const raw = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(raw);
    return {
      result_md: String(parsed.result_md ?? ''),
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    };
  } catch {
    throw new Error(`Pass ${pass} returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

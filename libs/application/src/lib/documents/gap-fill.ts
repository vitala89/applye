import { WritableSignal } from '@angular/core';

import { buildAdditionalInfoBlock, type CvGapAnswer, type CvGapQuestion } from '@applye/core';

export type GapAnswers = { answers: CvGapAnswer[]; saveToProfile: boolean } | null;

/**
 * The outcome of a gap analysis, as two distinguishable cases.
 *
 * A bare `CvGapQuestion[]` could not tell "the model found nothing to ask"
 * apart from "the model was never reached" - a missing key, a dead network or a
 * spent quota all arrived as `[]`, and the document was generated on incomplete
 * information with nothing said about it. Both cases still let generation
 * continue; only one of them is worth telling the user about.
 */
export type GapAnalysis = { ok: true; questions: CvGapQuestion[] } | { ok: false; error: string };

/** The three hand-offs the page owns, because both draft flows share them. */
export interface GapFillHooks {
  analyzeGaps: (text: string) => Promise<GapAnalysis>;
  askGaps: (questions: CvGapQuestion[]) => Promise<GapAnswers>;
  saveToProfile: (block: string) => Promise<void>;
}

/**
 * Saving answers to the profile is a best-effort extra: by the time it runs the
 * answers are already folded into the text being generated from, so a failed
 * write must never abort the generation that follows.
 */
export async function saveBlockBestEffort(hooks: GapFillHooks, block: string): Promise<void> {
  if (!block) return;
  try {
    await hooks.saveToProfile(block);
  } catch {
    // Intentionally swallowed - see above.
  }
}

/**
 * Agentic gap-fill, shared by the CV and cover-letter drafts: ask about what
 * the job wants that the source text lacks, then fold the answers back into it.
 *
 * Fail-open and skippable. `analyzing` is cleared on every path, including the
 * one where the analysis itself throws, so the dialog's spinner can never
 * outlive the call.
 *
 * A failed analysis (`ok: false`) returns the source text unchanged, exactly as
 * an empty question list does - the difference is that the failure has already
 * been reported by whoever produced it, so the user learns the document was
 * generated without the gap questions rather than assuming there were none.
 */
export async function foldInGapAnswers(
  sourceText: string,
  hooks: GapFillHooks,
  analyzing: WritableSignal<boolean>,
): Promise<string> {
  analyzing.set(true);
  let additionalInfo: string;
  try {
    const analysis = await hooks.analyzeGaps(sourceText);
    analyzing.set(false);
    if (!analysis.ok || !analysis.questions.length) return sourceText;
    const result = await hooks.askGaps(analysis.questions);
    if (!result) return sourceText;
    additionalInfo = buildAdditionalInfoBlock(result.answers);
    if (result.saveToProfile) await saveBlockBestEffort(hooks, additionalInfo);
  } finally {
    analyzing.set(false);
  }
  return additionalInfo ? `${sourceText}\n\n${additionalInfo}` : sourceText;
}

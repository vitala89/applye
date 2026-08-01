import { WritableSignal } from '@angular/core';
import {
  buildAdditionalInfoBlock,
  type CvGapAnswer,
  type CvGapQuestion,
} from '../pages/documents/cv-content.util';

export type GapAnswers = { answers: CvGapAnswer[]; saveToProfile: boolean } | null;

/** The three hand-offs the page owns, because both draft flows share them. */
export interface GapFillHooks {
  analyzeGaps: (text: string) => Promise<CvGapQuestion[]>;
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
 */
export async function foldInGapAnswers(
  sourceText: string,
  hooks: GapFillHooks,
  analyzing: WritableSignal<boolean>,
): Promise<string> {
  analyzing.set(true);
  let additionalInfo: string;
  try {
    const questions = await hooks.analyzeGaps(sourceText);
    analyzing.set(false);
    if (!questions.length) return sourceText;
    const result = await hooks.askGaps(questions);
    if (!result) return sourceText;
    additionalInfo = buildAdditionalInfoBlock(result.answers);
    if (result.saveToProfile) await saveBlockBestEffort(hooks, additionalInfo);
  } finally {
    analyzing.set(false);
  }
  return additionalInfo ? `${sourceText}\n\n${additionalInfo}` : sourceText;
}

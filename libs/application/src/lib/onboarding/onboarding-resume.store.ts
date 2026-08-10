import { Injectable, inject, signal } from '@angular/core';
import type { AiMode, AiProvider, CvParsedContent } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { OnboardingReviewStore } from './onboarding-review.store';

/** How the user is giving the wizard their history, if at all. */
export type ResumePath = 'upload' | 'paste' | 'skip';

/**
 * Which provider the wizard's own AI calls must go to. The AI-setup step's
 * choices only reach the settings row when the wizard finishes, so this cannot
 * be read back from settings - it is passed in by the wizard, which owns it.
 */
export interface OnboardingAiDispatch {
  mode: AiMode;
  provider: AiProvider;
  model: string;
}

/**
 * Step 2 of the wizard: the resume, however it arrives, and the parse that
 * turns it into something the Review step can show.
 *
 * The third sibling of `OnboardingAiKeyService` and `OnboardingCliBridgeService`,
 * and built the same way: the wizard provides it, the step component reads and
 * mutates it directly, and the wizard reads the same signals back for its
 * Continue gate.
 *
 * **It does not navigate.** `parse` answers whether it worked; advancing a step
 * - and the jump that skips Review entirely when there is nothing to review -
 * stays with the wizard, which is the only thing that knows where it is.
 *
 * **It does not open the file dialog either.** The page picks a path and hands
 * it over, the same shape every other store in this campaign settled on.
 */
@Injectable()
export class OnboardingResumeStore {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly review = inject(OnboardingReviewStore);

  readonly path = signal<ResumePath>('upload');
  readonly fileName = signal<string | null>(null);
  readonly text = signal('');
  /** Set only by the upload path - the paste path has no file to hash. Carried
   * so the CV document written on finish can reuse the Documents import's
   * duplicate guard. */
  readonly inputHash = signal<string | undefined>(undefined);
  readonly parsing = signal(false);
  readonly failed = signal(false);
  /** The raw failure behind `failed`, shown under the friendly line. */
  readonly failureDetail = signal<string | null>(null);

  /** True when there is nothing to parse - either the user skipped, or the
   * chosen path produced no text. The wizard uses this to jump past Review. */
  hasNothingToParse(): boolean {
    return this.path() === 'skip' || !this.text().trim();
  }

  /**
   * Choosing "skip" after a parse must actually drop the parse. Otherwise the
   * profile still gets written from the resume the user just walked away from,
   * while the Ready step tells them it was skipped.
   *
   * Returns whether the caller should now open a file dialog - the upload tile
   * offers one immediately when nothing is attached yet, and this store does not
   * open dialogs.
   */
  choose(path: ResumePath): boolean {
    this.path.set(path);
    this.failed.set(false);
    if (path === 'skip') this.review.discardParse();
    return path === 'upload' && !this.fileName();
  }

  /** Pasted text has no source file, so it drops any hash a previous upload left
   * behind rather than tagging the CV document with a hash of content that is no
   * longer there. */
  setPasted(text: string): void {
    this.text.set(text);
    this.inputHash.set(undefined);
    this.review.discardParse();
  }

  /** Reads the file the page chose. Never rejects. */
  async loadFile(path: string): Promise<boolean> {
    this.failed.set(false);
    this.failureDetail.set(null);
    try {
      const file = await this.db.cvImportReadFile(path);
      this.text.set(file.text);
      this.inputHash.set(file.inputHash);
      this.fileName.set(path.split(/[/\\]/).pop() ?? path);
      this.review.discardParse();
      return true;
    } catch (e) {
      this.failed.set(true);
      this.failureDetail.set(String(e));
      return false;
    }
  }

  /**
   * Runs the `cv-import` skill over whatever text there is and seeds the Review
   * step from it. `null` when there was nothing to parse - a refusal, not a
   * failure.
   *
   * `parseAnswer` is `parseCvSkillResponse`, which lives in `apps/desktop` and
   * has six importers there, so it is passed in rather than moved - the seam
   * `CvCodec` already defines for the Documents stores (ADR-0005, amendment
   * six). It throws on an answer that is not the shape asked for, which is
   * caught below like any other failure.
   */
  async parse(
    dispatch: OnboardingAiDispatch,
    parseAnswer: (text: string) => CvParsedContent,
  ): Promise<boolean | null> {
    const text = this.text().trim();
    if (!text || this.parsing()) return null;
    this.parsing.set(true);
    this.failed.set(false);
    this.failureDetail.set(null);
    try {
      const settings = await this.db.getSettings();
      // Match the Documents cv-import pipeline: the skill's `language` drives
      // label text and follows the UI language, not the document output language.
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-import', { cv_text: text, language });
      const res = await this.ai.run({
        ...dispatch,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        // Same ceiling as the Documents import: a resume long enough to truncate
        // the answer comes back as unparseable JSON, which reads as a parse bug.
        maxTokens: 8192,
      });
      this.review.parsedCv.set(parseAnswer(res.text));
      this.review.seedReviewFields();
      return true;
    } catch (e) {
      this.failed.set(true);
      // The friendly line stays, but the real reason has to be visible: an auth
      // failure, a missing key and a genuinely malformed answer all landed on
      // the same sentence, and none of them was ever a parsing problem.
      this.failureDetail.set(String(e));
      return false;
    } finally {
      this.parsing.set(false);
    }
  }
}

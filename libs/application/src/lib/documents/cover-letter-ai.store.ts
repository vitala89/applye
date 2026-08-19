import { Injectable, inject, signal } from '@angular/core';
import type { Settings, SupportedLanguage } from '@applye/core';
import { parseCoverLetterResponse } from '@applye/core';
import { AiService, ProfileSettingsGateway, SystemGateway } from '@applye/data';
import { CoverLetterContentStore } from './cover-letter-content.store';
import { CoverLetterDocumentStore } from './cover-letter-document.store';
import {
  COVER_LETTER_SECTION_ALL,
  COVER_LETTER_SKILL,
  CoverLetterNoProfileError,
  applyCoverLetterBlock,
  applyCoverLetterDraft,
  coverLetterHashInput,
  coverLetterJobDescription,
  coverLetterSectionName,
  currentBlockHash,
  resolveLetterLanguage,
} from './cover-letter-generation';

/**
 * Drafting a whole cover letter from the profile, and regenerating one block of
 * it.
 *
 * **Component-scoped, and it writes through `CoverLetterContentStore`** rather
 * than holding a letter of its own: the content store owns the letter, and two
 * stores writing it is the clobbering this decomposition exists to avoid. It
 * reads the row from `CoverLetterDocumentStore` for the document's language.
 *
 * **It never notifies** (ADR-0005, amendment three). A missing profile raises
 * `CoverLetterNoProfileError` and everything else propagates as-is; the page
 * decides what the user reads.
 *
 * **Both paths populate the editor only.** Neither saves - AI assists, the user
 * reviews and decides, which is why the row is untouched here.
 */
@Injectable()
export class CoverLetterAiStore {
  private readonly db = inject(ProfileSettingsGateway);
  private readonly system = inject(SystemGateway);
  private readonly ai = inject(AiService);
  private readonly letter = inject(CoverLetterContentStore);
  private readonly document = inject(CoverLetterDocumentStore);

  readonly drafting = signal(false);
  /** The section currently being regenerated - a block key, or `body_<i>` for a
   * paragraph - and `null` when none is. */
  readonly regeneratingBlock = signal<string | null>(null);

  /** True while either path is running. Both guard on it, because the two write
   * the same letter and the loser of a race would overwrite the winner. */
  private busy(): boolean {
    return this.drafting() || this.regeneratingBlock() !== null;
  }

  /** Renders the skill and runs it, returning the model's raw text. Takes the
   * settings the caller has already read, rather than reading them again. */
  private async generate(
    section: string,
    profileMd: string,
    settings: Settings,
    ctx: {
      jobDescription: string;
      language: SupportedLanguage;
      tone: string;
      length: string;
      details: Record<string, string>;
    },
  ): Promise<string> {
    const rendered = await this.ai.renderSkill(COVER_LETTER_SKILL, {
      profile_md: profileMd,
      job_description: ctx.jobDescription,
      language: ctx.language,
      section,
      tone: ctx.tone,
      length: ctx.length,
      ...ctx.details,
    });
    const res = await this.ai.run({
      mode: settings.aiMode,
      provider: settings.provider,
      model: settings.defaultModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: ctx.language,
    });
    return res.text;
  }

  /**
   * Fills every block in one pass, honoring the current tone and length.
   * Returns `false` without calling the model when there is nothing to do - the
   * other path is running, or there is no document.
   */
  async draftWithAI(): Promise<boolean> {
    const doc = this.document.doc();
    if (this.busy() || !doc) return false;
    this.drafting.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new CoverLetterNoProfileError();

      const text = await this.generate(
        COVER_LETTER_SECTION_ALL,
        profile.fullMd,
        settings,
        this.context(doc.language, settings),
      );
      this.letter.content.set(
        applyCoverLetterDraft(this.letter.content(), parseCoverLetterResponse(text)),
      );
      return true;
    } finally {
      this.drafting.set(false);
    }
  }

  /**
   * Regenerates one block. Returns `false` without calling the model when there
   * is nothing to do - the other path is running, there is no document, or the
   * block's stored hash already matches what these inputs would produce, in
   * which case the answer would be identical and the call is skipped rather
   * than paid for.
   */
  async regenerateBlock(blockKey: string, index: number | undefined): Promise<boolean> {
    const doc = this.document.doc();
    if (this.busy() || !doc) return false;

    const sectionName = coverLetterSectionName(blockKey, index);
    this.regeneratingBlock.set(sectionName);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new CoverLetterNoProfileError();

      const ctx = this.context(doc.language, settings);
      const sourceHash = await this.system.hashText(
        coverLetterHashInput(
          profile.fullMd,
          ctx.jobDescription,
          ctx.language,
          sectionName,
          this.letter.tone(),
          this.letter.length(),
          this.letter.applicationDetails(),
        ),
      );
      if (currentBlockHash(this.letter.content().hashes, blockKey, index) === sourceHash) {
        return false;
      }

      const text = await this.generate(sectionName, profile.fullMd, settings, ctx);
      this.letter.content.set(
        applyCoverLetterBlock(
          this.letter.content(),
          blockKey,
          index,
          parseCoverLetterResponse(text),
          sourceHash,
        ),
      );
      return true;
    } finally {
      this.regeneratingBlock.set(null);
    }
  }

  /** Everything both paths send the skill that comes from the letter and the row
   * rather than from the caller. */
  private context(docLanguage: SupportedLanguage | undefined, settings: Settings) {
    return {
      jobDescription: coverLetterJobDescription(this.letter.content().jobDescription),
      language: resolveLetterLanguage(docLanguage, settings.defaultDocLanguage),
      tone: this.letter.tone(),
      length: this.letter.length(),
      details: this.letter.applicationDetails() as unknown as Record<string, string>,
    };
  }
}

import { Injectable, inject, signal } from '@angular/core';
import type { CvSectionKey, Settings } from '@applye/core';
import { mergeRegeneratedSection, parseCvSkillResponse } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { CvDocumentStore } from './cv-document.store';
import {
  CvNoProfileError,
  type PersonalDetailsSection,
  mergePersonalDetails,
  regenerationHashInput,
  resolveDocLanguage,
} from './cv-regeneration';

/** The skill both paths render, and the token ceiling both ask for. */
const CV_SKILL = 'cv-generate-baseline';
const MAX_TOKENS = 8192;

/**
 * Regenerating a CV section from the profile, and pulling fresh personal
 * details into it.
 *
 * **Component-scoped, and it writes through `CvDocumentStore`** rather than
 * holding its own section list: the document owns the row, and two stores
 * writing the same sections is the clobbering this decomposition exists to
 * avoid.
 *
 * **It never notifies** (ADR-0005, amendment three). A missing profile raises
 * `CvNoProfileError` and everything else propagates as-is; the page decides
 * what the user reads.
 */
@Injectable()
export class CvRegenerationStore {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly document = inject(CvDocumentStore);

  readonly regeneratingKey = signal<CvSectionKey | null>(null);
  readonly pullingProfile = signal(false);

  /** Renders the skill and runs it, returning the model's raw text. Takes the
   * settings both callers have already read, rather than reading them again. */
  private async generate(
    section: string,
    profileMd: string,
    scoringJson: string,
    settings: Settings,
    ctx: { regionTag: string; archetypeTag: string; language: string },
  ): Promise<string> {
    const rendered = await this.ai.renderSkill(CV_SKILL, {
      profile_md: profileMd,
      scoring_json: scoringJson,
      region_tag: ctx.regionTag,
      archetype_tag: ctx.archetypeTag,
      language: ctx.language,
      section,
    });
    const res = await this.ai.run({
      mode: settings.aiMode,
      provider: settings.provider,
      model: settings.defaultModel,
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      language: ctx.language,
      maxTokens: MAX_TOKENS,
    });
    return res.text;
  }

  /**
   * Regenerates one section. Returns `false` without calling the model when
   * there is nothing to do - another regeneration is running, there is no
   * document, or the section's `sourceHash` already matches what this profile
   * and these settings would produce.
   */
  async regenerateSection(key: CvSectionKey): Promise<boolean> {
    const doc = this.document.doc();
    if (this.regeneratingKey() || !doc) return false;
    this.regeneratingKey.set(key);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new CvNoProfileError();

      const language = resolveDocLanguage(doc.language, settings.defaultDocLanguage);
      const regionTag = this.document.regionTag();
      const archetypeTag = doc.archetypeTag ?? 'generalist';

      const sourceHash = await this.db.hashText(
        regenerationHashInput(profile.fullMd, regionTag, archetypeTag, language, key),
      );
      // Same inputs as last time: the model would return the same section, so
      // the call is skipped rather than paid for.
      if (this.document.sections().find((s) => s.key === key)?.sourceHash === sourceHash) {
        return false;
      }

      const text = await this.generate(key, profile.fullMd, profile.scoringJson ?? '{}', settings, {
        regionTag,
        archetypeTag,
        language,
      });
      const updated = mergeRegeneratedSection(
        { sections: this.document.sections() },
        key,
        parseCvSkillResponse(text),
        sourceHash,
      );
      this.document.setSections(updated.sections);
      return true;
    } finally {
      this.regeneratingKey.set(null);
    }
  }

  /**
   * Refreshes the personal-details section from the profile. Returns `false`
   * without calling the model when a pull is already running or the document
   * has no personal-details section.
   */
  async pullFromProfile(): Promise<boolean> {
    const personal = this.document
      .sections()
      .find((s): s is PersonalDetailsSection => s.key === 'personal_details');
    if (this.pullingProfile() || !personal) return false;
    this.pullingProfile.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new CvNoProfileError();

      const doc = this.document.doc();
      const text = await this.generate(
        'personalDetails',
        profile.fullMd,
        profile.scoringJson ?? '{}',
        settings,
        {
          regionTag: this.document.regionTag(),
          archetypeTag: doc?.archetypeTag ?? 'generalist',
          language: resolveDocLanguage(doc?.language, settings.defaultDocLanguage),
        },
      );
      this.document.replaceSection(
        mergePersonalDetails(personal, parseCvSkillResponse(text).personalDetails),
      );
      return true;
    } finally {
      this.pullingProfile.set(false);
    }
  }
}

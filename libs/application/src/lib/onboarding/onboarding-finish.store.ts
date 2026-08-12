import { Injectable, inject } from '@angular/core';
import {
  archetypeNames,
  parseArchetypes,
  serializeArchetypes,
  serializeCompensation,
  type Profile,
} from '@applye/core';
import { DbService } from '@applye/data';
import {
  appendCompensation,
  applyContactOverrides,
  buildOnboardingCvInput,
  cvToProfileMarkdown,
  hasCvForInputHash,
  regionTagForUiLanguage,
  type ParsedCv,
} from './onboarding-content.util';
import { OnboardingResumeStore } from './onboarding-resume.store';
import { OnboardingReviewStore } from './onboarding-review.store';
import { OnboardingTargetingStore } from './onboarding-targeting.store';

/** What writing the CV document did. Three outcomes rather than a boolean
 * because the page shows a toast for exactly one of them and the other two are
 * both silent for different reasons: `skipped` is the wizard declining to write
 * (nothing parsed, the user skipped, or the same file is already in Documents),
 * while `failed` is a write that was attempted and refused (ADR-0005, amendment
 * fifteen). */
export type OnboardingCvSaveOutcome = 'saved' | 'skipped' | 'failed';

/**
 * Everything the wizard reads from and writes back to the profile: the existing
 * row it must not destroy on a re-run, the markdown it composes from the parsed
 * resume, and the CV document it hands to Documents.
 *
 * It injects its three siblings rather than being handed their values, because
 * every one of those values is a signal they already own and a second copy of a
 * signal is a divergence waiting to happen (ADR-0005, amendment fourteen).
 */
@Injectable()
export class OnboardingFinishStore {
  private readonly db = inject(DbService);
  private readonly resume = inject(OnboardingResumeStore);
  private readonly review = inject(OnboardingReviewStore);
  private readonly targeting = inject(OnboardingTargetingStore);

  /** On a re-run the wizard opens blank, so the roles the user already has must
   * be loaded in - otherwise Ready reports "0 roles selected" and Finish writes
   * an empty list over them. Only seeds; the user stays free to unpick. */
  async seedTargetingFromProfile(): Promise<void> {
    const existing = await this.readExistingProfile();
    // The profile stores full `Archetype` objects; this wizard only ever deals
    // in names and re-wraps them on save, so seed the names.
    const roles = archetypeNames(parseArchetypes(existing?.targetArchetypes));
    if (!roles.length || this.targeting.archetypes().length) return;
    this.targeting.seedRoles(roles);
  }

  /**
   * `db_upsert_profile` replaces the whole row - a field left out is written as
   * NULL, not preserved. The wizard only authors `fullMd` and the archetypes, so
   * on a re-run it must carry the rest forward or it silently destroys the
   * scoring and pitch the user paid an AI call for. The stale scoring that
   * survives a resume change is harmless: `scoringHash` no longer matches the
   * new `fullMd`, which is exactly how Profile knows to offer a re-score.
   */
  async saveProfile(): Promise<void> {
    const existing = await this.readExistingProfile();
    const base = cvToProfileMarkdown(this.buildProfileCv()).trim();
    // No resume this run - a re-run that only re-targets keeps the markdown the
    // user already has instead of blanking it.
    const fullMd = base
      ? appendCompensation(
          base,
          // Serialize with the same helper the profile form uses so the target
          // is written under a body `parseProfileMd` reads back. Period is the
          // targeting step's implicit unit (annual).
          serializeCompensation({
            min: String(this.targeting.compMin()),
            max: String(this.targeting.compMax()),
            currency: this.targeting.compCurrency(),
            period: 'year',
          }),
        )
      : (existing?.fullMd ?? '');
    // Nothing parsed, nothing saved before, no roles picked: a first run the
    // user skipped through. Writing an empty row would only make the dashboard
    // banner disagree with itself.
    if (!fullMd.trim() && !this.targeting.archetypes().length) return;
    await this.db.upsertProfile({
      fullMd,
      scoringJson: existing?.scoringJson,
      scoringHash: existing?.scoringHash,
      pitchMd: existing?.pitchMd,
      pitchHash: existing?.pitchHash,
      targetArchetypes: serializeArchetypes(
        parseArchetypes(JSON.stringify(this.targeting.archetypes())),
      ),
    });
  }

  /**
   * The wizard already parsed the resume into exactly the shape Documents
   * stores, so it writes the CV document itself instead of leaving the user to
   * import the same file a second time. Fail-open: a CV that cannot be written
   * must never trap the user in onboarding or lose the profile - the Documents
   * import stays available either way, and the caller decides whether to say so.
   *
   * `fallbackLabel` arrives translated because this layer has no
   * `TranslateService`.
   */
  async saveCvDocument(args: { fallbackLabel: string }): Promise<OnboardingCvSaveOutcome> {
    const parsed = this.review.parsedCv();
    if (!parsed || this.resume.path() === 'skip') return 'skipped';
    try {
      const settings = await this.db.getSettings();
      const inputHash = this.resume.inputHash();
      // Re-running the wizard on the same file must not stack up copies. The
      // existing document wins: it may already carry edits made in Documents,
      // and silently overwriting those would cost more than a skipped rewrite.
      if (hasCvForInputHash(await this.db.documentLibraryList('cv'), inputHash)) return 'skipped';
      await this.db.documentLibraryUpsert(
        buildOnboardingCvInput({
          parsed,
          overrides: this.review.overrides(),
          templates: await this.db.cvTemplatesList(),
          regionTag: regionTagForUiLanguage(settings.uiLanguage),
          language: settings.defaultDocLanguage ?? 'en',
          fallbackLabel: args.fallbackLabel,
          inputHash,
        }),
      );
      return 'saved';
    } catch (e) {
      // Fail open - the CV is a bonus on top of the profile, never a blocker.
      // Still say so: the alternative is a user who finds no CV in Documents
      // and has nothing to report.
      console.error('onboarding: could not write the CV document', e);
      return 'failed';
    }
  }

  private buildProfileCv(): ParsedCv {
    const cv = this.review.parsedCv();
    return {
      // Spread the parsed contact first so website, LinkedIn and title survive;
      // the review overrides then replace only the four fields the user edited
      // (name/email/phone/address), mirroring buildOnboardingCvInput.
      personalDetails: {
        ...cv?.personalDetails,
        ...applyContactOverrides(this.review.overrides()),
      },
      summary: cv?.summary ?? null,
      experience: cv?.experience ?? [],
      skills: cv?.skills ?? [],
      education: cv?.education ?? [],
      languages: cv?.languages ?? [],
    };
  }

  private async readExistingProfile(): Promise<Profile | null> {
    try {
      return await this.db.getProfile();
    } catch {
      // Unreadable profile - better to write the new one than to lose the run.
      return null;
    }
  }
}

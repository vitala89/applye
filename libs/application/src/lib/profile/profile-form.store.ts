import { Injectable, signal } from '@angular/core';
import {
  type EducationEntry,
  EMPTY_FORM,
  type ExperienceEntry,
  type LanguageEntry,
  type ProfileForm,
  parseEducationEntries,
  parseExperienceEntries,
  parseLanguageEntries,
  parseProfileMd,
  serializeEducationEntries,
  serializeExperienceEntries,
  serializeLanguageEntries,
  serializeProfileForm,
} from '@applye/core';
import {
  type ParsedProfile,
  parsedContactPatch,
  parsedEducationEntries,
  parsedExperienceEntries,
  parsedLanguageEntries,
  parsedSkills,
} from './profile-parse.util';
import { withBackfilledNameParts, withComposedName } from './profile-name.util';

/**
 * The profile editor itself: the markdown, the form it is parsed into, the
 * three structured mirrors the section editors bind to, and the raw-mode
 * toggle.
 *
 * Its own store rather than part of `ProfileStore` for a measured reason: the
 * two together came to 324 lines against a 250 budget (ADR-0005, amendment
 * thirty-seven). The seam is real - nothing here touches the database, and
 * everything here is the text the user is typing.
 *
 * The dependency runs **one way**: `ProfileStore` reads this to decide whether
 * the page is dirty. This store knows nothing about the saved row.
 */
@Injectable()
export class ProfileFormStore {
  readonly fullMd = signal('');
  readonly rawMode = signal(false);
  readonly form = signal<ProfileForm>({ ...EMPTY_FORM });

  /**
   * Structured mirror of `form().education` for the multi-entry editor. Its own
   * signal, not a computed, so a freshly-added blank row survives until the user
   * fills it - `serializeEducationEntries` drops blank lines from the string,
   * but the row must stay editable. Re-seeded whenever the form is reparsed.
   */
  readonly educationEntries = signal<EducationEntry[]>([]);
  /** Structured mirror of `form().experienceText`, same rationale. */
  readonly experienceEntries = signal<ExperienceEntry[]>([]);
  /** Structured mirror of `form().languages`, same rationale. */
  readonly languageEntries = signal<LanguageEntry[]>([]);

  private syncMdFromForm(): void {
    this.fullMd.set(serializeProfileForm(this.form()));
  }

  /**
   * Reads markdown into the form, backfilling the name split for profiles that
   * predate the first/last fields. The derive happens here rather than inside
   * `parseProfileMd` so the parser stays a faithful reader and its round-trip
   * identity test keeps its meaning. Nothing is written back on read alone.
   */
  applyLoadedMarkdown(md: string): void {
    this.form.set(withBackfilledNameParts(parseProfileMd(md)));
  }

  /** Seeds everything from one markdown string, as a load does. */
  adoptMarkdown(md: string): void {
    this.fullMd.set(md);
    this.applyLoadedMarkdown(md);
    this.reseedEntries();
  }

  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.form.update((f) => {
      const next = { ...f, [key]: value };
      return key === 'firstName' || key === 'lastName' ? withComposedName(f, next) : next;
    });
    this.syncMdFromForm();
  }

  onEducationChanged(entries: EducationEntry[]): void {
    this.educationEntries.set(entries);
    this.updateField('education', serializeEducationEntries(entries));
  }

  onExperienceChanged(entries: ExperienceEntry[]): void {
    this.experienceEntries.set(entries);
    this.updateField('experienceText', serializeExperienceEntries(entries));
  }

  onLanguagesChanged(entries: LanguageEntry[]): void {
    this.languageEntries.set(entries);
    this.updateField('languages', serializeLanguageEntries(entries));
  }

  reseedEntries(): void {
    this.educationEntries.set(parseEducationEntries(this.form().education));
    this.experienceEntries.set(parseExperienceEntries(this.form().experienceText));
    this.languageEntries.set(parseLanguageEntries(this.form().languages));
  }

  /** True when leaving raw mode, so the caller knows to reseed the sections. */
  toggleRawMode(): boolean {
    const leavingRaw = this.rawMode();
    if (leavingRaw) {
      this.applyLoadedMarkdown(this.fullMd());
      this.reseedEntries();
    } else {
      this.syncMdFromForm();
    }
    this.rawMode.update((v) => !v);
    return leavingRaw;
  }

  /**
   * Folds the parse the raw editor emitted into the form and the mirrors, then
   * resyncs `fullMd` and leaves raw mode. Nulls from the AI become '' via the
   * parse helpers, matching what every section entry type expects.
   */
  applyParsedProfile(p: ParsedProfile): void {
    this.form.update((f) => ({ ...f, ...parsedContactPatch(p, f) }));
    this.experienceEntries.set(parsedExperienceEntries(p));
    this.languageEntries.set(parsedLanguageEntries(p));
    this.educationEntries.set(parsedEducationEntries(p));

    this.updateField('skills', parsedSkills(p));
    this.onExperienceChanged(this.experienceEntries());
    this.onLanguagesChanged(this.languageEntries());
    this.onEducationChanged(this.educationEntries());
    this.syncMdFromForm();

    this.rawMode.set(false);
  }
}

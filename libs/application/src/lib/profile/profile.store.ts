import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type Archetype,
  type Profile,
  type Settings,
  missingFields,
  parseArchetypes,
  parseScoringJson,
  pitchState as computePitchState,
  profileCompleteness,
  scoringState as computeScoringState,
  serializeArchetypes,
} from '@applye/core';
import { ProfileSettingsGateway, SystemGateway } from '@applye/data';
import { ProfileFormStore } from './profile-form.store';

/** Every collapsible section on the profile page. */
export type ProfileSectionKey =
  'archetypes' | 'photo' | 'experience' | 'skills' | 'languages' | 'education';

/**
 * The saved profile row and everything derived from it: freshness of the two
 * artefacts, completeness, and which sections are open.
 *
 * The text being edited is `ProfileFormStore`'s, injected here rather than held
 * here - the two together came to 324 lines against a 250 budget, and the seam
 * between "what is saved" and "what is being typed" is where they separate
 * cleanly (ADR-0005, amendment thirty-seven).
 *
 * **`persist` is the only writer of the profile row**, and that is load-bearing
 * rather than tidy. `savedMdHash` describes the row, and a hash that lags the
 * row it describes is exactly what makes the scoring chip report a stale
 * artefact as cached. Every writer that maintained the hash by hand eventually
 * forgot to, so there is one. `ProfileArtifactStore` writes **through** this
 * method rather than around it.
 *
 * **No status sentences here.** Saving records what happened - `lastSavedAt`,
 * `error` - and the page turns that into words, because this layer does not
 * translate.
 */
@Injectable()
export class ProfileStore {
  private readonly db = inject(ProfileSettingsGateway);
  private readonly system = inject(SystemGateway);
  readonly editor = inject(ProfileFormStore);

  readonly profile = signal<Profile | null>(null);
  readonly settings = signal<Settings | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);

  /** Filled by a failed load or save; the page decides what to say. */
  readonly error = signal('');

  /** `updatedAt` of the row as last loaded or saved, for the page's status line. */
  readonly lastSavedAt = signal<string | null>(null);

  readonly archetypes = signal<Archetype[]>([]);

  /** Hash of the saved `fullMd`. `hashText` is an IPC call, so it cannot be
   * derived inside a computed. */
  readonly savedMdHash = signal<string | null>(null);

  readonly scoringOpen = signal(true);
  readonly sectionOpen = signal<Record<ProfileSectionKey, boolean>>({
    archetypes: true,
    photo: true,
    experience: true,
    skills: true,
    languages: true,
    education: true,
  });

  readonly archetypesDirty = computed(
    () =>
      serializeArchetypes(this.archetypes()) !==
      serializeArchetypes(parseArchetypes(this.profile()?.targetArchetypes)),
  );
  readonly mdDirty = computed(() => this.editor.fullMd() !== (this.profile()?.fullMd ?? ''));
  readonly dirty = computed(() => this.mdDirty() || this.archetypesDirty());

  /** Archetype edits are excluded via `mdDirty`: they never enter `fullMd`, so
   * they cannot stale it. */
  readonly scoringState = computed(() =>
    computeScoringState({
      hasScoringJson: !!this.profile()?.scoringJson,
      mdDirty: this.mdDirty(),
      savedMdHash: this.savedMdHash(),
      scoringHash: this.profile()?.scoringHash,
    }),
  );

  /** Same freshness rule as scoring, keyed on the pitch's own hash. */
  readonly pitchState = computed(() =>
    computePitchState({
      hasPitch: !!this.profile()?.pitchMd,
      mdDirty: this.mdDirty(),
      savedMdHash: this.savedMdHash(),
      pitchHash: this.profile()?.pitchHash,
    }),
  );

  readonly completeness = computed(() => profileCompleteness(this.editor.form()));
  readonly gaps = computed(() => missingFields(this.editor.form()));

  /** The facts the hero subtitle is built from, already ordered and de-blanked.
   * The page joins them, because a separator is presentation. */
  readonly heroFacts = computed(() => {
    const s = parseScoringJson(this.profile()?.scoringJson ?? null);
    const f = this.editor.form();
    return [s?.seniority, f.location || s?.location, ...(s?.domains ?? [])].filter(
      (v): v is string => !!v,
    );
  });

  /** Never rejects; a failed load leaves the form empty and fills `error`. */
  async load(): Promise<boolean> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
      this.editor.adoptMarkdown(p?.fullMd ?? '');
      this.archetypes.set(parseArchetypes(p?.targetArchetypes));
      await this.refreshSavedMdHash(p?.fullMd ?? '');
      this.lastSavedAt.set(p?.updatedAt ?? null);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.loading.set(false);
      this.seedSectionOpen();
    }
  }

  toggleScoring(): void {
    this.scoringOpen.update((v) => !v);
  }

  toggleSection(key: ProfileSectionKey): void {
    this.sectionOpen.update((s) => ({ ...s, [key]: !s[key] }));
  }

  /** Leaving raw mode reparses the markdown, so the sections are reseeded from
   * whatever it turned out to contain. */
  toggleRawMode(): void {
    if (this.editor.toggleRawMode()) this.seedSectionOpen();
  }

  /** The raw editor's parse replaces the whole form, so the sections follow it. */
  applyParsedProfile(p: Parameters<ProfileFormStore['applyParsedProfile']>[0]): void {
    this.editor.applyParsedProfile(p);
    this.seedSectionOpen();
  }

  /** Collapse a section that already has content; leave empty ones expanded so
   * they invite filling. */
  private seedSectionOpen(): void {
    this.sectionOpen.set({
      archetypes: this.archetypes().length === 0,
      photo: false,
      experience: this.editor.experienceEntries().length === 0,
      skills: this.editor.form().skills.length === 0,
      languages: this.editor.languageEntries().length === 0,
      education: this.editor.educationEntries().length === 0,
    });
  }

  /** Trims to match the input `generateScoringProfile` hashes, or the two
   * hashes never compare equal. */
  private async refreshSavedMdHash(md: string): Promise<void> {
    const text = md.trim();
    if (!text) {
      this.savedMdHash.set(null);
      return;
    }
    try {
      this.savedMdHash.set(await this.system.hashText(text));
    } catch {
      this.savedMdHash.set(null);
    }
  }

  /**
   * The only writer of the profile row, so persisting `fullMd` and refreshing
   * `savedMdHash` cannot come apart.
   *
   * Pass `mdHash` only when it is known to be the hash of `input.fullMd`
   * trimmed; otherwise the hash is recomputed from what the row came back with.
   */
  async persist(
    input: Partial<
      Pick<
        Profile,
        'fullMd' | 'scoringJson' | 'scoringHash' | 'pitchMd' | 'pitchHash' | 'targetArchetypes'
      >
    >,
    mdHash?: string,
  ): Promise<Profile> {
    const saved = await this.db.upsertProfile(input);
    this.profile.set(saved);
    this.lastSavedAt.set(saved.updatedAt ?? null);
    if (mdHash) {
      this.savedMdHash.set(mdHash);
    } else {
      await this.refreshSavedMdHash(saved.fullMd);
    }
    return saved;
  }

  /** IPC, so it cannot live in a computed. Used by the artefact store to key
   * its cache on exactly the text it is about to send. */
  hashText(text: string): Promise<string> {
    return this.system.hashText(text);
  }

  /** Saves the form. Returns false on failure, with `error` filled. */
  async save(): Promise<boolean> {
    this.saving.set(true);
    this.error.set('');
    try {
      const p = this.profile();
      const saved = await this.persist({
        fullMd: this.editor.fullMd(),
        scoringJson: p?.scoringJson,
        scoringHash: p?.scoringHash,
        pitchMd: p?.pitchMd,
        pitchHash: p?.pitchHash,
        targetArchetypes: serializeArchetypes(this.archetypes()),
      });
      this.archetypes.set(parseArchetypes(saved.targetArchetypes));
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}

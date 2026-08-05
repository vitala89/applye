import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from '@applye/ui';
import { AiService, DbService } from '@applye/data';
import {
  Profile,
  Settings,
  ProfileForm,
  ProfileFieldKey,
  EMPTY_FORM,
  parseProfileMd,
  splitDisplayName,
  serializeProfileForm,
  EducationEntry,
  parseEducationEntries,
  serializeEducationEntries,
  ExperienceEntry,
  parseExperienceEntries,
  serializeExperienceEntries,
  LanguageEntry,
  parseLanguageEntries,
  serializeLanguageEntries,
  Archetype,
  parseArchetypes,
  serializeArchetypes,
  profileCompleteness,
  missingFields,
  parseScoringJson,
  scoringState as computeScoringState,
  pitchState as computePitchState,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import {
  LucideAngularModule,
  Info,
  Save,
  Check,
  RotateCcw,
  X,
  Plus,
  Sparkles,
  Mic,
  RefreshCw,
  ChevronDown,
  CircleDot,
  TriangleAlert,
} from 'lucide-angular';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ToastService } from '../../core/toast/toast.service';
import { ScoringSummaryComponent } from './scoring-summary.component';
import { CompletenessHeroComponent } from './completeness-hero.component';
import { CvPhotoCropComponent } from '../documents/cv-detail/cv-photo-crop/cv-photo-crop.component';
import { ProfileArchetypesComponent } from './profile-archetypes/profile-archetypes.component';
import { ProfileExperienceComponent } from './profile-experience/profile-experience.component';
import { ProfileEducationComponent } from './profile-education/profile-education.component';
import { ProfileLanguagesComponent } from './profile-languages/profile-languages.component';

/** Tolerant shape of the `profile-import` skill's JSON output. Every field is
 * optional/nullable since the AI omits or nulls anything it did not find in
 * the raw text - `applyParsedProfile` is responsible for turning that into
 * the non-nullable strings `ProfileForm` and the section entries expect. */
/** Every collapsible section on the profile page. */
type ProfileSectionKey =
  'archetypes' | 'photo' | 'experience' | 'skills' | 'languages' | 'education';

interface ParsedProfile {
  name?: string | null;
  title?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  experience?: {
    role?: string;
    company?: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    bullets?: string[];
  }[];
  skills?: string[];
  languages?: { language?: string; level?: string | null }[];
  education?: {
    title?: string;
    institution?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }[];
  lowConfidenceNotes?: string[];
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    FormsModule,
    ButtonDirective,
    ScoringSummaryComponent,
    CompletenessHeroComponent,
    LucideAngularModule,
    CvPhotoCropComponent,
    ProfileArchetypesComponent,
    ProfileExperienceComponent,
    ProfileEducationComponent,
    ProfileLanguagesComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  protected readonly onboarding = inject(OnboardingService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly infoIcon = Info;
  protected readonly saveIcon = Save;
  protected readonly checkIcon = Check;
  protected readonly rerunIcon = RotateCcw;
  protected readonly removeIcon = X;
  protected readonly plusIcon = Plus;
  protected readonly scoringIcon = Sparkles;
  protected readonly pitchIcon = Mic;
  protected readonly regenIcon = RefreshCw;
  protected readonly chevronIcon = ChevronDown;
  protected readonly unsavedIcon = CircleDot;
  protected readonly staleIcon = TriangleAlert;
  protected readonly sparklesIcon = Sparkles;

  readonly fullMd = signal('');
  readonly rawMode = signal(false);
  readonly form = signal<ProfileForm>({ ...EMPTY_FORM });
  /** Structured mirror of `form().education` for the multi-entry editor. Its
   * own signal (not a computed) so a freshly-added blank row survives until the
   * user fills it - `serializeEducationEntries` drops blank lines from the
   * string, but the row must stay editable. Re-seeded whenever the form is
   * reparsed (load, leaving raw mode). */
  readonly educationEntries = signal<EducationEntry[]>([]);
  /** Structured mirror of `form().experienceText`, same rationale as `educationEntries`. */
  readonly experienceEntries = signal<ExperienceEntry[]>([]);
  /** Structured mirror of `form().languages`, same rationale as `educationEntries`. */
  readonly languageEntries = signal<LanguageEntry[]>([]);
  readonly archetypes = signal<Archetype[]>([]);
  readonly profile = signal<Profile | null>(null);
  readonly settings = signal<Settings | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly scoring = signal(false);
  /** The reusable applicant photo, already cropped to the CV frame. Persisted
   * on its own (not with the profile form) so it survives every other save. */
  readonly photoDataUri = signal<string | null>(null);
  readonly photoSaving = signal(false);
  /** Source image awaiting a crop; non-null opens the crop modal. */
  readonly cropSourceUri = signal<string | null>(null);
  readonly pitching = signal(false);
  readonly parsing = signal(false);

  readonly saveStatus = signal('');
  readonly saveError = signal(false);
  readonly scoreStatus = signal('');
  readonly scoreError = signal(false);
  readonly pitchStatus = signal('');
  readonly pitchError = signal(false);
  readonly parsePreview = signal<ParsedProfile | null>(null);
  readonly parseStatus = signal('');
  readonly parseError = signal(false);
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
  readonly mdDirty = computed(() => this.fullMd() !== (this.profile()?.fullMd ?? ''));
  readonly dirty = computed(() => this.mdDirty() || this.archetypesDirty());

  /** Hash of the saved fullMd. hashText is an IPC call, so it cannot be derived inside a computed. */
  readonly savedMdHash = signal<string | null>(null);

  /** Archetype edits are excluded via mdDirty: they never enter fullMd, so they cannot stale it. */
  readonly scoringState = computed(() =>
    computeScoringState({
      hasScoringJson: !!this.profile()?.scoringJson,
      mdDirty: this.mdDirty(),
      savedMdHash: this.savedMdHash(),
      scoringHash: this.profile()?.scoringHash,
    }),
  );

  /** Same freshness rule as scoring, keyed on the pitch's own hash (not scoringHash). */
  readonly pitchState = computed(() =>
    computePitchState({
      hasPitch: !!this.profile()?.pitchMd,
      mdDirty: this.mdDirty(),
      savedMdHash: this.savedMdHash(),
      pitchHash: this.profile()?.pitchHash,
    }),
  );

  readonly completeness = computed(() => profileCompleteness(this.form()));
  readonly gaps = computed(() => missingFields(this.form()));
  readonly heroSubtitle = computed(() => {
    const s = parseScoringJson(this.profile()?.scoringJson ?? null);
    const f = this.form();
    return [s?.seniority, f.location || s?.location, ...(s?.domains ?? [])]
      .filter(Boolean)
      .join(' · ');
  });

  async ngOnInit(): Promise<void> {
    try {
      const [p, s] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(p);
      this.settings.set(s);
      this.fullMd.set(p?.fullMd ?? '');
      this.applyLoadedMarkdown(p?.fullMd ?? '');
      this.educationEntries.set(parseEducationEntries(this.form().education));
      this.experienceEntries.set(parseExperienceEntries(this.form().experienceText));
      this.languageEntries.set(parseLanguageEntries(this.form().languages));
      this.archetypes.set(parseArchetypes(p?.targetArchetypes));
      this.photoDataUri.set(p?.photoDataUri ?? null);
      await this.refreshSavedMdHash(p?.fullMd ?? '');
      if (p?.updatedAt) {
        this.saveStatus.set(this.t()('profile.last_saved').replace('{date}', p.updatedAt));
      }
    } catch (e) {
      this.saveStatus.set(this.t()('profile.load_failed').replace('{error}', String(e)));
      this.saveError.set(true);
      this.toast.error(this.t()('profile.load_failed').replace('{error}', String(e)));
    } finally {
      this.loading.set(false);
      this.seedSectionOpen();
    }
  }

  toggleScoring(): void {
    this.scoringOpen.update((v) => !v);
  }

  /** Native image picker -> backend read -> crop modal. Mirrors the CV editor's
   * flow so both places produce a photo in the identical frame. */
  async pickPhoto(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (typeof selected !== 'string') return;
    try {
      this.cropSourceUri.set(await this.db.cvPhotoReadFile(selected));
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  async onCropConfirmed(uri: string): Promise<void> {
    this.cropSourceUri.set(null);
    await this.savePhoto(uri);
  }

  onCropCancelled(): void {
    this.cropSourceUri.set(null);
  }

  async removePhoto(): Promise<void> {
    await this.savePhoto(null);
  }

  /** Persists immediately rather than waiting for the page's Save button: the
   * photo is not part of the profile form, and a cropped photo left unsaved
   * would be silently lost on navigation. */
  private async savePhoto(uri: string | null): Promise<void> {
    if (this.photoSaving()) return;
    this.photoSaving.set(true);
    const previous = this.photoDataUri();
    this.photoDataUri.set(uri);
    try {
      await this.db.setProfilePhoto(uri);
      this.toast.success(this.t()(uri ? 'profile.photo_saved' : 'profile.photo_removed'));
    } catch (e) {
      this.photoDataUri.set(previous);
      this.toast.error(String(e));
    } finally {
      this.photoSaving.set(false);
    }
  }

  toggleSection(key: ProfileSectionKey): void {
    this.sectionOpen.update((s) => ({ ...s, [key]: !s[key] }));
  }

  /** Collapse a section on load/seed when it already has content; leave empty
   * sections expanded so they invite filling. */
  private seedSectionOpen(): void {
    this.sectionOpen.set({
      archetypes: this.archetypes().length === 0,
      photo: false,
      experience: this.experienceEntries().length === 0,
      skills: this.form().skills.length === 0,
      languages: this.languageEntries().length === 0,
      education: this.educationEntries().length === 0,
    });
  }

  /** Trims to match the input generateScoringProfile hashes, or the two hashes never compare equal. */
  private async refreshSavedMdHash(md: string): Promise<void> {
    const text = md.trim();
    if (!text) {
      this.savedMdHash.set(null);
      return;
    }
    try {
      this.savedMdHash.set(await this.db.hashText(text));
    } catch {
      this.savedMdHash.set(null);
    }
  }

  /**
   * The only writer of the profile row, so that persisting fullMd and refreshing savedMdHash
   * cannot come apart. A hash that lags the row it describes is precisely what makes the scoring
   * chip report a stale artefact as cached, and every writer that maintained the hash by hand
   * eventually forgot to.
   *
   * Pass mdHash only when it is known to be the hash of input.fullMd trimmed; otherwise the hash
   * is recomputed from what the row actually came back with.
   */
  private async persistProfile(
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
    if (mdHash) {
      this.savedMdHash.set(mdHash);
    } else {
      await this.refreshSavedMdHash(saved.fullMd);
    }
    return saved;
  }

  private syncMdFromForm(): void {
    this.fullMd.set(serializeProfileForm(this.form()));
  }

  /** Reads markdown into the form, backfilling the name split for profiles that
   * predate the first/last fields. The derive happens here rather than inside
   * `parseProfileMd` so the parser stays a faithful reader and its round-trip
   * identity test keeps its meaning. Nothing is written back on read alone: the
   * backfilled values reach disk on the user's next save. */
  applyLoadedMarkdown(md: string): void {
    const form = parseProfileMd(md);
    if (!form.firstName.trim() && !form.lastName.trim() && form.name.trim()) {
      const split = splitDisplayName(form.name);
      form.firstName = split.firstName;
      form.lastName = split.lastName;
    }
    this.form.set(form);
  }

  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.form.update((f) => {
      const next = { ...f, [key]: value };
      // The display name follows the parts until the user touches it. On a part
      // edit it is recomposed only while it still reads exactly as the previous
      // parts composed - a name typed by hand (in the display name field or in
      // raw markdown) is deliberate and must survive later part edits. Only when
      // the parts produce something: clearing both must not wipe the name. An
      // emptied display name counts as untouched too, so a display name cleared
      // by the user (rather than hand-set to something else) still re-adopts the
      // parts on the next part edit instead of freezing on a blank name.
      if (key === 'firstName' || key === 'lastName') {
        const previous = [f.firstName.trim(), f.lastName.trim()].filter(Boolean).join(' ');
        const composed = [next.firstName.trim(), next.lastName.trim()].filter(Boolean).join(' ');
        if (composed && (f.name.trim() === previous || f.name.trim() === '')) {
          next.name = composed;
        }
      }
      return next;
    });
    this.syncMdFromForm();
  }

  addSkillChip(event: Event): void {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    if (this.form().skills.includes(value)) return;
    this.updateField('skills', [...this.form().skills, value]);
  }

  removeSkillChip(index: number): void {
    this.updateField(
      'skills',
      this.form().skills.filter((_, i) => i !== index),
    );
  }

  /** What the languages section emits after any edit. The section transforms
   * the list; folding it back into `languages` stays here, with the form. */
  onLanguagesChanged(entries: LanguageEntry[]): void {
    this.languageEntries.set(entries);
    this.syncLanguages();
  }

  private syncLanguages(): void {
    this.updateField('languages', serializeLanguageEntries(this.languageEntries()));
  }

  toggleRawMode(): void {
    if (this.rawMode()) {
      // leaving raw → re-parse edited markdown back into fields
      this.applyLoadedMarkdown(this.fullMd());
      this.educationEntries.set(parseEducationEntries(this.form().education));
      this.experienceEntries.set(parseExperienceEntries(this.form().experienceText));
      this.languageEntries.set(parseLanguageEntries(this.form().languages));
      this.seedSectionOpen();
    } else {
      this.syncMdFromForm();
    }
    this.rawMode.update((v) => !v);
  }

  focusField(key: ProfileFieldKey): void {
    const el = document.getElementById('field-' + key);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement | null)?.focus?.();
  }

  /** What the education section emits after any edit. The section transforms
   * the list; folding it back into `education` stays here, with the form. */
  onEducationChanged(entries: EducationEntry[]): void {
    this.educationEntries.set(entries);
    this.syncEducation();
  }

  /** Folds the structured entries back into the `education` string (and thus
   * `fullMd`). Blank entries serialize to nothing, so the string stays clean. */
  private syncEducation(): void {
    this.updateField('education', serializeEducationEntries(this.educationEntries()));
  }

  /** What the experience section emits after any edit. The section transforms
   * the list; folding it back into `experienceText` stays here, because that is
   * where `updateField` and the rest of the form live. */
  onExperienceChanged(entries: ExperienceEntry[]): void {
    this.experienceEntries.set(entries);
    this.syncExperience();
  }

  /** Folds the structured entries back into the `experienceText` string (and thus
   * `fullMd`). Blank entries serialize to nothing, so the string stays clean. */
  private syncExperience(): void {
    this.updateField('experienceText', serializeExperienceEntries(this.experienceEntries()));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saveStatus.set('');
    this.saveError.set(false);
    try {
      const p = this.profile();
      const saved = await this.persistProfile({
        fullMd: this.fullMd(),
        scoringJson: p?.scoringJson,
        scoringHash: p?.scoringHash,
        pitchMd: p?.pitchMd,
        pitchHash: p?.pitchHash,
        targetArchetypes: serializeArchetypes(this.archetypes()),
      });
      this.archetypes.set(parseArchetypes(saved.targetArchetypes));
      this.saveStatus.set(this.t()('profile.saved_at').replace('{date}', saved.updatedAt ?? 'now'));
      this.toast.success(this.t()('profile.saved_ok'));
    } catch (e) {
      this.saveStatus.set(this.t()('profile.save_failed').replace('{error}', String(e)));
      this.saveError.set(true);
      this.toast.error(this.t()('profile.save_failed').replace('{error}', String(e)));
    } finally {
      this.saving.set(false);
    }
  }

  async generateScoringProfile(): Promise<void> {
    // Captured before any await: this is the text the artefact is generated from, so it is also
    // the text the row and scoringHash must describe. Reading fullMd() again after the AI call
    // would persist markdown nothing analysed.
    const mdAtStart = this.fullMd();
    const md = mdAtStart.trim();
    if (!md) {
      this.scoreStatus.set(this.t()('profile.empty_hint'));
      return;
    }
    const p = this.profile();
    const s = this.settings();
    if (!s) return;

    const hash = await this.db.hashText(md);
    if (hash === p?.scoringHash && p?.scoringJson) {
      this.scoreStatus.set(this.t()('profile.scoring_cached'));
      return;
    }

    this.scoring.set(true);
    this.scoreStatus.set('');
    this.scoreError.set(false);
    try {
      const rendered = await this.ai.renderSkill('profile-compress', { profile_md: md });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: 'en',
      });
      await this.persistProfile(
        {
          fullMd: mdAtStart,
          scoringJson: res.text,
          scoringHash: hash,
          pitchMd: p?.pitchMd,
          pitchHash: p?.pitchHash,
          targetArchetypes: p?.targetArchetypes,
        },
        hash,
      );
      this.scoreStatus.set(
        this.t()('profile.generated_tokens')
          .replace('{in}', String(res.tokensInput))
          .replace('{out}', String(res.tokensOutput)),
      );
    } catch (e) {
      this.scoreStatus.set(this.t()('profile.generate_failed').replace('{error}', String(e)));
      this.scoreError.set(true);
      this.toast.error(this.t()('profile.generate_failed').replace('{error}', String(e)));
    } finally {
      this.scoring.set(false);
    }
  }

  async generatePitch(): Promise<void> {
    // See generateScoringProfile: the row must describe the text that was actually pitched.
    const mdAtStart = this.fullMd();
    const md = mdAtStart.trim();
    if (!md) {
      this.pitchStatus.set(this.t()('profile.empty_hint'));
      return;
    }
    const p = this.profile();
    const s = this.settings();
    if (!s) return;

    const hash = await this.db.hashText(md);
    if (hash === p?.pitchHash && p?.pitchMd) {
      this.pitchStatus.set(this.t()('profile.pitch_cached'));
      return;
    }

    this.pitching.set(true);
    this.pitchStatus.set('');
    this.pitchError.set(false);
    try {
      const lang = s.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('pitch', {
        profile_md: md,
        duration: '60s',
        language: lang,
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });
      await this.persistProfile(
        {
          fullMd: mdAtStart,
          scoringJson: p?.scoringJson,
          scoringHash: p?.scoringHash,
          pitchMd: res.text,
          pitchHash: hash,
          targetArchetypes: p?.targetArchetypes,
        },
        hash,
      );
      this.pitchStatus.set(
        this.t()('profile.generated_tokens')
          .replace('{in}', String(res.tokensInput))
          .replace('{out}', String(res.tokensOutput)),
      );
    } catch (e) {
      this.pitchStatus.set(this.t()('profile.generate_failed').replace('{error}', String(e)));
      this.pitchError.set(true);
      this.toast.error(this.t()('profile.generate_failed').replace('{error}', String(e)));
    } finally {
      this.pitching.set(false);
    }
  }

  /** Runs the `profile-import` skill against the raw markdown and stashes the
   * tolerant result in `parsePreview` for the user to review - never applies
   * automatically. */
  async parseRawText(): Promise<void> {
    const text = this.fullMd().trim();
    if (!text) {
      this.parseStatus.set(this.t()('profile.parse_empty_hint'));
      return;
    }
    const s = this.settings();
    if (!s) return;
    this.parsing.set(true);
    this.parseStatus.set('');
    this.parseError.set(false);
    try {
      const lang = s.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('profile-import', {
        profile_text: text,
        language: lang,
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: lang,
      });
      const parsed = this.extractParsed(res.text);
      if (!parsed) {
        this.parseStatus.set(this.t()('profile.parse_failed'));
        this.parseError.set(true);
        return;
      }
      this.parsePreview.set(parsed);
    } catch (e) {
      this.parseStatus.set(this.t()('profile.generate_failed').replace('{error}', String(e)));
      this.parseError.set(true);
      this.toast.error(this.t()('profile.parse_failed'));
    } finally {
      this.parsing.set(false);
    }
  }

  /** Same tolerant fence-stripping as `parseScoringJson`: strips ```json fences,
   * parses, and returns null on anything that is not a JSON object - never
   * throws, so a bad AI response just fails the parse instead of clearing the form. */
  private extractParsed(raw: string): ParsedProfile | null {
    const cleaned = raw
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    try {
      const obj = JSON.parse(cleaned);
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as ParsedProfile) : null;
    } catch {
      return null;
    }
  }

  /** Folds the previewed parse into `ProfileForm` + the section signals, then
   * resyncs `fullMd` and switches to the Form tab. Nulls from the AI (e.g.
   * `endDate: null` for an ongoing role) become '' via `str`, matching what
   * every section entry type already expects. */
  applyParsedProfile(): void {
    const p = this.parsePreview();
    if (!p) return;
    const str = (v: string | null | undefined) => (v ?? '').trim();

    this.form.update((f) => ({
      ...f,
      name: str(p.name) || f.name,
      title: str(p.title) || f.title,
      location: str(p.location) || f.location,
      email: str(p.email) || f.email,
      phone: str(p.phone) || f.phone,
      website: str(p.website) || f.website,
      linkedin: str(p.linkedin) || f.linkedin,
    }));

    /* Scalars keep the existing value when the parse is blank; the structured
     * sections (experience/skills/languages/education) are replaced wholesale -
     * this is an explicit "apply what the preview shows" action, and the user
     * reviewed the preview before clicking Apply. */
    this.experienceEntries.set(
      (p.experience ?? []).map((e) => ({
        role: str(e.role),
        company: str(e.company),
        location: str(e.location),
        startDate: str(e.startDate),
        endDate: str(e.endDate),
        bullets: (e.bullets ?? []).map((b) => b.trim()).filter(Boolean),
      })),
    );
    this.languageEntries.set(
      (p.languages ?? [])
        .map((l) => ({ language: str(l.language), level: str(l.level) }))
        .filter((l) => l.language),
    );
    this.educationEntries.set(
      (p.education ?? []).map((e) => ({
        title: str(e.title),
        institution: str(e.institution),
        startDate: str(e.startDate),
        endDate: str(e.endDate),
      })),
    );

    // Fold section signals + scalar fields back into fullMd via updateField.
    this.updateField('skills', (p.skills ?? []).map((sk) => sk.trim()).filter(Boolean));
    this.syncExperience();
    this.syncLanguages();
    this.syncEducation();
    this.syncMdFromForm();

    this.parsePreview.set(null);
    this.seedSectionOpen();
    this.rawMode.set(false); // switch to Form tab
  }

  discardParse(): void {
    this.parsePreview.set(null);
    this.parseStatus.set('');
  }
}

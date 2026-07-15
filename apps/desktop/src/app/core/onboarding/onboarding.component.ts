import { Component, HostBinding, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCheck,
  CircleAlert,
  CirclePlay,
  Clock,
  ClipboardType,
  ExternalLink,
  FileText,
  HardDrive,
  Info,
  Key,
  Lock,
  LucideAngularModule,
  Plus,
  ScanLine,
  Sparkles,
  Target,
  TriangleAlert,
  Upload,
  Wallet,
} from 'lucide-angular';
import {
  AiProvider,
  CvParsedContent,
  Profile,
  archetypeNames,
  serializeArchetypes,
  parseArchetypes,
} from '@applye/core';
import { AiService, DbService, KeysService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { openUrl } from '@tauri-apps/plugin-opener';
import { parseCvSkillResponse } from '../../pages/documents/cv-content.util';
import {
  appendCompensation,
  applyContactOverrides,
  buildOnboardingCvInput,
  CURRENCY_OPTIONS,
  cvToProfileMarkdown,
  formatCompRange,
  hasCvForInputHash,
  normalizeCurrency,
  parseArchetypesSkillResponse,
  parseCompRange,
  regionTagForUiLanguage,
  type OnboardingCvOverrides,
  type ParsedCv,
} from './onboarding-content.util';
import { guideForProvider } from './provider-guides';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast/toast.service';

type ResumePath = 'upload' | 'paste' | 'skip';
/** Feedback for the key INPUT only — never a claim about the keyring. Whether a
 * key exists is `keyStored`, which a failed paste must not disturb. Neither
 * means the provider accepted the key: nothing here calls the API. */
type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid';

/** Full-screen onboarding wizard overlay. Auto-opened once after the
 * health-check (see app.ts + onboarding-gate.util.ts). Focused-shell layout:
 * a single centered column with a horizontal step stepper up top, the
 * current step body, and a footer nav — no left rail. */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ButtonDirective, FormsModule, LucideAngularModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly keys = inject(KeysService);
  private readonly i18n = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  // Bound on the host element (not the inner template) so the whole overlay
  // — including anything future markup adds outside `.ob` — always carries
  // the SAME live theme as the rest of the app, instead of silently
  // inheriting a stale `<html data-theme>` if it ever drifts.
  @HostBinding('attr.data-theme') get hostTheme() {
    return this.themeService.theme();
  }

  protected readonly icons = {
    arrowLeft: ArrowLeft,
    arrowRight: ArrowRight,
    badgeCheck: BadgeCheck,
    check: Check,
    checkCheck: CheckCheck,
    circleAlert: CircleAlert,
    clock: Clock,
    clipboardType: ClipboardType,
    externalLink: ExternalLink,
    fileText: FileText,
    hardDrive: HardDrive,
    info: Info,
    key: Key,
    lock: Lock,
    plus: Plus,
    playCircle: CirclePlay,
    scanLine: ScanLine,
    sparkles: Sparkles,
    target: Target,
    triangleAlert: TriangleAlert,
    upload: Upload,
    wallet: Wallet,
  };

  readonly completed = output<void>();
  readonly step = signal(0);
  readonly totalSteps = 6; // 0 welcome, 1 ai-setup, 2 resume, 3 review, 4 targeting, 5 ready
  private readonly stepNameKeys = [
    'onboarding.step_names.welcome',
    'onboarding.step_names.ai',
    'onboarding.step_names.resume',
    'onboarding.step_names.review',
    'onboarding.step_names.targeting',
    'onboarding.step_names.ready',
  ];

  /** The Review step only exists to check a parsed resume. Without one it is an
   * empty form, so it is skipped forward AND unreachable backwards. */
  readonly hasReview = computed(() => this.parsedCv() !== null);

  readonly railSteps = computed(() => {
    const current = this.step();
    const hasReview = this.hasReview();
    return this.stepNameKeys.map((key, index) => ({
      index,
      n: String(index + 1).padStart(2, '0'),
      label: this.t()(key),
      active: index === current,
      done: index < current,
      clickable: index <= current && (index !== 3 || hasReview),
    }));
  });

  readonly privacyItems = computed(() => [
    this.t()('onboarding.privacy_1'),
    this.t()('onboarding.privacy_2'),
    this.t()('onboarding.privacy_3'),
  ]);

  // ---- AI setup ----
  readonly selectedProvider = signal<AiProvider>('claude');
  readonly guide = computed(() => guideForProvider(this.selectedProvider()));
  readonly keyInput = signal('');
  readonly keyStatus = signal<KeyStatus>('idle');
  /** Whether the selected provider has a key in the OS keyring — from the
   * keyring itself, so it survives a re-run and an input the user fumbles. */
  readonly keyStored = signal(false);
  readonly keySaveError = signal(false);
  readonly v1Providers: AiProvider[] = ['claude', 'openai', 'deepseek'];

  readonly providerSteps = computed(() =>
    this.guide().stepKeys.map((key, i) => ({ n: i + 1, text: this.t()(key) })),
  );

  guideFor(p: AiProvider) {
    return guideForProvider(p);
  }

  constructor() {
    void this.refreshKeyStored();
    void this.seedFromExistingProfile();
  }

  /** On a re-run the wizard opens blank, so the roles the user already has must
   * be loaded in — otherwise Ready reports "0 roles selected" and Finish writes
   * an empty list over them. Only seeds; the user stays free to unpick. */
  private async seedFromExistingProfile(): Promise<void> {
    const existing = await this.readExistingProfile();
    // The profile stores full `Archetype` objects; this wizard only ever deals
    // in names and re-wraps them on save, so seed the names.
    const roles = archetypeNames(parseArchetypes(existing?.targetArchetypes));
    if (!roles.length || this.archetypes().length) return;
    this.archetypes.set(roles);
    this.suggestedRoles.set(roles);
    // Marks the selection as authored, so the resume-driven suggestion that
    // follows adds to these roles rather than replacing them.
    this.selectionSeeded.set(true);
  }

  selectProvider(id: AiProvider): void {
    this.selectedProvider.set(id);
    this.keyStatus.set('idle');
    this.keyStored.set(false);
    this.keySaveError.set(false);
    void this.refreshKeyStored();
  }

  /** A key saved by an earlier run lives in the keyring, not in this component,
   * so without this a re-run shows "not connected" on the Ready step for a
   * provider that is in fact connected. */
  private async refreshKeyStored(): Promise<void> {
    const provider = this.selectedProvider();
    try {
      const has = await this.keys.hasProviderKey(provider);
      // A provider switch mid-await must not land its answer on the new one.
      if (this.selectedProvider() !== provider) return;
      this.keyStored.set(has);
    } catch {
      // Keyring unreadable — leave it as "no key" and let the user paste one.
    }
  }

  async openConsole(): Promise<void> {
    await openUrl(this.guide().consoleUrl);
  }

  async openVideo(): Promise<void> {
    const url = this.guide().helpVideoUrl;
    if (url) await openUrl(url);
  }

  /** Lightweight format sanity-check (length + provider prefix hint) before
   * touching the keyring — this is NOT a live validation against the
   * provider's API (no such check exists), just a copy-paste sanity guard.
   * The button and status copy say "save", never "valid", for that reason. */
  async saveKey(): Promise<void> {
    const key = this.keyInput().trim();
    if (!key) return;
    const prefix = this.guide().keyPrefix;
    const looksValid = key.length >= 15 && (!prefix || key.toLowerCase().startsWith('sk'));
    if (!looksValid) {
      this.keyStatus.set('invalid');
      return;
    }
    this.keyStatus.set('checking');
    this.keySaveError.set(false);
    try {
      await this.keys.setProviderKey(this.selectedProvider(), key);
      const saved = await this.keys.hasProviderKey(this.selectedProvider());
      this.keyStatus.set(saved ? 'valid' : 'invalid');
      this.keyStored.set(saved);
    } catch {
      // A write that fails leaves whatever was already in the keyring intact,
      // so `keyStored` is deliberately untouched here — reporting "no key" for
      // a provider that still has a working one is the worse lie.
      this.keyStatus.set('idle');
      this.keySaveError.set(true);
    }
  }

  // ---- Resume ----
  readonly resumePath = signal<ResumePath>('upload');
  readonly resumeFileName = signal<string | null>(null);
  readonly resumeText = signal('');
  /** Set only by the upload path — the paste path has no file to hash. Carried
   * so the CV document written on finish can reuse the Documents import's
   * duplicate guard. */
  readonly resumeInputHash = signal<string | undefined>(undefined);
  readonly parsing = signal(false);
  readonly resumeError = signal(false);
  readonly parsedCv = signal<CvParsedContent | null>(null);

  readonly experience = computed(() => this.parsedCv()?.experience ?? []);
  readonly skills = computed(() => this.parsedCv()?.skills ?? []);
  readonly lowConfidenceCount = computed(() => this.parsedCv()?.lowConfidenceNotes?.length ?? 0);

  // ---- Review (editable overrides seeded once from the parsed CV) ----
  readonly reviewName = signal('');
  readonly reviewEmail = signal('');
  readonly reviewPhone = signal('');
  readonly reviewAddress = signal('');

  chooseResume(path: ResumePath): void {
    this.resumePath.set(path);
    this.resumeError.set(false);
    // Choosing "skip" after a parse must actually drop the parse. Otherwise the
    // profile still gets written from the resume the user just walked away from
    // while the Ready step tells them it was skipped.
    if (path === 'skip') this.discardParse();
    if (path === 'upload' && !this.resumeFileName()) {
      void this.pickResumeFile();
    }
  }

  /** Pasted text has no source file, so it drops any hash a previous upload
   * left behind rather than tagging the CV document with a hash of content
   * that is no longer there. */
  setPastedResume(text: string): void {
    this.resumeText.set(text);
    this.resumeInputHash.set(undefined);
    this.discardParse();
  }

  /** Any change to the resume source invalidates what was parsed from the old
   * one — a stale parse would otherwise reach the profile and the CV document,
   * and keep the Review step reachable for text that is no longer there. */
  private discardParse(): void {
    this.parsedCv.set(null);
  }

  async pickResumeFile(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Resume', extensions: ['pdf', 'docx'] }],
    });
    if (typeof path !== 'string') return;
    const file = await this.db.cvImportReadFile(path);
    this.resumeText.set(file.text);
    this.resumeInputHash.set(file.inputHash);
    this.resumeFileName.set(path.split(/[/\\]/).pop() ?? path);
    this.discardParse();
  }

  async parseResume(): Promise<void> {
    const text = this.resumeText().trim();
    if (!text) return;
    this.parsing.set(true);
    this.resumeError.set(false);
    try {
      const settings = await this.db.getSettings();
      // Match the Documents cv-import pipeline: the skill's `language` drives
      // label text and follows the UI language, not the document output language.
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-import', { cv_text: text, language });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      const cv = parseCvSkillResponse(res.text);
      this.parsedCv.set(cv);
      // Seed each review field only if still empty — a Back + re-parse must
      // never silently clobber the user's manual edits.
      if (!this.reviewName().trim()) this.reviewName.set(cv.personalDetails.fullName ?? '');
      if (!this.reviewEmail().trim()) this.reviewEmail.set(cv.personalDetails.email ?? '');
      if (!this.reviewPhone().trim()) this.reviewPhone.set(cv.personalDetails.phone ?? '');
      if (!this.reviewAddress().trim()) this.reviewAddress.set(cv.personalDetails.address ?? '');
      this.next();
    } catch {
      this.resumeError.set(true);
    } finally {
      this.parsing.set(false);
    }
  }

  // ---- Targeting (archetypes + compensation) ----
  readonly suggestedRoles = signal<string[]>([]);
  readonly archetypes = signal<string[]>([]);
  readonly suggesting = signal(false);
  /** True once the selection has a deliberate author — the first AI suggestion,
   * or the roles seeded from an existing profile on a re-run. Distinguishes an
   * unauthored blank from "the user unchecked everything", and stops a
   * suggestion from replacing roles the user already had. */
  readonly selectionSeeded = signal(false);
  /** Roles the user unchecked by hand — a re-suggest must not bring them back. */
  readonly rejectedRoles = signal<ReadonlySet<string>>(new Set());
  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly compCurrency = signal<string>('USD');
  readonly compMin = signal(80);
  readonly compMax = signal(120);
  /** Set once the user edits the range by hand, so a re-suggest leaves it alone. */
  readonly compTouched = signal(false);

  readonly displayRoles = computed(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of [...this.suggestedRoles(), ...this.archetypes()]) {
      if (!seen.has(r)) {
        seen.add(r);
        out.push(r);
      }
    }
    return out;
  });

  private readonly compBand = { lo: 50, hi: 300 };
  readonly compLeft = computed(() => {
    const pct = ((this.compMin() - this.compBand.lo) / (this.compBand.hi - this.compBand.lo)) * 100;
    return `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  });
  readonly compRight = computed(() => {
    const pct = ((this.compBand.hi - this.compMax()) / (this.compBand.hi - this.compBand.lo)) * 100;
    return `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  });

  isRoleOn(role: string): boolean {
    return this.archetypes().includes(role);
  }

  toggleRole(role: string): void {
    const removing = this.archetypes().includes(role);
    this.archetypes.update((a) => (removing ? a.filter((r) => r !== role) : [...a, role]));
    this.rejectedRoles.update((rejected) => {
      const next = new Set(rejected);
      if (removing) next.add(role);
      else next.delete(role);
      return next;
    });
  }

  addArchetype(v: string): void {
    const t = v.trim();
    if (t) this.toggleRole(t);
  }

  setCompMin(v: string): void {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    this.compMin.set(isNaN(n) ? 0 : n);
    this.compTouched.set(true);
  }

  setCompMax(v: string): void {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    this.compMax.set(isNaN(n) ? 0 : n);
    this.compTouched.set(true);
  }

  setCompCurrency(v: string): void {
    this.compCurrency.set(v);
    this.compTouched.set(true);
  }

  /** True while a footer-driven AI call is in flight. The Continue button binds
   * to it: without the guard a second click starts a second (paid) call and
   * advances twice, skipping a step entirely. */
  readonly busy = computed(() => this.parsing() || this.suggesting());

  /** Footer "Continue" handler: branches per step so parsing/suggestion runs
   * before advancing, and a skipped/empty resume never blocks progress. */
  async goNext(): Promise<void> {
    if (this.busy()) return;
    const s = this.step();
    if (s === 2) {
      // With no resume there is nothing to review, so Review would be a dead
      // screen of empty fields — jump straight to Targeting, which the user can
      // still fill in by hand.
      if (this.resumePath() === 'skip' || !this.resumeText().trim()) {
        this.step.set(4);
        return;
      }
      await this.parseResume();
      return;
    }
    if (s === 3) {
      await this.suggestArchetypes();
      this.next();
      return;
    }
    this.next();
  }

  /** Suggestion only — it never advances the wizard, because the Targeting step
   * offers this same action as a "Suggest again" button and advancing there
   * would throw the user off the step they are working on. */
  async suggestArchetypes(): Promise<void> {
    const text = this.resumeText().trim();
    if (!text) return;
    this.suggesting.set(true);
    try {
      const settings = await this.db.getSettings();
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('onboarding-archetypes', {
        cv_text: text,
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      const parsed = parseArchetypesSkillResponse(res.text);
      this.suggestedRoles.set(parsed.archetypes);
      // The first suggestion seeds the selection; every later one only offers
      // its roles as chips. Union-ing on a re-suggest would re-check roles the
      // user had just unchecked, and an empty selection is a real choice — not
      // the same state as "never suggested", which is why this needs its own
      // flag rather than an `archetypes().length` test.
      if (this.selectionSeeded()) {
        this.archetypes.update((current) => [
          ...current,
          ...parsed.archetypes.filter((r) => !current.includes(r) && !this.rejectedRoles().has(r)),
        ]);
      } else {
        this.archetypes.set(parsed.archetypes);
      }
      this.selectionSeeded.set(true);
      // Comp is a single range with no user-authored parts to preserve, and it
      // is only ever seeded before the user reaches the step — but once they
      // have edited it, a re-suggest must not overwrite their number.
      if (!this.compTouched()) {
        const range = parseCompRange(parsed.compRange);
        this.compCurrency.set(normalizeCurrency(range.currency));
        this.compMin.set(range.min);
        this.compMax.set(range.max);
      }
    } catch {
      // Suggestion is an enhancement, not a requirement — fail soft and let
      // the user confirm/add roles manually on the targeting step.
    } finally {
      this.suggesting.set(false);
    }
  }

  // ---- Ready summary ----
  /** True for a key this run saved AND one an earlier run left in the keyring. */
  readonly keyPresent = computed(() => this.keyStored());
  readonly providerSummary = computed(() => {
    if (!this.keyPresent()) return this.t()('onboarding.done.not_connected');
    return `${this.t()(this.guide().nameKey)} · ${this.t()('onboarding.done.connected_suffix')}`;
  });
  readonly resumeSummary = computed(() => {
    if (this.resumePath() === 'skip') return this.t()('onboarding.done.skipped');
    const name = this.reviewName().trim();
    return `${this.t()('onboarding.done.imported_prefix')}${name ? ' · ' + name : ''}`;
  });
  readonly rolesSummary = computed(
    () => `${this.archetypes().length} ${this.t()('onboarding.done.roles_selected_suffix')}`,
  );
  readonly compSummary = computed(() =>
    formatCompRange({ currency: this.compCurrency(), min: this.compMin(), max: this.compMax() }),
  );

  // ---- Navigation / persistence ----
  next(): void {
    this.step.update((s) => Math.min(s + 1, this.totalSteps - 1));
  }

  back(): void {
    // Step 4 → 2 when Review was skipped, mirroring the forward jump.
    this.step.update((s) => (s === 4 && !this.hasReview() ? 2 : Math.max(s - 1, 0)));
  }

  goTo(i: number): void {
    if (i === 3 && !this.hasReview()) return;
    if (i <= this.step()) this.step.set(i);
  }

  private reviewOverrides(): OnboardingCvOverrides {
    return {
      fullName: this.reviewName(),
      email: this.reviewEmail(),
      phone: this.reviewPhone(),
      address: this.reviewAddress(),
    };
  }

  private buildProfileCv(): ParsedCv {
    const cv = this.parsedCv();
    return {
      personalDetails: applyContactOverrides(this.reviewOverrides()),
      summary: cv?.summary ?? null,
      experience: cv?.experience ?? [],
      skills: cv?.skills ?? [],
    };
  }

  /** `db_upsert_profile` replaces the whole row — a field left out is written as
   * NULL, not preserved. The wizard only authors `fullMd` and the archetypes,
   * so on a re-run it must carry the rest forward or it silently destroys the
   * scoring and pitch the user paid an AI call for. The stale scoring that
   * survives a resume change is harmless: `scoringHash` no longer matches the
   * new `fullMd`, which is exactly how Profile knows to offer a re-score. */
  async saveProfile(): Promise<void> {
    const existing = await this.readExistingProfile();
    const base = cvToProfileMarkdown(this.buildProfileCv()).trim();
    // No resume this run — a re-run that only re-targets keeps the markdown the
    // user already has instead of blanking it.
    const fullMd = base
      ? appendCompensation(
          base,
          formatCompRange({
            currency: this.compCurrency(),
            min: this.compMin(),
            max: this.compMax(),
          }),
        )
      : (existing?.fullMd ?? '');
    // Nothing parsed, nothing saved before, no roles picked: a first run the
    // user skipped through. Writing an empty row would only make the dashboard
    // banner disagree with itself.
    if (!fullMd.trim() && !this.archetypes().length) return;
    await this.db.upsertProfile({
      fullMd,
      scoringJson: existing?.scoringJson,
      scoringHash: existing?.scoringHash,
      pitchMd: existing?.pitchMd,
      targetArchetypes: serializeArchetypes(parseArchetypes(JSON.stringify(this.archetypes()))),
    });
  }

  private async readExistingProfile(): Promise<Profile | null> {
    try {
      return await this.db.getProfile();
    } catch {
      // Unreadable profile — better to write the new one than to lose the run.
      return null;
    }
  }

  /** The wizard already parsed the resume into exactly the shape Documents
   * stores, so it writes the CV document itself instead of leaving the user to
   * import the same file a second time. Fail-open: a CV that cannot be written
   * must never trap the user in onboarding or lose the profile — the Documents
   * import stays available either way. */
  async saveCvDocument(): Promise<void> {
    const parsed = this.parsedCv();
    if (!parsed || this.resumePath() === 'skip') return;
    try {
      const settings = await this.db.getSettings();
      const inputHash = this.resumeInputHash();
      // Re-running the wizard on the same file must not stack up copies. The
      // existing document wins: it may already carry edits made in Documents,
      // and silently overwriting those would cost more than a skipped rewrite.
      if (hasCvForInputHash(await this.db.documentLibraryList('cv'), inputHash)) return;
      await this.db.documentLibraryUpsert(
        buildOnboardingCvInput({
          parsed,
          overrides: this.reviewOverrides(),
          templates: await this.db.cvTemplatesList(),
          regionTag: regionTagForUiLanguage(settings.uiLanguage),
          language: settings.defaultDocLanguage ?? 'en',
          fallbackLabel: this.t()('documents.cv_untitled'),
          inputHash,
        }),
      );
    } catch (e) {
      // Fail open — the CV is a bonus on top of the profile, never a blocker.
      // Still say so: the alternative is a user who finds no CV in Documents
      // and has nothing to report.
      console.error('onboarding: could not write the CV document', e);
      this.toast.error(this.t()('onboarding.cv_save_failed'));
    }
  }

  async skip(): Promise<void> {
    await this.markSeen();
    this.completed.emit();
  }

  async finish(): Promise<void> {
    await this.saveProfile();
    await this.saveCvDocument();
    await this.markSeen();
    this.completed.emit();
  }

  async finishTo(path: string): Promise<void> {
    await this.saveProfile();
    await this.saveCvDocument();
    await this.markSeen();
    await this.router.navigateByUrl(path);
    this.completed.emit();
  }

  private async markSeen(): Promise<void> {
    try {
      await this.db.updateSettings({ onboardingSeen: true });
    } catch {
      // fail open — never trap the user in onboarding
    }
  }
}

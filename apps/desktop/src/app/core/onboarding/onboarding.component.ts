import { Component, HostBinding, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  Download,
  ExternalLink,
  FileText,
  HardDrive,
  Info,
  Key,
  Lock,
  LucideAngularModule,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert,
  Upload,
  Wallet,
} from 'lucide-angular';
import {
  AiMode,
  AiProvider,
  Profile,
  archetypeNames,
  serializeArchetypes,
  parseArchetypes,
  serializeCompensation,
} from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import {
  appendCompensation,
  applyContactOverrides,
  buildOnboardingCvInput,
  cvToProfileMarkdown,
  formatCompRange,
  hasCvForInputHash,
  regionTagForUiLanguage,
  type ParsedCv,
} from './onboarding-content.util';
import { guideForProvider } from './provider-guides';
import { OnboardingAiKeyService } from './onboarding-ai-key.service';
import { OnboardingCliBridgeService } from './onboarding-cli-bridge.service';
import { CLI_PROVIDERS, cardNameKey } from './onboarding-cli.util';
import { OnboardingApiKeyCardComponent } from './onboarding-api-key-card/onboarding-api-key-card.component';
import { OnboardingCliCardComponent } from './onboarding-cli-card/onboarding-cli-card.component';
import { OnboardingReviewService } from './onboarding-review.service';
import { OnboardingReviewStepComponent } from './onboarding-review-step/onboarding-review-step.component';
import { OnboardingResumeService } from './onboarding-resume.service';
import { OnboardingResumeStepComponent } from './onboarding-resume-step/onboarding-resume-step.component';
import { OnboardingTargetingService } from './onboarding-targeting.service';
import { OnboardingTargetingStepComponent } from './onboarding-targeting-step/onboarding-targeting-step.component';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast/toast.service';

/** Full-screen onboarding wizard overlay. Auto-opened once after the
 * health-check (see app.ts + onboarding-gate.util.ts). Focused-shell layout:
 * a single centered column with a horizontal step stepper up top, the
 * current step body, and a footer nav - no left rail. */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    ButtonDirective,
    FormsModule,
    LucideAngularModule,
    OnboardingApiKeyCardComponent,
    OnboardingCliCardComponent,
    OnboardingResumeStepComponent,
    OnboardingReviewStepComponent,
    OnboardingTargetingStepComponent,
  ],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
  providers: [
    OnboardingAiKeyService,
    OnboardingCliBridgeService,
    OnboardingResumeService,
    OnboardingReviewService,
    OnboardingTargetingService,
  ],
})
export class OnboardingComponent {
  protected readonly resume = inject(OnboardingResumeService);
  protected readonly targeting = inject(OnboardingTargetingService);
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  // Bound on the host element (not the inner template) so the whole overlay
  // - including anything future markup adds outside `.ob` - always carries
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
    download: Download,
    externalLink: ExternalLink,
    fileText: FileText,
    hardDrive: HardDrive,
    info: Info,
    key: Key,
    lock: Lock,
    plus: Plus,
    playCircle: CirclePlay,
    refresh: RefreshCw,
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

  /** The parsed resume and the Review step's edits to it. Owned by the Review
   * step child; the wizard reads the same signals back for navigation, the
   * Ready summary, the profile it saves and the CV document it writes. */
  readonly review = inject(OnboardingReviewService);

  readonly railSteps = computed(() => {
    const current = this.step();
    const hasReview = this.review.hasReview();
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
  /** The API-key card owns this state and mutates it; the wizard reads it back
   * for the Continue gate, the Ready summary and the settings it persists.
   * These are read-through aliases onto the same signals, not copies. */
  protected readonly aiKey = inject(OnboardingAiKeyService);
  protected readonly cli = inject(OnboardingCliBridgeService);

  /** The provider grid above both AI panels still renders these, and a template
   * cannot name an imported function or constant directly. */
  protected readonly cliProviders = CLI_PROVIDERS;
  protected readonly cardNameKey = cardNameKey;
  readonly selectedProvider = this.aiKey.provider;
  readonly guide = this.aiKey.guide;
  readonly keyStored = this.aiKey.keyStored;
  /** Providers that API mode can actually dispatch to. `ai/api.rs` handles
   * `claude` and `deepseek` and answers anything else with "not supported in
   * API mode yet", so offering OpenAI here sent the user to buy a key that
   * every later action would reject. OpenAI is reachable, but through Codex in
   * CLI mode - see `CLI_PROVIDERS`. */
  readonly v1Providers: AiProvider[] = ['claude', 'deepseek'];

  /** The model pair the AI step persists alongside the provider. Owned by the
   * API-key card's service; the wizard reads it in `apiModelPatch()`. */
  readonly qualityModel = this.aiKey.qualityModel;
  readonly economyModel = this.aiKey.economyModel;

  guideFor(p: AiProvider) {
    return guideForProvider(p);
  }

  // ---- AI setup: mode ----
  /**
   * API key or CLI bridge. Onboarding offered only the key flow while CLI mode
   * was unimplemented; now that it works, a user who already pays for Claude
   * Code or Codex should never be asked to buy API credit on top.
   */
  readonly aiMode = signal<AiMode>('api');
  readonly isCliMode = computed(() => this.aiMode() === 'cli');

  async chooseAiMode(mode: AiMode): Promise<void> {
    if (this.aiMode() === mode) return;
    this.aiKey.touched.set(true);
    this.aiMode.set(mode);
    this.cli.installError.set(null);
    if (mode === 'cli') {
      // DeepSeek has no CLI, so a user arriving from the key flow with it
      // selected would land on a provider this mode cannot serve.
      if (!CLI_PROVIDERS.includes(this.selectedProvider())) {
        this.selectedProvider.set('claude');
      }
      await this.cli.refreshProbe();
      return;
    }
    // Back to API mode. A provider API mode cannot serve has to move, and the
    // model pair has to be valid either way - CLI mode is allowed to leave it
    // blank, and a blank model is not a valid API request.
    if (!this.v1Providers.includes(this.selectedProvider())) {
      this.selectedProvider.set('claude');
    }
    this.aiKey.reconcileModels();
  }

  constructor() {
    // Kicked off independently of the settings read, so "does this provider have
    // a key?" resolves in one turn rather than waiting behind it.
    void this.aiKey.refreshKeyStored();
    void this.seedAiChoiceFromSettings();
    void this.seedFromExistingProfile();
  }

  /**
   * Opens the AI step on what the user already has rather than on the hardcoded
   * defaults: a re-run that showed "Claude" while the settings row said DeepSeek
   * would silently move them back on Finish.
   *
   * The model pair is reconciled rather than trusted. A row written before this
   * step existed can hold another provider's model id, or the empty string a
   * CLI-mode run leaves behind, and neither is a valid API request.
   */
  private async seedAiChoiceFromSettings(): Promise<void> {
    try {
      const settings = await this.db.getSettings();
      // The read is async and the step is interactive from the first frame, so
      // a fast click must win over the seed rather than be overwritten by it.
      if (this.aiKey.touched()) return;
      if (settings.aiMode === 'cli' || settings.aiMode === 'api') {
        this.aiMode.set(settings.aiMode);
      }
      const provider = settings.provider;
      const allowed = this.isCliMode() ? CLI_PROVIDERS : this.v1Providers;
      if (provider && allowed.includes(provider) && provider !== this.selectedProvider()) {
        this.selectedProvider.set(provider);
        // The constructor already asked about the provider it opened on; a
        // different one has to be asked about too, or Ready reports "not
        // connected" for a provider that does have a key.
        void this.aiKey.refreshKeyStored();
      }
      this.qualityModel.set(settings.defaultModel ?? '');
      this.economyModel.set(settings.economyModel ?? '');
      if (this.isCliMode()) {
        await this.cli.refreshProbe();
        return;
      }
      this.aiKey.reconcileModels();
    } catch {
      // No settings row yet, or no Tauri runtime - the defaults above stand.
      this.aiKey.reconcileModels();
    }
  }

  /** On a re-run the wizard opens blank, so the roles the user already has must
   * be loaded in - otherwise Ready reports "0 roles selected" and Finish writes
   * an empty list over them. Only seeds; the user stays free to unpick. */
  private async seedFromExistingProfile(): Promise<void> {
    const existing = await this.readExistingProfile();
    // The profile stores full `Archetype` objects; this wizard only ever deals
    // in names and re-wraps them on save, so seed the names.
    const roles = archetypeNames(parseArchetypes(existing?.targetArchetypes));
    if (!roles.length || this.targeting.archetypes().length) return;
    this.targeting.seedRoles(roles);
  }

  // ---- Resume ----
  /** Picking the file is the wizard's: no store imports a Tauri plugin, and the
   * resume step is on its way to becoming one. It asks; this opens the dialog
   * and hands over a path. */
  async pickResumeFile(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Resume', extensions: ['pdf', 'docx'] }],
    });
    if (typeof path !== 'string') return;
    await this.resume.loadFile(path);
  }

  /**
   * Which provider the wizard's own AI calls must go to.
   *
   * The AI-setup step's choices only reach the settings row when the wizard
   * finishes, so reading `aiMode`/`provider` back from settings here dispatched
   * every in-wizard call to the pre-onboarding defaults (`api` + `claude`).
   * A user who picked DeepSeek, or CLI mode, was sent to a provider with no key
   * and got only "Couldn't parse that resume" for it. The wizard's own state is
   * the truth for the duration of the wizard.
   *
   * The model follows the same rule as `markSeen()`: the stored ids are API ids
   * (`claude-haiku-4-5`) that no CLI accepts, so CLI mode sends none and lets
   * the CLI pick its own default.
   *
   * In API mode the model comes from the wizard's own economy pick, not from
   * `settings.economyModel`. Reading it back from settings was the same class of
   * bug as reading the provider back: the settings row still holds the previous
   * provider's model id, or the empty string a CLI-mode run left behind, and
   * either one is rejected by the provider the user just chose.
   */
  private aiDispatch(): {
    mode: AiMode;
    provider: AiProvider;
    model: string;
  } {
    return {
      mode: this.aiMode(),
      provider: this.selectedProvider(),
      model: this.isCliMode() ? '' : this.economyModel(),
    };
  }

  /** The parse itself belongs to the resume store; only advancing on success is
   * the wizard's, because only the wizard knows where it is. */
  async parseResume(): Promise<void> {
    if ((await this.resume.parse(this.aiDispatch())) === true) this.next();
  }

  /** True while a footer-driven AI call is in flight. The Continue button binds
   * to it: without the guard a second click starts a second (paid) call and
   * advances twice, skipping a step entirely. */
  readonly busy = computed(() => this.resume.parsing() || this.targeting.suggesting());

  /** Footer "Continue" handler: branches per step so parsing/suggestion runs
   * before advancing, and a skipped/empty resume never blocks progress. */
  async goNext(): Promise<void> {
    if (this.busy()) return;
    const s = this.step();
    if (s === 1) {
      // Leaving AI setup commits the mode and provider, so anything the app
      // reads back from settings mid-wizard - and everything after it - agrees
      // with what the user just picked here.
      await this.persistAiChoice();
      this.next();
      return;
    }
    if (s === 2) {
      // With no resume there is nothing to review, so Review would be a dead
      // screen of empty fields - jump straight to Targeting, which the user can
      // still fill in by hand.
      if (this.resume.hasNothingToParse()) {
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

  /** The suggestion belongs to the targeting store; the resume text and the
   * wizard's own AI dispatch are the wizard's, so they are handed over. */
  async suggestArchetypes(): Promise<void> {
    await this.targeting.suggest(this.resume.text(), this.aiDispatch());
  }

  // ---- Ready summary ----
  /** Connected means a stored key in API mode, and a CLI that actually runs in
   * CLI mode - where there is no key to store at all. True for a key this run
   * saved AND one an earlier run left in the keyring. */
  readonly keyPresent = computed(() =>
    this.isCliMode() ? this.cli.selectedWorks() : this.keyStored(),
  );
  readonly providerSummary = computed(() => {
    if (!this.keyPresent()) return this.t()('onboarding.done.not_connected');
    return `${this.t()(this.guide().nameKey)} · ${this.t()('onboarding.done.connected_suffix')}`;
  });
  readonly resumeSummary = computed(() => {
    if (this.resume.path() === 'skip') return this.t()('onboarding.done.skipped');
    // Resolve the name through the same rule the artifacts are written with, so
    // the recap cannot claim a different name from the one on the profile and
    // the CV - notably for a family-name-first name the user did not reorder.
    const name = applyContactOverrides(this.review.overrides()).fullName;
    return `${this.t()('onboarding.done.imported_prefix')}${name ? ' · ' + name : ''}`;
  });
  readonly rolesSummary = computed(
    () =>
      `${this.targeting.archetypes().length} ${this.t()('onboarding.done.roles_selected_suffix')}`,
  );
  readonly compSummary = computed(() =>
    formatCompRange({
      currency: this.targeting.compCurrency(),
      min: this.targeting.compMin(),
      max: this.targeting.compMax(),
    }),
  );

  // ---- Navigation / persistence ----
  next(): void {
    this.step.update((s) => Math.min(s + 1, this.totalSteps - 1));
  }

  back(): void {
    // Step 4 → 2 when Review was skipped, mirroring the forward jump.
    this.step.update((s) => (s === 4 && !this.review.hasReview() ? 2 : Math.max(s - 1, 0)));
  }

  goTo(i: number): void {
    if (i === 3 && !this.review.hasReview()) return;
    if (i <= this.step()) this.step.set(i);
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

  /** `db_upsert_profile` replaces the whole row - a field left out is written as
   * NULL, not preserved. The wizard only authors `fullMd` and the archetypes,
   * so on a re-run it must carry the rest forward or it silently destroys the
   * scoring and pitch the user paid an AI call for. The stale scoring that
   * survives a resume change is harmless: `scoringHash` no longer matches the
   * new `fullMd`, which is exactly how Profile knows to offer a re-score. */
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

  private async readExistingProfile(): Promise<Profile | null> {
    try {
      return await this.db.getProfile();
    } catch {
      // Unreadable profile - better to write the new one than to lose the run.
      return null;
    }
  }

  /** The wizard already parsed the resume into exactly the shape Documents
   * stores, so it writes the CV document itself instead of leaving the user to
   * import the same file a second time. Fail-open: a CV that cannot be written
   * must never trap the user in onboarding or lose the profile - the Documents
   * import stays available either way. */
  async saveCvDocument(): Promise<void> {
    const parsed = this.review.parsedCv();
    if (!parsed || this.resume.path() === 'skip') return;
    try {
      const settings = await this.db.getSettings();
      const inputHash = this.resume.inputHash();
      // Re-running the wizard on the same file must not stack up copies. The
      // existing document wins: it may already carry edits made in Documents,
      // and silently overwriting those would cost more than a skipped rewrite.
      if (hasCvForInputHash(await this.db.documentLibraryList('cv'), inputHash)) return;
      await this.db.documentLibraryUpsert(
        buildOnboardingCvInput({
          parsed,
          overrides: this.review.overrides(),
          templates: await this.db.cvTemplatesList(),
          regionTag: regionTagForUiLanguage(settings.uiLanguage),
          language: settings.defaultDocLanguage ?? 'en',
          fallbackLabel: this.t()('documents.cv_untitled'),
          inputHash,
        }),
      );
    } catch (e) {
      // Fail open - the CV is a bonus on top of the profile, never a blocker.
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

  /** The only way out of the last step. Closing the overlay drops the user back
   * on whatever route is behind it - the dashboard on a first run, the page
   * they opened a re-run from - so the wizard does not pick a destination for
   * them; the app's own navigation does. */
  async finish(): Promise<void> {
    await this.saveProfile();
    await this.saveCvDocument();
    await this.markSeen();
    this.completed.emit();
  }

  /** The mode and provider chosen on the AI-setup step must be persisted, not
   * just held in component state: every AI call reads them back from settings.
   * Without this the wizard was a no-op for anyone who did not pick the default
   * - choosing OpenAI or DeepSeek and saving that key still left
   * `provider = 'claude'`, so every task went to Claude, which had no key.
   *
   * The model ids are deliberately left alone until the wizard finishes: a user
   * who tries CLI mode and switches back to API within the same run would
   * otherwise be left with the blanked ids and no model to call. */
  private async persistAiChoice(): Promise<void> {
    try {
      await this.db.updateSettings({
        aiMode: this.aiMode(),
        provider: this.selectedProvider(),
        // The model ids travel with the provider. Writing one without the other
        // is what left DeepSeek users pointed at a Claude model id.
        ...this.apiModelPatch(),
      });
    } catch {
      // fail open - never trap the user in onboarding
    }
  }

  /** The model fields to persist alongside the provider, or nothing in CLI mode,
   * where a blank pair is the correct value ("let the CLI choose"). */
  private apiModelPatch(): { defaultModel: string; economyModel: string } | Record<string, never> {
    if (this.isCliMode()) return {};
    const quality = this.qualityModel();
    const economy = this.economyModel();
    if (!quality || !economy) return {};
    return { defaultModel: quality, economyModel: economy };
  }

  private async markSeen(): Promise<void> {
    try {
      await this.db.updateSettings({
        onboardingSeen: true,
        aiMode: this.aiMode(),
        provider: this.selectedProvider(),
        // In CLI mode the stored model ids are API ids (`claude-opus-4-8`),
        // which a CLI does not accept - `codex --model claude-opus-4-8` is a
        // guaranteed failure. Blank them so the CLI picks its own default; the
        // user can choose a CLI model name later in Settings.
        //
        // In API mode the opposite is required: the pair chosen on the AI step
        // has to land in the settings row, or the rest of the app keeps calling
        // the previous provider's model.
        ...(this.isCliMode() ? { defaultModel: '', economyModel: '' } : this.apiModelPatch()),
      });
    } catch {
      // fail open - never trap the user in onboarding
    }
  }
}

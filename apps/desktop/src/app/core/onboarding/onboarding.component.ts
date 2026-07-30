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
  CvParsedContent,
  Profile,
  archetypeNames,
  serializeArchetypes,
  parseArchetypes,
  serializeCompensation,
  splitDisplayName,
  apiModelsFor,
  resolveApiModels,
} from '@applye/core';
import { AiService, CliStatus, DbService, KeysService } from '@applye/data';
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
/** Feedback for the key INPUT only - never a claim about the keyring. Whether a
 * key exists is `keyStored`, which a failed paste must not disturb. Neither
 * means the provider accepted the key: nothing here calls the API. */
type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid';

/** Full-screen onboarding wizard overlay. Auto-opened once after the
 * health-check (see app.ts + onboarding-gate.util.ts). Focused-shell layout:
 * a single centered column with a horizontal step stepper up top, the
 * current step body, and a footer nav - no left rail. */
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
  /** Whether the selected provider has a key in the OS keyring - from the
   * keyring itself, so it survives a re-run and an input the user fumbles. */
  readonly keyStored = signal(false);
  readonly keySaveError = signal(false);
  /** Providers that API mode can actually dispatch to. `ai/api.rs` handles
   * `claude` and `deepseek` and answers anything else with "not supported in
   * API mode yet", so offering OpenAI here sent the user to buy a key that
   * every later action would reject. OpenAI is reachable, but through Codex in
   * CLI mode - see `cliProviders`. */
  readonly v1Providers: AiProvider[] = ['claude', 'deepseek'];

  /**
   * The quality and economy model ids for API mode.
   *
   * These exist here because the wizard's own AI calls need a model the chosen
   * provider accepts, and nothing else in the wizard supplied one. The step
   * persisted `provider` but never the model ids, so picking DeepSeek left the
   * Claude defaults in the settings row - or, after a CLI-mode run blanked them,
   * an empty string - and every wizard call came back as
   * `The supported API model names are deepseek-v4-pro or deepseek-v4-flash,
   * but you passed .`
   *
   * Seeded from the stored settings so a re-run shows what the user already has,
   * and reconciled against the selected provider's catalogue so a stale or blank
   * value can never survive into a request.
   */
  readonly qualityModel = signal('');
  readonly economyModel = signal('');

  /** Set once the user changes anything on the AI step, so the async seed from
   * settings can tell "still showing defaults" from "the user has chosen". */
  private aiChoiceTouched = false;

  /** Models offered for the selected provider. Empty in CLI mode, where the
   * model string is free text the CLI interprets. */
  readonly providerModels = computed(() => apiModelsFor(this.selectedProvider()));

  readonly providerSteps = computed(() =>
    this.guide().stepKeys.map((key, i) => ({ n: i + 1, text: this.t()(key) })),
  );

  guideFor(p: AiProvider) {
    return guideForProvider(p);
  }

  /** Card title: the CLI's name in CLI mode ("Claude Code"), the vendor's in
   * API mode ("Claude"). */
  cardNameKey(p: AiProvider): string {
    const guide = guideForProvider(p);
    return (this.isCliMode() && guide.cliNameKey) || guide.nameKey;
  }

  // ---- AI setup: mode ----
  /**
   * API key or CLI bridge. Onboarding offered only the key flow while CLI mode
   * was unimplemented; now that it works, a user who already pays for Claude
   * Code or Codex should never be asked to buy API credit on top.
   */
  readonly aiMode = signal<AiMode>('api');
  readonly isCliMode = computed(() => this.aiMode() === 'cli');

  /** Provider ids that have a usable CLI. `openai` is Codex - the app's
   * provider ids predate the CLI bridge. DeepSeek has no CLI and is API-only.
   * Gemini is absent on purpose: Google stopped Gemini CLI serving personal
   * accounts on 2026-06-18, so it cannot serve this mode (see ai/cli.rs). */
  readonly cliProviders: AiProvider[] = ['claude', 'openai'];

  readonly cliStatuses = signal<CliStatus[]>([]);
  readonly cliProbing = signal(false);
  /** Provider id currently being installed, so only that row shows a spinner. */
  readonly installingCli = signal<AiProvider | null>(null);
  readonly installError = signal<{ message: string; needsNode: boolean } | null>(null);

  /** Status row for one provider, once probed. */
  cliStatusFor(provider: AiProvider): CliStatus | undefined {
    return this.cliStatuses().find((c) => c.provider === provider);
  }

  /** The selected CLI is present and actually runs. */
  readonly selectedCliWorks = computed(
    () => this.cliStatusFor(this.selectedProvider())?.working ?? false,
  );

  /** npm package and terminal command per CLI, for the setup instructions. */
  private readonly cliSetupInfo: Record<string, { pkg: string; cmd: string }> = {
    claude: { pkg: '@anthropic-ai/claude-code', cmd: 'claude' },
    openai: { pkg: '@openai/codex', cmd: 'codex' },
  };

  /**
   * What the user has to do to get the CLI they picked working.
   *
   * Scoped to the selected provider on purpose: showing setup steps for all
   * three at once would bury the one decision being made. The three status
   * rows above stay a scannable list; this is the teaching state for the one
   * the user is committing to.
   *
   * A working CLI still gets a line, because "runs" is not "signed in" - the
   * probe only proves the binary executes. An expired or ineligible account
   * fails later, at task time, with an authentication error, and this is the
   * only place that tells the user what that means.
   */
  readonly selectedCliSetup = computed(() => {
    const provider = this.selectedProvider();
    const info = this.cliSetupInfo[provider];
    if (!info) return null;
    const status = this.cliStatusFor(provider);
    const name = this.t()(this.cardNameKey(provider));
    if (status?.working) {
      return { name, working: true, signInCommand: info.cmd, steps: [] };
    }
    return {
      name,
      working: false,
      signInCommand: info.cmd,
      steps: [
        {
          n: 1,
          text: this.t()(
            status?.installed ? 'onboarding.ai.cli.step_repair' : 'onboarding.ai.cli.step_install',
          ),
          command: `npm install -g ${info.pkg}`,
        },
        {
          n: 2,
          text: this.t()('onboarding.ai.cli.step_signin'),
          command: info.cmd,
        },
      ],
    };
  });

  async chooseAiMode(mode: AiMode): Promise<void> {
    if (this.aiMode() === mode) return;
    this.aiChoiceTouched = true;
    this.aiMode.set(mode);
    this.installError.set(null);
    if (mode === 'cli') {
      // DeepSeek has no CLI, so a user arriving from the key flow with it
      // selected would land on a provider this mode cannot serve.
      if (!this.cliProviders.includes(this.selectedProvider())) {
        this.selectedProvider.set('claude');
      }
      await this.refreshCliProbe();
      return;
    }
    // Back to API mode. A provider API mode cannot serve has to move, and the
    // model pair has to be valid either way - CLI mode is allowed to leave it
    // blank, and a blank model is not a valid API request.
    if (!this.v1Providers.includes(this.selectedProvider())) {
      this.selectedProvider.set('claude');
    }
    this.reconcileModels();
  }

  async refreshCliProbe(): Promise<void> {
    this.cliProbing.set(true);
    try {
      this.cliStatuses.set(await this.ai.probeClis());
    } catch {
      // Outside a Tauri runtime the command does not exist; an empty list
      // reads as "none found" rather than breaking the wizard.
      this.cliStatuses.set([]);
    } finally {
      this.cliProbing.set(false);
    }
  }

  /**
   * Installs a CLI with npm on the user's behalf. This modifies their machine,
   * so it happens only on this explicit click, and the exact command is shown
   * in the UI both before and after.
   *
   * A successful install does NOT mean the user can use it yet: these CLIs
   * authenticate interactively against the user's own account, which cannot be
   * done from inside Applye. The UI says so rather than letting them find out
   * at the first real task.
   */
  async installCli(provider: AiProvider): Promise<void> {
    if (this.installingCli()) return;
    this.installingCli.set(provider);
    this.installError.set(null);
    try {
      const result = await this.ai.installCli(provider);
      if (result.ok) {
        await this.refreshCliProbe();
      } else {
        this.installError.set({ message: result.message, needsNode: result.needsNode });
      }
    } catch (e) {
      this.installError.set({ message: String(e), needsNode: false });
    } finally {
      this.installingCli.set(null);
    }
  }

  async openNodeSite(): Promise<void> {
    await openUrl('https://nodejs.org');
  }

  constructor() {
    // Kicked off independently of the settings read, so "does this provider have
    // a key?" resolves in one turn rather than waiting behind it.
    void this.refreshKeyStored();
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
      if (this.aiChoiceTouched) return;
      if (settings.aiMode === 'cli' || settings.aiMode === 'api') {
        this.aiMode.set(settings.aiMode);
      }
      const provider = settings.provider;
      const allowed = this.isCliMode() ? this.cliProviders : this.v1Providers;
      if (provider && allowed.includes(provider) && provider !== this.selectedProvider()) {
        this.selectedProvider.set(provider);
        // The constructor already asked about the provider it opened on; a
        // different one has to be asked about too, or Ready reports "not
        // connected" for a provider that does have a key.
        void this.refreshKeyStored();
      }
      this.qualityModel.set(settings.defaultModel ?? '');
      this.economyModel.set(settings.economyModel ?? '');
      if (this.isCliMode()) {
        await this.refreshCliProbe();
        return;
      }
      this.reconcileModels();
    } catch {
      // No settings row yet, or no Tauri runtime - the defaults above stand.
      this.reconcileModels();
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
    if (!roles.length || this.archetypes().length) return;
    this.archetypes.set(roles);
    this.suggestedRoles.set(roles);
    // Marks the selection as authored, so the resume-driven suggestion that
    // follows adds to these roles rather than replacing them.
    this.selectionSeeded.set(true);
  }

  selectProvider(id: AiProvider): void {
    this.aiChoiceTouched = true;
    this.selectedProvider.set(id);
    this.keyStatus.set('idle');
    this.keyStored.set(false);
    this.keySaveError.set(false);
    this.reconcileModels();
    void this.refreshKeyStored();
  }

  /** Puts the model pair back on the selected provider's catalogue. A value
   * that is blank, or belongs to the provider the user just switched away from,
   * is replaced by that provider's default; a valid non-default pick is kept. */
  private reconcileModels(): void {
    const models = resolveApiModels(this.selectedProvider(), {
      defaultModel: this.qualityModel(),
      economyModel: this.economyModel(),
    });
    if (!models) return;
    this.qualityModel.set(models.defaultModel);
    this.economyModel.set(models.economyModel);
  }

  setQualityModel(model: string): void {
    this.aiChoiceTouched = true;
    this.qualityModel.set(model);
  }

  setEconomyModel(model: string): void {
    this.aiChoiceTouched = true;
    this.economyModel.set(model);
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
      // Keyring unreadable - leave it as "no key" and let the user paste one.
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
   * touching the keyring - this is NOT a live validation against the
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
      // so `keyStored` is deliberately untouched here - reporting "no key" for
      // a provider that still has a working one is the worse lie.
      this.keyStatus.set('idle');
      this.keySaveError.set(true);
    }
  }

  // ---- Resume ----
  readonly resumePath = signal<ResumePath>('upload');
  readonly resumeFileName = signal<string | null>(null);
  readonly resumeText = signal('');
  /** Set only by the upload path - the paste path has no file to hash. Carried
   * so the CV document written on finish can reuse the Documents import's
   * duplicate guard. */
  readonly resumeInputHash = signal<string | undefined>(undefined);
  readonly parsing = signal(false);
  readonly resumeError = signal(false);
  /** The raw failure behind `resumeError`, shown under the friendly line. */
  readonly resumeErrorDetail = signal<string | null>(null);
  readonly parsedCv = signal<CvParsedContent | null>(null);

  readonly experience = computed(() => this.parsedCv()?.experience ?? []);
  readonly skills = computed(() => this.parsedCv()?.skills ?? []);
  readonly lowConfidenceCount = computed(() => this.parsedCv()?.lowConfidenceNotes?.length ?? 0);

  // ---- Review (editable overrides seeded once from the parsed CV) ----
  readonly reviewFirstName = signal('');
  readonly reviewLastName = signal('');
  /** Set the first time the user touches either name field. The nudge is a
   * question, and a question stops being worth asking once it is answered -
   * including when the answer is "what you parsed was already right". */
  readonly nameEdited = signal(false);

  /** True when the parse could not confirm the split, so the review step should
   * ask. Never gates Continue: Applye augments, it does not block. */
  readonly needsNameConfirm = computed(() => {
    if (this.nameEdited()) return false;
    const first = this.reviewFirstName().trim();
    const last = this.reviewLastName().trim();
    // Nothing parsed at all, nothing to confirm. But one part alone is exactly
    // the case worth asking about, whichever of the two it is.
    if (!first && !last) return false;
    if (!first || !last) return true;
    return this.parsedCv()?.personalDetails.nameSplitConfident !== true;
  });

  onNameEdited(): void {
    this.nameEdited.set(true);
  }

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
   * one - a stale parse would otherwise reach the profile and the CV document,
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

  async parseResume(): Promise<void> {
    const text = this.resumeText().trim();
    if (!text) return;
    this.parsing.set(true);
    this.resumeError.set(false);
    this.resumeErrorDetail.set(null);
    try {
      const settings = await this.db.getSettings();
      // Match the Documents cv-import pipeline: the skill's `language` drives
      // label text and follows the UI language, not the document output language.
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-import', { cv_text: text, language });
      const res = await this.ai.run({
        ...this.aiDispatch(),
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        // Same ceiling as the Documents import: a resume long enough to truncate
        // the answer comes back as unparseable JSON, which reads as a parse bug.
        maxTokens: 8192,
      });
      const cv = parseCvSkillResponse(res.text);
      this.parsedCv.set(cv);
      this.seedReviewFields();
      this.next();
    } catch (e) {
      this.resumeError.set(true);
      // The friendly line stays, but the real reason has to be visible: an
      // auth failure, a missing key and a genuinely malformed answer all landed
      // on the same sentence, and none of them was ever a parsing problem.
      this.resumeErrorDetail.set(String(e));
    } finally {
      this.parsing.set(false);
    }
  }

  /** Seed each review field only if still empty - a Back + re-parse must never
   * silently clobber the user's manual edits. Extracted so tests can drive
   * seeding without running a full parse. */
  seedReviewFields(): void {
    const cv = this.parsedCv();
    if (!cv) return;
    const split = splitDisplayName(cv.personalDetails.fullName ?? '');
    // `||` rather than `??`: a part the parse left as an empty string carries no
    // more information than a missing one, so both fall back to the derived split.
    if (!this.reviewFirstName().trim())
      this.reviewFirstName.set(cv.personalDetails.firstName || split.firstName);
    if (!this.reviewLastName().trim())
      this.reviewLastName.set(cv.personalDetails.lastName || split.lastName);
    if (!this.reviewEmail().trim()) this.reviewEmail.set(cv.personalDetails.email ?? '');
    if (!this.reviewPhone().trim()) this.reviewPhone.set(cv.personalDetails.phone ?? '');
    if (!this.reviewAddress().trim()) this.reviewAddress.set(cv.personalDetails.address ?? '');
  }

  // ---- Targeting (archetypes + compensation) ----
  readonly suggestedRoles = signal<string[]>([]);
  readonly archetypes = signal<string[]>([]);
  readonly suggesting = signal(false);
  /** True once the selection has a deliberate author - the first AI suggestion,
   * or the roles seeded from an existing profile on a re-run. Distinguishes an
   * unauthored blank from "the user unchecked everything", and stops a
   * suggestion from replacing roles the user already had. */
  readonly selectionSeeded = signal(false);
  /** Roles the user unchecked by hand - a re-suggest must not bring them back. */
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

  /** Suggestion only - it never advances the wizard, because the Targeting step
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
        ...this.aiDispatch(),
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });
      const parsed = parseArchetypesSkillResponse(res.text);
      this.suggestedRoles.set(parsed.archetypes);
      // The first suggestion seeds the selection; every later one only offers
      // its roles as chips. Union-ing on a re-suggest would re-check roles the
      // user had just unchecked, and an empty selection is a real choice - not
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
      // is only ever seeded before the user reaches the step - but once they
      // have edited it, a re-suggest must not overwrite their number.
      if (!this.compTouched()) {
        const range = parseCompRange(parsed.compRange);
        this.compCurrency.set(normalizeCurrency(range.currency));
        this.compMin.set(range.min);
        this.compMax.set(range.max);
      }
    } catch {
      // Suggestion is an enhancement, not a requirement - fail soft and let
      // the user confirm/add roles manually on the targeting step.
    } finally {
      this.suggesting.set(false);
    }
  }

  // ---- Ready summary ----
  /** Connected means a stored key in API mode, and a CLI that actually runs in
   * CLI mode - where there is no key to store at all. True for a key this run
   * saved AND one an earlier run left in the keyring. */
  readonly keyPresent = computed(() =>
    this.isCliMode() ? this.selectedCliWorks() : this.keyStored(),
  );
  readonly providerSummary = computed(() => {
    if (!this.keyPresent()) return this.t()('onboarding.done.not_connected');
    return `${this.t()(this.guide().nameKey)} · ${this.t()('onboarding.done.connected_suffix')}`;
  });
  readonly resumeSummary = computed(() => {
    if (this.resumePath() === 'skip') return this.t()('onboarding.done.skipped');
    // Resolve the name through the same rule the artifacts are written with, so
    // the recap cannot claim a different name from the one on the profile and
    // the CV - notably for a family-name-first name the user did not reorder.
    const name = applyContactOverrides(this.reviewOverrides()).fullName;
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
      firstName: this.reviewFirstName(),
      lastName: this.reviewLastName(),
      email: this.reviewEmail(),
      phone: this.reviewPhone(),
      address: this.reviewAddress(),
      parsedFullName: this.parsedCv()?.personalDetails.fullName ?? '',
      nameEdited: this.nameEdited(),
    };
  }

  private buildProfileCv(): ParsedCv {
    const cv = this.parsedCv();
    return {
      // Spread the parsed contact first so website, LinkedIn and title survive;
      // the review overrides then replace only the four fields the user edited
      // (name/email/phone/address), mirroring buildOnboardingCvInput.
      personalDetails: { ...cv?.personalDetails, ...applyContactOverrides(this.reviewOverrides()) },
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
            min: String(this.compMin()),
            max: String(this.compMax()),
            currency: this.compCurrency(),
            period: 'year',
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
      pitchHash: existing?.pitchHash,
      targetArchetypes: serializeArchetypes(parseArchetypes(JSON.stringify(this.archetypes()))),
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

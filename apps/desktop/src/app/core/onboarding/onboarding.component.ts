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
import { AiMode, AiProvider } from '@applye/core';
import {
  ONBOARDING_CLI_PROVIDERS,
  OnboardingAiKeyStore,
  OnboardingAiSetupStore,
  OnboardingCliBridgeStore,
  OnboardingFinishStore,
  OnboardingResumeStore,
  OnboardingReviewStore,
  OnboardingTargetingStore,
  applyContactOverrides,
  cardNameKey,
  formatCompRange,
  guideForProvider,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { buildCvContent } from '../../pages/documents/cv-content.util';
import { parseCvSkillResponse } from '../../pages/documents/cv-parse.util';
import { OnboardingApiKeyCardComponent } from './onboarding-api-key-card/onboarding-api-key-card.component';
import { OnboardingCliCardComponent } from './onboarding-cli-card/onboarding-cli-card.component';
import { OnboardingReviewStepComponent } from './onboarding-review-step/onboarding-review-step.component';
import { OnboardingResumeStepComponent } from './onboarding-resume-step/onboarding-resume-step.component';
import { OnboardingTargetingStepComponent } from './onboarding-targeting-step/onboarding-targeting-step.component';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast/toast.service';

/** Full-screen onboarding wizard overlay. Auto-opened once after the
 * health-check (see app.ts + onboarding-gate.util.ts). Focused-shell layout:
 * a single centered column with a horizontal step stepper up top, the
 * current step body, and a footer nav - no left rail.
 *
 * It renders and delegates. Every piece of step state lives in one of the seven
 * stores it provides, in `libs/application`; what stays here is where the wizard
 * is (`step` and its navigation), the sentences the Ready step assembles from
 * what the stores publish, the theme the overlay carries, the toast, and the
 * two things no store may do - open a Tauri file dialog, and reach the parsing
 * and layout helpers that still live in `apps/desktop` (see `CvCodec`). */
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
    OnboardingAiKeyStore,
    OnboardingAiSetupStore,
    OnboardingCliBridgeStore,
    OnboardingFinishStore,
    OnboardingResumeStore,
    OnboardingReviewStore,
    OnboardingTargetingStore,
  ],
})
export class OnboardingComponent {
  protected readonly resume = inject(OnboardingResumeStore);
  protected readonly targeting = inject(OnboardingTargetingStore);
  protected readonly aiKey = inject(OnboardingAiKeyStore);
  protected readonly cli = inject(OnboardingCliBridgeStore);
  private readonly aiSetup = inject(OnboardingAiSetupStore);
  private readonly finishStore = inject(OnboardingFinishStore);
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
  readonly review = inject(OnboardingReviewStore);

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
  /** Read-through aliases onto the stores' own signals, not copies: the two AI
   * cards mutate the same signals the provider grid and the Continue gate read
   * back. Kept under the names the template already binds. */
  protected readonly cliProviders = ONBOARDING_CLI_PROVIDERS;
  protected readonly cardNameKey = cardNameKey;
  readonly selectedProvider = this.aiKey.provider;
  readonly guide = this.aiKey.guide;
  readonly keyStored = this.aiKey.keyStored;
  readonly v1Providers = this.aiSetup.v1Providers;
  readonly qualityModel = this.aiKey.qualityModel;
  readonly economyModel = this.aiKey.economyModel;
  readonly aiMode = this.aiSetup.mode;
  readonly isCliMode = this.aiSetup.isCliMode;
  readonly keyPresent = this.aiSetup.connected;

  guideFor(p: AiProvider) {
    return guideForProvider(p);
  }

  async chooseAiMode(mode: AiMode): Promise<void> {
    await this.aiSetup.chooseMode(mode);
  }

  constructor() {
    // Kicked off independently of the settings read, so "does this provider have
    // a key?" resolves in one turn rather than waiting behind it.
    void this.aiKey.refreshKeyStored();
    void this.aiSetup.seedFromSettings();
    void this.finishStore.seedTargetingFromProfile();
  }

  // ---- Resume ----
  /** Picking the file is the wizard's: no store imports a Tauri plugin. The
   * resume step asks; this opens the dialog and hands over a path. */
  async pickResumeFile(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Resume', extensions: ['pdf', 'docx'] }],
    });
    if (typeof path !== 'string') return;
    await this.resume.loadFile(path);
  }

  /** The parse itself belongs to the resume store; only advancing on success is
   * the wizard's, because only the wizard knows where it is. `parseCvSkillResponse`
   * is handed over because it lives in `apps/desktop` and cannot be imported
   * from the layer below (see `CvCodec`). */
  async parseResume(): Promise<void> {
    if ((await this.resume.parse(this.aiSetup.dispatch(), parseCvSkillResponse)) === true)
      this.next();
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
      await this.aiSetup.persistChoice();
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

  /** The suggestion belongs to the targeting store; the resume text and the AI
   * dispatch are the AI-setup store's, so they are handed over. */
  async suggestArchetypes(): Promise<void> {
    await this.targeting.suggest(this.resume.text(), this.aiSetup.dispatch());
  }

  // ---- Ready summary ----
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

  // ---- Navigation ----
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

  async skip(): Promise<void> {
    await this.aiSetup.markSeen();
    this.completed.emit();
  }

  /** The only way out of the last step. Closing the overlay drops the user back
   * on whatever route is behind it - the dashboard on a first run, the page
   * they opened a re-run from - so the wizard does not pick a destination for
   * them; the app's own navigation does.
   *
   * The store answers with an outcome rather than raising the toast itself: a
   * CV that could not be written is worth saying out loud, and only the page
   * has anything to say it with. */
  async finish(): Promise<void> {
    await this.finishStore.saveProfile();
    const outcome = await this.finishStore.saveCvDocument({
      fallbackLabel: this.t()('documents.cv_untitled'),
      buildContent: buildCvContent,
    });
    if (outcome === 'failed') this.toast.error(this.t()('onboarding.cv_save_failed'));
    await this.aiSetup.markSeen();
    this.completed.emit();
  }
}

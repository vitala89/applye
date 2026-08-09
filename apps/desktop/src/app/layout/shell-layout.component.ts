import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import {
  BarChart3,
  ClipboardList,
  Compass,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LoaderCircle,
  LucideAngularModule,
  Moon,
  Search,
  Settings,
  Sun,
  Target,
  User,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-angular';
import { ShellStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { UnsavedJobPromptComponent } from '../shared/unsaved-job-prompt/unsaved-job-prompt.component';
import { JobIdentityPromptComponent } from '../shared/job-identity-prompt/job-identity-prompt.component';
import { JobIdentityBadgeComponent } from '../shared/job-identity-prompt/job-identity-badge.component';
import { PasteJobModalComponent } from '../shared/paste-job-modal/paste-job-modal.component';
import { PasteJobModalService } from '../shared/paste-job-modal/paste-job-modal.service';
import { UpdaterService } from '../core/updater.service';
import { PageTitleService } from '../shared/page-title/page-title.service';
import { WizardProgressService } from '../shared/wizard-progress.service';
import { WizardActivity, WizardActivityService } from '../shared/wizard-activity.service';
import { DocumentGenService } from '../shared/document-gen.service';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [
    RouterModule,
    LucideAngularModule,
    PasteJobModalComponent,
    UnsavedJobPromptComponent,
    JobIdentityPromptComponent,
    JobIdentityBadgeComponent,
    ButtonDirective,
  ],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
  providers: [ShellStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellLayoutComponent implements OnInit {
  protected readonly shell = inject(ShellStore);
  protected readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly pasteJobModal = inject(PasteJobModalService);
  protected readonly pageTitle = inject(PageTitleService);
  /** Drives the update badge beside Settings; the check itself runs at launch. */
  protected readonly updater = inject(UpdaterService);
  private readonly wizardProgress = inject(WizardProgressService);
  private readonly activity = inject(WizardActivityService);
  private readonly docGen = inject(DocumentGenService);
  private readonly router = inject(Router);

  // Live router URL so the resume affordance can hide itself when the user is
  // already on the job whose wizard is unfinished.
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * The unfinished apply-wizard session to offer resuming, or null. Hidden
   * while the user is already on that job's page (the wizard is right there).
   */
  protected readonly resumeProgress = computed(() => {
    const p = this.wizardProgress.progress();
    if (!p) return null;
    return this.currentUrl().startsWith(`/jobs/${p.jobId}`) ? null : p;
  });

  /**
   * The wizard step running for the offered resume session, or null. Flips the
   * badge to a live "processing…" state with a spinner so the user knows a step
   * is in flight, not stalled.
   */
  protected readonly runningActivity = computed<WizardActivity | null>(() => {
    const p = this.resumeProgress();
    if (!p) return null;
    const a = this.activity.runningActivityFor(p.jobId);
    if (a) return a;
    // Document generation runs independently of the single-slot activity.
    return this.docGen.anyPreparing(p.jobId) ? 'reviewing' : null;
  });

  private static readonly ACTIVITY_TITLE_KEYS: Record<WizardActivity, string> = {
    tailoring: 'jobs.wizard.resume_tailoring_title',
    scoring: 'jobs.wizard.resume_scoring_title',
    reviewing: 'jobs.wizard.resume_reviewing_title',
  };
  private static readonly ACTIVITY_HINT_KEYS: Record<WizardActivity, string> = {
    tailoring: 'jobs.wizard.resume_tailoring_hint',
    scoring: 'jobs.wizard.resume_scoring_hint',
    reviewing: 'jobs.wizard.resume_reviewing_hint',
  };

  protected resumeTitleKey(): string {
    const a = this.runningActivity();
    return a ? ShellLayoutComponent.ACTIVITY_TITLE_KEYS[a] : 'jobs.wizard.resume_title';
  }
  protected resumeHintKey(): string {
    const a = this.runningActivity();
    return a ? ShellLayoutComponent.ACTIVITY_HINT_KEYS[a] : 'jobs.wizard.resume_hint';
  }

  protected resumeTailor(): void {
    const p = this.wizardProgress.progress();
    if (p) void this.router.navigate(['/jobs', p.jobId]);
  }

  // Maps a route's top-level path segment to its i18n nav label - reused
  // as the topbar title so it always names the page actually showing.
  private static readonly PAGE_TITLE_KEYS: Record<string, string> = {
    dashboard: 'nav.dashboard',
    discover: 'nav.discover',
    profile: 'nav.profile',
    jobs: 'nav.jobs',
    pipeline: 'nav.pipeline',
    tracker: 'nav.tracker',
    analytics: 'nav.analytics',
    'interview-prep': 'nav.interview_prep',
    documents: 'nav.documents',
    settings: 'nav.settings',
  };

  protected readonly pageTitleKey = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.resolvePageTitleKey(event.urlAfterRedirects)),
      startWith(this.resolvePageTitleKey(this.router.url)),
    ),
    { initialValue: 'nav.dashboard' },
  );

  private resolvePageTitleKey(url: string): string {
    const segment = url.split('/')[1] ?? '';
    return ShellLayoutComponent.PAGE_TITLE_KEYS[segment] ?? 'nav.dashboard';
  }

  // Lucide icons - single minimalist line-icon set across the shell nav.
  protected readonly icons = {
    dashboard: LayoutDashboard,
    discover: Compass,
    profile: User,
    jobs: Search,
    pipeline: KanbanSquare,
    interviewPrep: Target,
    tracker: ClipboardList,
    analytics: BarChart3,
    documents: FileText,
    settings: Settings,
    sun: Sun,
    moon: Moon,
    wand: Wand2,
    loader: LoaderCircle,
    panelCollapse: PanelLeftClose,
    panelExpand: PanelLeftOpen,
  };

  private readonly themeService = inject(ThemeService);
  readonly theme = this.themeService.theme;

  // macOS runs with titleBarStyle: "Overlay" (tauri.conf.json) - the native
  // traffic lights float over our own header, so reserve space for them.
  // Windows/Linux keep the default native title bar and need no inset.
  protected readonly isMacOverlayChrome =
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ &&
    navigator.platform.toLowerCase().includes('mac');

  /**
   * Applying the stored locale is the shell's job, not the store's: the store
   * reads the preference, and a failed read simply leaves it null, which keeps
   * the defaults (en / dark) exactly as before.
   */
  async ngOnInit(): Promise<void> {
    await this.shell.load();
    const locale = this.shell.uiLanguage();
    if (locale) this.i18n.setLocale(locale);
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }
}

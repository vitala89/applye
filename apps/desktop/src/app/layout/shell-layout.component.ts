import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
} from 'lucide-angular';
import { AiMode } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { PasteJobModalComponent } from '../shared/paste-job-modal/paste-job-modal.component';
import { PasteJobModalService } from '../shared/paste-job-modal/paste-job-modal.service';
import { PageTitleService } from '../shared/page-title/page-title.service';
import { WizardProgressService } from '../shared/wizard-progress.service';
import { TailorScoreService } from '../shared/tailor-score.service';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [RouterModule, LucideAngularModule, PasteJobModalComponent],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent implements OnInit {
  protected readonly db = inject(DbService);
  protected readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly pasteJobModal = inject(PasteJobModalService);
  protected readonly pageTitle = inject(PageTitleService);
  private readonly wizardProgress = inject(WizardProgressService);
  private readonly tailorScore = inject(TailorScoreService);
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
   * True when the offered resume session's post-tailor rescore is still
   * running - flips the badge to a live "scoring…" state with a spinner so
   * the user knows a step is in flight, not stalled.
   */
  protected readonly scoringRunning = computed(() => {
    const p = this.resumeProgress();
    return !!p && this.tailorScore.runningJobId() === p.jobId;
  });

  protected resumeTailor(): void {
    const p = this.wizardProgress.progress();
    if (p) void this.router.navigate(['/jobs', p.jobId]);
  }

  // Maps a route's top-level path segment to its i18n nav label — reused
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

  // Lucide icons — single minimalist line-icon set across the shell nav.
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
  };

  private readonly themeService = inject(ThemeService);
  readonly theme = this.themeService.theme;
  readonly aiMode = signal<AiMode>('api');

  // macOS runs with titleBarStyle: "Overlay" (tauri.conf.json) — the native
  // traffic lights float over our own header, so reserve space for them.
  // Windows/Linux keep the default native title bar and need no inset.
  protected readonly isMacOverlayChrome =
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ &&
    navigator.platform.toLowerCase().includes('mac');

  async ngOnInit(): Promise<void> {
    try {
      const settings = await this.db.getSettings();
      if (settings?.uiLanguage) {
        this.i18n.setLocale(settings.uiLanguage);
      }
      if (settings?.aiMode) {
        this.aiMode.set(settings.aiMode);
      }
    } catch {
      // Keep defaults (en / dark) on DB error
    }
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }
}

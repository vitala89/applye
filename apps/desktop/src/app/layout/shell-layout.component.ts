import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import {
  BarChart3,
  ClipboardList,
  Compass,
  KanbanSquare,
  LayoutDashboard,
  LucideAngularModule,
  Moon,
  Search,
  Settings,
  Sun,
  Target,
  User,
} from 'lucide-angular';
import { AiMode } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { PasteJobModalComponent } from '../shared/paste-job-modal/paste-job-modal.component';
import { PasteJobModalService } from '../shared/paste-job-modal/paste-job-modal.service';

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
  private readonly router = inject(Router);

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
    settings: Settings,
    sun: Sun,
    moon: Moon,
  };

  readonly theme = signal<'dark' | 'light'>('dark');
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
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.setAttribute('data-theme', next);
  }
}

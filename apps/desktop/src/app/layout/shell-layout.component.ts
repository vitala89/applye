import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  FileText,
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
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [RouterModule, LucideAngularModule],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent implements OnInit {
  protected readonly db = inject(DbService);
  protected readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  // Lucide icons — single minimalist line-icon set across the shell nav.
  protected readonly icons = {
    dashboard: LayoutDashboard,
    profile: User,
    jobs: Search,
    pipeline: KanbanSquare,
    interviewPrep: Target,
    documents: FileText,
    settings: Settings,
    sun: Sun,
    moon: Moon,
  };

  readonly theme = signal<'dark' | 'light'>('dark');

  async ngOnInit(): Promise<void> {
    try {
      const settings = await this.db.getSettings();
      if (settings?.uiLanguage) {
        this.i18n.setLocale(settings.uiLanguage);
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

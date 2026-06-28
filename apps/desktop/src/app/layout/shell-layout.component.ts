import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent implements OnInit {
  protected readonly db = inject(DbService);
  protected readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

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

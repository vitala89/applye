import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AnalyticsService } from './analytics/analytics.service';
import { Track } from './analytics/track.directive';
import { I18nService } from './i18n/i18n.service';
import { SeoService } from './seo/seo.service';
import { LanguageSwitcher } from './ui/language-switcher';
import { AUTHOR, DATA_CONTRACT, DISCORD, LINKEDIN, X_TWITTER, YEAR } from './site';
import { ConsentBanner } from './ui/consent-banner';
import { Icon } from './ui/icon';
import { SourceLink } from './ui/source-link';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'applye-theme';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SourceLink,
    ConsentBanner,
    Icon,
    LanguageSwitcher,
    Track,
  ],
  templateUrl: './app.html',
})
export class App {
  private readonly doc = inject(DOCUMENT);

  // Instantiated for their side effects: per-route meta tags, and analytics
  // that stay dormant until the visitor opts in.
  readonly seo = inject(SeoService);
  readonly analytics = inject(AnalyticsService);

  private readonly i18n = inject(I18nService);

  /**
   * Shell copy follows the language the reader chose, not the language of the
   * current page: the docs are English-only, and dropping someone back to an
   * English header the moment they open them loses their choice silently.
   */
  readonly m = this.i18n.ui;
  readonly uiLocale = this.i18n.uiLocale;
  /** The logo returns to the reader's own landing page, not always `/`. */
  readonly homePath = this.i18n.homePath;

  readonly dataContract = DATA_CONTRACT;
  readonly author = AUTHOR;
  readonly year = YEAR;
  readonly discord = DISCORD;
  readonly linkedin = LINKEDIN;
  readonly xTwitter = X_TWITTER;

  readonly theme = signal<Theme>('dark');

  constructor() {
    const stored = this.readStoredTheme();
    if (stored) {
      this.applyTheme(stored);
    } else {
      const current = this.doc.documentElement.getAttribute('data-theme');
      this.theme.set(current === 'light' ? 'light' : 'dark');
    }
  }

  toggleTheme(): void {
    this.applyTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private applyTheme(theme: Theme): void {
    this.theme.set(theme);
    this.doc.documentElement.setAttribute('data-theme', theme);
    try {
      this.doc.defaultView?.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode / storage disabled; theme still applies for this session.
    }
  }

  private readStoredTheme(): Theme | null {
    try {
      const v = this.doc.defaultView?.localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch {
      return null;
    }
  }
}

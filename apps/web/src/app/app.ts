import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AUTHOR, DATA_CONTRACT, DISCORD, LINKEDIN, REPO, X_TWITTER, YEAR } from './site';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'applye-theme';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  private readonly doc = inject(DOCUMENT);

  readonly repo = REPO;
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

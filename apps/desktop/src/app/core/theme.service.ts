import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

/** Single source of truth for the dark/light theme, synced to
 * `<html data-theme>` (index.html sets the initial default). Previously
 * `ShellLayoutComponent` held this as component-instance state, which reset
 * to 'dark' every time the shell remounted (e.g. after the onboarding
 * overlay — a sibling branch in app.ts's template — unmounts it), leaving
 * `<html>` and the shell's own `data-theme` binding out of sync. A shared
 * root-provided service survives remounts of either consumer. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.readInitial());
  readonly theme = this._theme.asReadonly();

  private readInitial(): Theme {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this._theme.set(next);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next);
    }
  }
}

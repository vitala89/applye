import { Injectable, inject, signal } from '@angular/core';
import type { SupportedLanguage } from '@applye/core';
import { DbService } from '@applye/data';

/** localStorage key for the sidebar rail preference. */
const SIDEBAR_COLLAPSED_KEY = 'applye.sidebar.collapsed';

/**
 * What the app shell holds: the stored UI language, and whether the sidebar is
 * a rail.
 *
 * **The store does not apply the language.** `setLocale` is an i18n side
 * effect, and this layer has refused to translate, navigate or toast in every
 * migration before it (ADR-0005). The store reads the preference; the shell
 * applies it.
 *
 * Nothing else on the shell belongs here. The resume affordance is computed
 * from the app's own wizard services, the page title and the active route come
 * from the router, the traffic-light inset is a platform probe, and the theme
 * is the app's `ThemeService` - none of which this layer can or should reach.
 */
@Injectable()
export class ShellStore {
  private readonly db = inject(DbService);

  /** Null until the settings row has been read, and after a failed read. */
  readonly uiLanguage = signal<SupportedLanguage | null>(null);

  /**
   * Filled only by a genuine failure. The shell deliberately says nothing -
   * it keeps its defaults instead - but the failure stops being invisible to
   * anything that does want to look.
   */
  readonly error = signal('');

  /**
   * Rail mode: labels hidden, icons kept. Remembered across sessions in
   * localStorage rather than the settings table - it is a per-machine viewing
   * preference, not user data worth syncing or exporting.
   */
  readonly sidebarCollapsed = signal(
    globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
  );

  /**
   * Never rejects. A failed read leaves `uiLanguage` null, which is what keeps
   * the shell on its defaults - the behaviour it had, and the reason this
   * returns `false` rather than throwing.
   */
  async load(): Promise<boolean> {
    this.error.set('');
    try {
      const settings = await this.db.getSettings();
      this.uiLanguage.set(settings?.uiLanguage ?? null);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
  }
}

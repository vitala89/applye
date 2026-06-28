import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@applye/i18n';

/** Tauri v2 runtime check — false in the browser / during SSR. */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Auto-update flow. Augmentation principle: we only ever *offer* the update —
 * the user decides. Runs once on launch, non-blocking, and is a no-op outside
 * the Tauri runtime.
 */
@Injectable({ providedIn: 'root' })
export class UpdaterService {
  private readonly translate = inject(TranslateService);

  async checkForUpdates(): Promise<void> {
    if (!inTauri()) return;

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update?.available) return;

      const t = this.translate.t();
      const accepted = await this.confirm(
        `${t('updater.body')} (${update.version})`,
        t('updater.title'),
        t('updater.install'),
        t('updater.later'),
      );
      if (!accepted) return;

      await update.downloadAndInstall();

      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      // Never let an updater failure surface to the user or block the app.
      console.error('[updater] check failed', err);
    }
  }

  private async confirm(
    message: string,
    title: string,
    okLabel: string,
    cancelLabel: string,
  ): Promise<boolean> {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(message, { title, kind: 'info', okLabel, cancelLabel });
  }
}

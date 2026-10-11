import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatabaseBackupStore, suggestBackupFilename, ToastService } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ArchiveRestore, Database, LoaderCircle, LucideAngularModule } from 'lucide-angular';

/**
 * Settings → Data: save a SQLite copy, or stage a restore that relaunches.
 *
 * The dialogs stay here. The store never imports a Tauri plugin.
 */
@Component({
  selector: 'app-settings-data-backup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './settings-data-backup.component.html',
  styleUrl: './settings-data-backup.component.scss',
})
export class SettingsDataBackupComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly store = inject(DatabaseBackupStore);
  private readonly toast = inject(ToastService);

  protected readonly icons = {
    backup: Database,
    restore: ArchiveRestore,
    loader: LoaderCircle,
  };

  protected async backup(): Promise<void> {
    if (this.store.backingUp() || this.store.restoring()) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: suggestBackupFilename(),
      filters: [{ name: this.t()('settings.backup_filter'), extensions: ['sqlite', 'db'] }],
    });
    await this.finishBackup(typeof path === 'string' ? path : null);
  }

  protected async restore(): Promise<void> {
    if (this.store.backingUp() || this.store.restoring()) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: this.t()('settings.backup_filter'), extensions: ['sqlite', 'db'] }],
    });
    await this.finishRestore(typeof path === 'string' ? path : null);
  }

  /** `null` is a cancelled dialog and is not a failure. */
  async finishBackup(path: string | null): Promise<void> {
    if (!path) return;
    const ok = await this.store.backup(path);
    if (ok) this.toast.success('settings.backup_created');
    else this.toast.error(this.store.errorKey() ?? 'settings.backup_failed');
  }

  /** `null` is a cancelled dialog. A path only opens the confirm step. */
  async finishRestore(path: string | null): Promise<void> {
    if (!path) return;
    this.store.requestRestore(path);
  }

  async confirmRestore(): Promise<void> {
    const ok = await this.store.confirmRestore();
    if (!ok) {
      const key = this.store.errorKey();
      if (key) this.toast.error(key);
      return;
    }
    try {
      await this.relaunch();
    } catch {
      this.toast.error('settings.restore_restart_failed');
    }
  }

  /** Real process relaunch. A webview reload would keep the old database pool. */
  async relaunch(): Promise<void> {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }
}

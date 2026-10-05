import { Injectable, inject, signal } from '@angular/core';
import { SystemGateway } from '@applye/data';

/** IPC codes from the Rust backup commands, mapped to translation keys. */
const FAILURE_KEYS: Record<string, string> = {
  backup_failed: 'settings.backup_failed',
  restore_invalid: 'settings.restore_invalid',
  restore_corrupt: 'settings.restore_corrupt',
  restore_not_applye: 'settings.restore_not_applye',
  restore_newer: 'settings.restore_newer',
  restore_incompatible: 'settings.restore_incompatible',
  restore_failed: 'settings.restore_failed',
};

/**
 * Backup and restore for the local Applye database.
 *
 * The shell reads a one-shot notice after relaunch, and Settings runs the
 * actions, so this outlives the settings page. It does not open a file dialog:
 * the page picks a path and passes it in.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseBackupStore {
  private readonly system = inject(SystemGateway);

  readonly backingUp = signal(false);
  readonly restoring = signal(false);
  readonly confirmOpen = signal(false);
  /** Translation key for the last failure, or null. */
  readonly errorKey = signal<string | null>(null);

  private sourcePath: string | null = null;

  async backup(path: string): Promise<boolean> {
    if (this.backingUp() || this.restoring()) return false;
    this.backingUp.set(true);
    this.errorKey.set(null);
    try {
      await this.system.backupDatabase(path);
      return true;
    } catch (error) {
      this.errorKey.set(failureKey(error, 'settings.backup_failed'));
      return false;
    } finally {
      this.backingUp.set(false);
    }
  }

  /** Remember the chosen backup and ask the page to confirm before replacing anything. */
  requestRestore(path: string): void {
    if (this.restoring()) return;
    this.sourcePath = path;
    this.errorKey.set(null);
    this.confirmOpen.set(true);
  }

  cancelRestore(): void {
    if (this.restoring()) return;
    this.confirmOpen.set(false);
    this.sourcePath = null;
  }

  /**
   * Validate and stage the chosen file. Returns true only when Applye should
   * relaunch. Cancellation is `cancelRestore`, not a false return from here.
   */
  async confirmRestore(): Promise<boolean> {
    const path = this.sourcePath;
    if (!path || this.restoring() || this.backingUp()) return false;
    this.restoring.set(true);
    this.errorKey.set(null);
    try {
      await this.system.prepareDatabaseRestore(path);
      this.confirmOpen.set(false);
      this.sourcePath = null;
      return true;
    } catch (error) {
      this.errorKey.set(failureKey(error, 'settings.restore_failed'));
      this.confirmOpen.set(false);
      this.sourcePath = null;
      return false;
    } finally {
      this.restoring.set(false);
    }
  }

  /** Read and clear the notice written during startup. Null when there is nothing to say. */
  async consumeNotice(): Promise<string | null> {
    try {
      const notice = await this.system.takeDatabaseRestoreNotice();
      if (notice === 'restored') return 'settings.restored';
      if (notice?.startsWith('failed:')) {
        return failureKey(notice.slice('failed:'.length), 'settings.restore_failed');
      }
      return null;
    } catch {
      return null;
    }
  }
}

export function suggestBackupFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `applye-backup-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.sqlite`;
}

function failureKey(error: unknown, fallback: string): string {
  const code = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return FAILURE_KEYS[code] ?? fallback;
}

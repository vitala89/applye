import { InjectionToken, Injectable, computed, inject, signal } from '@angular/core';

/** Tauri v2 runtime check - false in the browser / during SSR. */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** An update the backend found, reduced to what the UI needs. */
export interface PendingUpdate {
  version: string;
  /** Downloads and installs, then the caller relaunches. */
  install(): Promise<void>;
}

/**
 * The updater plugin, behind a seam.
 *
 * The plugin is loaded by dynamic import and only exists inside Tauri, so a
 * service that called it directly could only ever be tested by not calling it -
 * which is how the last dead code path in this app went unnoticed for a
 * release. Every state below is reachable in a test through a fake backend.
 */
export interface UpdateBackend {
  /** The available update, or `null` when this build is current. */
  check(): Promise<PendingUpdate | null>;
  relaunch(): Promise<void>;
}

/** Raised when the check runs outside Tauri - a browser preview, not a fault. */
export class UpdaterUnavailableError extends Error {
  constructor() {
    super('The updater is only available in the desktop app.');
  }
}

function tauriBackend(): UpdateBackend {
  return {
    async check(): Promise<PendingUpdate | null> {
      if (!inTauri()) throw new UpdaterUnavailableError();
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update?.available) return null;
      return {
        version: update.version,
        install: () => update.downloadAndInstall(),
      };
    },
    async relaunch(): Promise<void> {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}

export const UPDATE_BACKEND = new InjectionToken<UpdateBackend>('UPDATE_BACKEND', {
  providedIn: 'root',
  factory: tauriBackend,
});

/**
 * `idle` before the first check; `unavailable` outside the desktop app.
 * `error` carries the reason, because a check that fails silently is
 * indistinguishable from one that found nothing.
 */
export type UpdateState =
  'idle' | 'checking' | 'current' | 'available' | 'installing' | 'unavailable' | 'error';

/**
 * Whether a newer Applye exists, and installing it on request.
 *
 * Augmentation principle: the app only ever *offers* the update. The check runs
 * once at launch and writes to signals - it raises no dialog, because a modal
 * from the operating system over a window the user just opened interrupts the
 * work they came to do. What the check found is shown where it can be acted on:
 * a badge beside Settings in the shell, and the About block inside it.
 */
@Injectable({ providedIn: 'root' })
export class UpdaterService {
  private readonly backend = inject(UPDATE_BACKEND);

  readonly state = signal<UpdateState>('idle');
  /** The version on offer, set only while an update is pending or installing. */
  readonly newVersion = signal<string | null>(null);
  /** The failure text, verbatim, so the user can act on it or report it. */
  readonly error = signal<string | null>(null);

  /** What the shell badge watches. */
  readonly updateAvailable = computed(
    () => this.state() === 'available' || this.state() === 'installing',
  );

  private pending: PendingUpdate | null = null;

  /** Look for an update. Safe to call repeatedly; concurrent calls are dropped. */
  async check(): Promise<void> {
    if (this.state() === 'checking' || this.state() === 'installing') return;
    this.state.set('checking');
    this.error.set(null);
    try {
      const update = await this.backend.check();
      this.pending = update;
      this.newVersion.set(update?.version ?? null);
      this.state.set(update ? 'available' : 'current');
    } catch (err) {
      this.pending = null;
      this.newVersion.set(null);
      if (err instanceof UpdaterUnavailableError) {
        this.state.set('unavailable');
        return;
      }
      this.state.set('error');
      this.error.set(String(err));
    }
  }

  /**
   * Install the pending update and restart into it. The relaunch ends this
   * process, so nothing after it runs on the happy path.
   */
  async install(): Promise<void> {
    const update = this.pending;
    if (!update || this.state() === 'installing') return;
    this.state.set('installing');
    this.error.set(null);
    try {
      await update.install();
      await this.backend.relaunch();
    } catch (err) {
      // Back to `available`: the update is still there to retry, and the
      // reason is on screen rather than only in the console.
      this.state.set('available');
      this.error.set(String(err));
    }
  }
}

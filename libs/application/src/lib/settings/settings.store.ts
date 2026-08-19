import { Injectable, inject, signal } from '@angular/core';
import type { AiProvider, Settings } from '@applye/core';
import { KeysService, ProfileSettingsGateway } from '@applye/data';

/** Every provider whose key the factory reset has to clear. The keychain lives
 * outside the database, so wiping one does not touch the other. */
const ALL_PROVIDERS: AiProvider[] = ['claude', 'deepseek', 'openai', 'gemini', 'codex'];

/**
 * The settings row itself: what is loaded, what the user has changed but not
 * saved, and the factory reset.
 *
 * **The record is the screen's single copy.** The other four stores read it
 * from here rather than holding their own, because two copies of a settings row
 * can disagree and nothing on screen would say which one the next save writes.
 *
 * **`patch` does not translate, and it does not switch the locale.** Changing
 * `uiLanguage` has a visible side effect the page owns; this store records the
 * value and the page re-applies it. That split is why `TranslateService` is not
 * injected here.
 *
 * **The reset does not reload.** Wiping the database and the keychain is this
 * store's; dropping every component's in-memory state afterwards is a DOM
 * action, and no file under `libs/` touches the window.
 */
@Injectable()
export class SettingsStore {
  private readonly db = inject(ProfileSettingsGateway);
  private readonly keys = inject(KeysService);

  readonly record = signal<Settings | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly confirmingReset = signal(false);
  readonly resetting = signal(false);

  /**
   * Never rejects. Returns the row so the page can act on it - it re-applies
   * the locale and asks whether that provider has a key - without reaching back
   * into the signal and re-deriving what this call already knows.
   */
  async load(): Promise<Settings | null> {
    this.loading.set(true);
    this.error.set('');
    try {
      const s = await this.db.getSettings();
      this.record.set(s);
      return s;
    } catch (e) {
      this.error.set(String(e));
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /** Records one field. Nothing is written until `save`, except through the
   * geo target, which persists on every toggle for its own reasons. */
  patch<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const s = this.record();
    if (s) this.record.set({ ...s, [key]: value });
  }

  async save(): Promise<boolean> {
    this.error.set('');
    const s = this.record();
    if (!s) return false;
    this.saving.set(true);
    try {
      this.record.set(await this.db.updateSettings(s));
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Writes a subset immediately and keeps the record in step, rolling back to
   * exactly what was there if the write fails. Used by the geo target, which
   * auto-saves rather than waiting for the page's Save button.
   *
   * Returns whether it persisted, so a caller can avoid acting on a change the
   * database refused.
   */
  async persist(partial: Partial<Settings>): Promise<boolean> {
    this.error.set('');
    const prev = this.record();
    if (!prev) return false;
    this.record.set({ ...prev, ...partial });
    try {
      await this.db.updateSettings(partial);
      return true;
    } catch (e) {
      this.record.set(prev);
      this.error.set(String(e));
      return false;
    }
  }

  requestReset(confirming: boolean): void {
    this.confirmingReset.set(confirming);
  }

  /**
   * Wipes the database and every provider key, then leaves the page to reload.
   *
   * A provider with no stored key throws, so each delete is swallowed on its
   * own - one miss must not abort the rest and leave a keychain half cleared.
   *
   * On failure the confirmation closes as well as the running flag: the user has
   * been told what went wrong, and leaving an armed "delete everything" dialog
   * open over an error is not a state to hand back.
   */
  async resetAllData(): Promise<boolean> {
    this.error.set('');
    if (this.resetting()) return false;
    this.resetting.set(true);
    try {
      await this.db.resetAllData();
      await Promise.all(
        ALL_PROVIDERS.map((p) => this.keys.deleteProviderKey(p).catch(() => undefined)),
      );
      // Deliberately still `resetting`: the page reloads next, and clearing the
      // flag here would flash the armed dialog back for one frame.
      return true;
    } catch (e) {
      this.error.set(String(e));
      this.resetting.set(false);
      this.confirmingReset.set(false);
      return false;
    }
  }
}

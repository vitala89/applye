import { Injectable, inject, signal } from '@angular/core';
import type { AiProvider } from '@applye/core';
import { KeysService } from '@applye/data';

/**
 * The provider API key, as far as the app is ever allowed to know it.
 *
 * **The keychain is write-only from here.** `stored` is a yes/no answer, never
 * the key; there is no read path, which is why the field on screen stays empty
 * even when a key exists.
 *
 * **`draft` is cleared the moment a save succeeds**, so the typed secret lives
 * in memory for exactly as long as the write takes. It is never logged, never
 * put in the settings row, and never persisted here. A *failed* save keeps it,
 * because making the user retype a long key over a transient keychain error
 * would be its own bug.
 *
 * The provider arrives as an argument rather than being read from a settings
 * store: which key is being changed is the page's question, and passing it
 * makes every call say which provider it meant.
 */
@Injectable()
export class ProviderKeyStore {
  private readonly keys = inject(KeysService);

  readonly draft = signal('');
  readonly stored = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  /** Asks whether this provider has a key. A failed lookup answers "no" rather
   * than leaving the last provider's answer standing - reporting a key that is
   * not there would unlock a Test button that can only fail. */
  async refresh(provider: AiProvider): Promise<boolean> {
    this.error.set('');
    try {
      this.stored.set(await this.keys.hasProviderKey(provider));
      return true;
    } catch (e) {
      this.stored.set(false);
      this.error.set(String(e));
      return false;
    }
  }

  /** `null` when there was nothing to save, or a write already running. */
  async save(provider: AiProvider): Promise<boolean | null> {
    this.error.set('');
    const key = this.draft().trim();
    if (!key || this.busy()) return null;
    this.busy.set(true);
    try {
      await this.keys.setProviderKey(provider, key);
      this.draft.set('');
      this.stored.set(true);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** `null` when a write is already running. */
  async remove(provider: AiProvider): Promise<boolean | null> {
    this.error.set('');
    if (this.busy()) return null;
    this.busy.set(true);
    try {
      await this.keys.deleteProviderKey(provider);
      this.stored.set(false);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

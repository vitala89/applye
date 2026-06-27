import { Injectable } from '@angular/core';
import { AiProvider } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Provider API keys live in the OS keychain (Rust `keyring`). The raw key is
 * write-only from the frontend's perspective — we can store, check, or delete,
 * but never read it back.
 */
@Injectable({ providedIn: 'root' })
export class KeysService {
  setProviderKey(provider: AiProvider, key: string): Promise<void> {
    return tauriInvoke<void>('keys_set_provider_key', { provider, key });
  }

  hasProviderKey(provider: AiProvider): Promise<boolean> {
    return tauriInvoke<boolean>('keys_has_provider_key', { provider });
  }

  deleteProviderKey(provider: AiProvider): Promise<void> {
    return tauriInvoke<void>('keys_delete_provider_key', { provider });
  }
}

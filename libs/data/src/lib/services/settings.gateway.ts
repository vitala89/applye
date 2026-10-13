import { Injectable } from '@angular/core';
import { Settings } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The settings row and the Settings Danger Zone reset.
 *
 * `resetAllData` wipes every user-data table, not only settings. It stays here
 * because its only caller is the settings screen's confirmed reset, and the
 * row it restores is the settings row. It does not move to `SystemGateway`
 * just because the command is destructive. It does not touch OS-keychain API
 * keys; the caller clears those separately.
 */
@Injectable({ providedIn: 'root' })
export class SettingsGateway {
  async getSettings(): Promise<Settings> {
    return tauriInvoke<Settings>('db_get_settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    return tauriInvoke<Settings>('db_update_settings', { settings });
  }

  /**
   * Factory reset - wipe every user-data table and reset settings to defaults
   * (including `onboardingSeen = false`). Destructive and irreversible; the UI
   * gates it behind an explicit confirm. Does NOT touch OS-keychain API keys -
   * the caller clears those separately via KeysService.
   */
  async resetAllData(): Promise<void> {
    return tauriInvoke<void>('db_reset_all_data');
  }
}

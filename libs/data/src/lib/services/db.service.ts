import { Injectable } from '@angular/core';
import { Profile } from '@applye/core';
import { Settings } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * What is left of the original god-service: the profile row and the settings
 * row, and nothing else.
 *
 * **Seven of the eight domains have moved out**; this is the shrinking
 * remainder described in `CODE_QUALITY.md`, not a home. `ProfileSettingsGateway`
 * takes the six methods below and this file is deleted with them.
 */
@Injectable({ providedIn: 'root' })
export class DbService {
  // --- Profile (source of truth) ---
  async getProfile(): Promise<Profile | null> {
    return tauriInvoke<Profile | null>('db_get_profile');
  }

  async upsertProfile(
    profile: Partial<
      Pick<
        Profile,
        'fullMd' | 'scoringJson' | 'scoringHash' | 'pitchMd' | 'pitchHash' | 'targetArchetypes'
      >
    >,
  ): Promise<Profile> {
    return tauriInvoke<Profile>('db_upsert_profile', { profile });
  }

  /** Set (or, with `null`, remove) the reusable profile photo. Separate from
   * `upsertProfile` so an ordinary profile save cannot wipe it. */
  async setProfilePhoto(photoDataUri: string | null): Promise<Profile> {
    return tauriInvoke<Profile>('db_set_profile_photo', { photoDataUri });
  }

  // --- Settings ---
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

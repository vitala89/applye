import { Injectable } from '@angular/core';
import { Profile, Settings } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The profile row and the settings row - the two singletons the whole
 * application reads from, and the factory reset that clears them.
 *
 * **The eighth and last per-domain gateway.** `db.service.ts` is deleted with
 * this move; see `CODE_QUALITY.md` for the migration and `DraftsGateway` for
 * the pattern. Six methods, the fewest of the eight, across the most files -
 * which is why the order was by churn rather than by method count.
 *
 * **`resetAllData` stays here rather than going to `SystemGateway`.** The
 * argument for moving it is its blast radius: it wipes every user-data table,
 * not only these two rows, and `SystemGateway` is where the operations that
 * belong to no feature live. The argument that won is the one this migration
 * has used three times - the consumers decide, not the description. Its only
 * caller is `SettingsStore`, behind the Settings screen's explicit confirm, and
 * the row it resets to defaults is the settings row. The same principle put the
 * score cache in `JobsGateway` against the written domain list, and
 * `checkArchetypeMatch` there against its banner.
 *
 * `hashText` is **not** here, and that is deliberate: a dozen callers across
 * profile, documents, dashboard and jobs read it, so it went to `SystemGateway`
 * rather than making them all inject a domain token. A service needing both
 * injects both, and says so where it injects them.
 */
@Injectable({ providedIn: 'root' })
export class ProfileSettingsGateway {
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

import { Injectable } from '@angular/core';
import { Profile } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The profile row: the markdown source, the scoring projection, and the photo.
 *
 * Settings and factory reset are not here. They live on `SettingsGateway`.
 * `setProfilePhoto` stays separate from `upsertProfile` so an ordinary profile
 * save cannot wipe the photo.
 */
@Injectable({ providedIn: 'root' })
export class ProfileGateway {
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
}

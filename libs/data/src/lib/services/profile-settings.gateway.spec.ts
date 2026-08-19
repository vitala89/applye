import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { ProfileSettingsGateway } from './profile-settings.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * Pins the command strings and argument shapes, the one thing this move could
 * break that nothing else would see - every consumer stubs the gateway, so a
 * method invoking the wrong Rust command leaves the suite green and fails only
 * in the running app. `drafts.gateway.spec.ts` is the shape being copied.
 *
 * This domain's trap is that **three of its six methods write** and two of the
 * three writes are partial:
 *
 * - `upsertProfile` and `updateSettings` each send a `Partial<>` under a key
 *   named for the row - `profile` and `settings`. Swapping the keys sends an
 *   object Rust will not bind, and the two call sites look identical.
 * - `setProfilePhoto` is deliberately **not** part of `upsertProfile`, so an
 *   ordinary profile save cannot wipe the photo. It sends `photoDataUri`, and
 *   `null` is a meaningful value there - it removes the photo - so the argument
 *   must be sent rather than omitted.
 * - `resetAllData` takes no argument and wipes every user-data table. A
 *   copy-paste that pointed it at `db_update_settings` would silently do
 *   nothing; one that pointed another method at `db_reset_all_data` would
 *   destroy the user's data. It is the only irreversible command in this file
 *   and the distinct-command test is what stands between it and the other five.
 *
 * `tauriInvoke` refuses to dispatch outside Tauri, so `__TAURI_INTERNALS__` is
 * set to satisfy that guard - the check being made here is about what is sent,
 * not about the guard.
 */
describe('ProfileSettingsGateway', () => {
  let gateway: ProfileSettingsGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [ProfileSettingsGateway] });
    gateway = TestBed.inject(ProfileSettingsGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('reads the profile row with no arguments', async () => {
    await gateway.getProfile();
    expect(invoke).toHaveBeenCalledWith('db_get_profile', undefined);
  });

  it('writes a partial profile under the `profile` key', async () => {
    const profile = { fullMd: '# me', scoringHash: 'h' };
    await gateway.upsertProfile(profile);
    expect(invoke).toHaveBeenCalledWith('db_upsert_profile', { profile });
  });

  it('sets the photo through its own command, and sends `null` rather than omitting it', async () => {
    // `null` removes the photo, so an argument that is dropped when falsy would
    // turn "remove" into "do nothing".
    await gateway.setProfilePhoto('data:image/png;base64,x');
    expect(invoke).toHaveBeenCalledWith('db_set_profile_photo', {
      photoDataUri: 'data:image/png;base64,x',
    });
    await gateway.setProfilePhoto(null);
    expect(invoke).toHaveBeenCalledWith('db_set_profile_photo', { photoDataUri: null });
  });

  it('reads the settings row with no arguments', async () => {
    await gateway.getSettings();
    expect(invoke).toHaveBeenCalledWith('db_get_settings', undefined);
  });

  it('writes partial settings under the `settings` key', async () => {
    const settings = { uiLanguage: 'en' };
    await gateway.updateSettings(settings as never);
    expect(invoke).toHaveBeenCalledWith('db_update_settings', { settings });
  });

  it('resets all data through its own command and sends nothing with it', async () => {
    // The only irreversible command in this file. An argument here would mean
    // it had been copied from one of the writes.
    await gateway.resetAllData();
    expect(invoke).toHaveBeenCalledWith('db_reset_all_data', undefined);
  });

  it('sends six distinct commands, one per method', async () => {
    // Counted rather than listed: the failure this catches is two methods
    // sharing a string after a copy-paste, which each test above would pass -
    // and one of these six wipes the database.
    await gateway.getProfile();
    await gateway.upsertProfile({});
    await gateway.setProfilePhoto(null);
    await gateway.getSettings();
    await gateway.updateSettings({});
    await gateway.resetAllData();
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands).toHaveLength(6);
    expect(new Set(commands).size).toBe(6);
  });

  it('is the last gateway: no method reaches a command outside the profile and settings rows', async () => {
    // `db.service.ts` is gone, so this file is the whole surface of its domain.
    // A method added here that invokes another domain's command would be the
    // god-service growing back one wrapper at a time.
    await gateway.getProfile();
    await gateway.upsertProfile({});
    await gateway.setProfilePhoto(null);
    await gateway.getSettings();
    await gateway.updateSettings({});
    await gateway.resetAllData();
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string).sort();
    expect(commands).toEqual([
      'db_get_profile',
      'db_get_settings',
      'db_reset_all_data',
      'db_set_profile_photo',
      'db_update_settings',
      'db_upsert_profile',
    ]);
  });
});

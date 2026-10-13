import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { ProfileGateway } from './profile.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * Pins the profile command strings. `upsertProfile` sends a partial under
 * `profile`. `setProfilePhoto` is a separate command, and `null` removes the
 * photo, so the argument must be sent rather than omitted.
 */
describe('ProfileGateway', () => {
  let gateway: ProfileGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [ProfileGateway] });
    gateway = TestBed.inject(ProfileGateway);
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
    await gateway.setProfilePhoto('data:image/png;base64,x');
    expect(invoke).toHaveBeenCalledWith('db_set_profile_photo', {
      photoDataUri: 'data:image/png;base64,x',
    });
    await gateway.setProfilePhoto(null);
    expect(invoke).toHaveBeenCalledWith('db_set_profile_photo', { photoDataUri: null });
  });

  it('sends three distinct commands, one per method', async () => {
    await gateway.getProfile();
    await gateway.upsertProfile({});
    await gateway.setProfilePhoto(null);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands).toEqual(['db_get_profile', 'db_upsert_profile', 'db_set_profile_photo']);
  });
});

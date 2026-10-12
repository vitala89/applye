import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { SettingsGateway } from './settings.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * Pins the settings command strings. `updateSettings` sends a partial under
 * `settings`. `resetAllData` takes no argument and wipes every user-data
 * table. It stays on this gateway because the Settings Danger Zone is the
 * use case, and it must not share a command string with `updateSettings`.
 */
describe('SettingsGateway', () => {
  let gateway: SettingsGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [SettingsGateway] });
    gateway = TestBed.inject(SettingsGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
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
    await gateway.resetAllData();
    expect(invoke).toHaveBeenCalledWith('db_reset_all_data', undefined);
  });

  it('sends three distinct commands, one per method', async () => {
    await gateway.getSettings();
    await gateway.updateSettings({});
    await gateway.resetAllData();
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands).toEqual(['db_get_settings', 'db_update_settings', 'db_reset_all_data']);
  });
});

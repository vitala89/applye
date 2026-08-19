import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { SystemGateway } from './system.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * The command strings and argument shapes, for the reason `drafts.gateway.spec.ts`
 * states: every consumer stubs the gateway, so a method invoking the wrong Rust
 * command leaves the whole suite green and fails only in the running app.
 *
 * **`hashText` is the one to guard hardest.** Twelve callers key an AI cache on
 * it, so a wrong command name here would not throw at a call site anyone is
 * looking at - every cache would simply miss forever, and the only symptom
 * would be a provider bill.
 *
 * `openFile` and `revealInFolder` both take a single `path` and differ only by
 * command, which is the same one-argument-two-meanings trap `InterviewGateway`
 * has with its ids.
 */
describe('SystemGateway', () => {
  let gateway: SystemGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [SystemGateway] });
    gateway = TestBed.inject(SystemGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('hashes text under hash_text', async () => {
    await gateway.hashText('abc');
    expect(invoke).toHaveBeenCalledWith('hash_text', { text: 'abc' });
  });

  it('opens a file and reveals a folder with the same argument but different commands', async () => {
    await gateway.openFile('/tmp/a.pdf');
    expect(invoke).toHaveBeenCalledWith('open_file', { path: '/tmp/a.pdf' });
    await gateway.revealInFolder('/tmp/a.pdf');
    expect(invoke).toHaveBeenCalledWith('reveal_in_folder', { path: '/tmp/a.pdf' });
  });

  it('reads, previews and confirms an import', async () => {
    await gateway.importReadFile('/tmp/rows.csv');
    expect(invoke).toHaveBeenCalledWith('import_read_file', { path: '/tmp/rows.csv' });
    const rows = [{ company: 'Acme' }];
    await gateway.importPreview(rows as never);
    expect(invoke).toHaveBeenCalledWith('import_preview', { rows });
    await gateway.importConfirm(rows as never, 'csv', 7);
    expect(invoke).toHaveBeenCalledWith('import_confirm', {
      rows,
      importedFrom: 'csv',
      followupDaysAfterApply: 7,
    });
  });

  it('runs the health check with no arguments', async () => {
    await gateway.healthCheck();
    expect(invoke).toHaveBeenCalledWith('health_check', undefined);
  });

  it('sends seven distinct commands, one per method', async () => {
    await gateway.hashText('a');
    await gateway.openFile('a');
    await gateway.revealInFolder('a');
    await gateway.importReadFile('a');
    await gateway.importPreview([] as never);
    await gateway.importConfirm([] as never, 'csv', 1);
    await gateway.healthCheck();
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(new Set(commands).size).toBe(7);
  });
});

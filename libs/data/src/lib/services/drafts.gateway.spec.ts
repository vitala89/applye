import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { DraftsGateway } from './drafts.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * What this asserts is the one thing the move could break and nothing else
 * could see: **the command string and the argument shape**.
 *
 * Every consumer stubs the gateway, so a method that invoked
 * `portal_answers_get` where it meant `tailoring_cache_get` would leave all
 * 1642 application tests green and fail only in the running app - and the Rust
 * side would simply not find a command by that name. The strings were equally
 * unverified while they lived on `DbService`, the god-service this migration
 * replaced; this is the seam the other seven gateway extractions copied rather
 * than a gap this one opened.
 *
 * `tauriInvoke` refuses to dispatch outside Tauri, so `__TAURI_INTERNALS__` is
 * set to satisfy that guard - the check being made here is about what is sent,
 * not about the guard.
 */
describe('DraftsGateway', () => {
  let gateway: DraftsGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [DraftsGateway] });
    gateway = TestBed.inject(DraftsGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('reads a tailoring pass by job, pass number and input hash', async () => {
    await gateway.tailoringCacheGet(7, 2, 'h');
    expect(invoke).toHaveBeenCalledWith('tailoring_cache_get', {
      jobId: 7,
      pass: 2,
      inputHash: 'h',
    });
  });

  it('saves a tailoring pass under one input key', async () => {
    const input = { jobId: 7, pass: 2, inputHash: 'h', resultMd: 'x' };
    await gateway.tailoringCacheSave(input as never);
    expect(invoke).toHaveBeenCalledWith('tailoring_cache_save', { input });
  });

  it('reads portal answers by job, profile hash and input hash', async () => {
    await gateway.portalAnswersGet(3, 'p', 'i');
    expect(invoke).toHaveBeenCalledWith('portal_answers_get', {
      jobId: 3,
      profileHash: 'p',
      inputHash: 'i',
    });
  });

  it('saves portal answers under one input key', async () => {
    const input = { jobId: 3, inputHash: 'i', answersJson: '[]' };
    await gateway.portalAnswersSave(input as never);
    expect(invoke).toHaveBeenCalledWith('portal_answers_save', { input });
  });

  it('reads a follow-up draft by application, not by job', async () => {
    // The one asymmetry in this gateway: the other two are keyed on a job and
    // this is keyed on an application. Swapping the argument name would still
    // type-check, because both are numbers.
    await gateway.followupDraftGet(11, 'i');
    expect(invoke).toHaveBeenCalledWith('followup_draft_get', {
      applicationId: 11,
      inputHash: 'i',
    });
  });

  it('saves a follow-up draft under one input key', async () => {
    const input = { applicationId: 11, inputHash: 'i', subject: 's', body: 'b' };
    await gateway.followupDraftSave(input as never);
    expect(invoke).toHaveBeenCalledWith('followup_draft_save', { input });
  });

  it('sends six distinct commands, one per method', async () => {
    // Counted rather than listed: the failure this catches is two methods
    // sharing a string after a copy-paste, which each test above would pass.
    await gateway.tailoringCacheGet(1, 1, 'a');
    await gateway.tailoringCacheSave({} as never);
    await gateway.portalAnswersGet(1, 'a', 'b');
    await gateway.portalAnswersSave({} as never);
    await gateway.followupDraftGet(1, 'a');
    await gateway.followupDraftSave({} as never);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(new Set(commands).size).toBe(6);
  });
});

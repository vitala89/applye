import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { InterviewGateway } from './interview.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * The command strings and argument shapes, for the reason `drafts.gateway.spec.ts`
 * states: every consumer stubs the gateway, so a method invoking the wrong Rust
 * command leaves the whole suite green and fails only in the running app.
 *
 * The trap specific to this gateway is that **three different id kinds are all
 * numbers**: a stage id, an application id and (in the prep methods) a stage id
 * again. `deleteInterviewStage(stageId)` and `listInterviewStages(applicationId)`
 * would both type-check with the other's argument name, and the Rust side would
 * simply look up the wrong row.
 */
describe('InterviewGateway', () => {
  let gateway: InterviewGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [InterviewGateway] });
    gateway = TestBed.inject(InterviewGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('creates and updates a stage under one input key', async () => {
    const input = { applicationId: 1, stageOrder: 1, stageType: 'hr_screen' };
    await gateway.createInterviewStage(input as never);
    expect(invoke).toHaveBeenCalledWith('create_interview_stage', { input });
    await gateway.updateInterviewStage(input as never);
    expect(invoke).toHaveBeenCalledWith('update_interview_stage', { input });
  });

  it('deletes a stage by stage id, not by application id', async () => {
    await gateway.deleteInterviewStage(42);
    expect(invoke).toHaveBeenCalledWith('delete_interview_stage', { stageId: 42 });
  });

  it('lists stages by application id, not by stage id', async () => {
    // The mirror of the test above. Both take one number, and swapping the
    // argument name type-checks - it reads the wrong row instead of failing.
    await gateway.listInterviewStages(42);
    expect(invoke).toHaveBeenCalledWith('list_interview_stages', { applicationId: 42 });
  });

  it('reads prep by stage id and saves a batch under one input key', async () => {
    await gateway.listInterviewPrep(7);
    expect(invoke).toHaveBeenCalledWith('list_interview_prep', { stageId: 7 });
    const input = { stageId: 7, items: [] };
    await gateway.saveInterviewPrepBatch(input as never);
    expect(invoke).toHaveBeenCalledWith('save_interview_prep_batch', { input });
  });

  it('sends six distinct commands, one per method', async () => {
    await gateway.createInterviewStage({} as never);
    await gateway.updateInterviewStage({} as never);
    await gateway.deleteInterviewStage(1);
    await gateway.listInterviewPrep(1);
    await gateway.saveInterviewPrepBatch({} as never);
    await gateway.listInterviewStages(1);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(new Set(commands).size).toBe(6);
  });
});

import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { ApplicationsGateway } from './applications.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * Pins the command strings and argument shapes. Application tests stub this
 * gateway, so a method invoking the wrong Rust command leaves the suite green
 * and fails only in the running app.
 *
 * - `set_application_priority`, `add_application_comment`, and
 *   `list_application_comments` carry no `db_` prefix.
 * - `setApplicationStatus` sends `id`. `setApplicationPriority` sends
 *   `applicationId`. Both take an application's primary key.
 * - `upsertApplication` sends `{ application }`.
 * - `listPipelineCards` invokes `db_pipeline_cards` and `getAnalyticsFacts`
 *   invokes `db_analytics_facts`.
 */
describe('ApplicationsGateway', () => {
  let gateway: ApplicationsGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [ApplicationsGateway] });
    gateway = TestBed.inject(ApplicationsGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('lists applications, pipeline cards and analytics facts under three unrelated commands', async () => {
    await gateway.listApplications();
    expect(invoke).toHaveBeenCalledWith('db_list_applications', undefined);
    await gateway.listPipelineCards();
    expect(invoke).toHaveBeenCalledWith('db_pipeline_cards', undefined);
    await gateway.getAnalyticsFacts();
    expect(invoke).toHaveBeenCalledWith('db_analytics_facts', undefined);
  });

  it('upserts an application under the `application` key', async () => {
    const application = { jobId: 7, status: 'applied' };
    await gateway.upsertApplication(application as never);
    expect(invoke).toHaveBeenCalledWith('db_upsert_application', { application });
  });

  it('sends `id` for a status change but `applicationId` for a priority change', async () => {
    await gateway.setApplicationStatus(3, 'applied' as never);
    expect(invoke).toHaveBeenCalledWith('db_set_application_status', { id: 3, status: 'applied' });
    await gateway.setApplicationPriority(3, 'high' as never);
    expect(invoke).toHaveBeenCalledWith('set_application_priority', {
      applicationId: 3,
      priority: 'high',
    });
  });

  it('adds and lists application comments by application id', async () => {
    await gateway.addApplicationComment(3, 'hi');
    expect(invoke).toHaveBeenCalledWith('add_application_comment', {
      applicationId: 3,
      commentText: 'hi',
    });
    await gateway.listApplicationComments(3);
    expect(invoke).toHaveBeenCalledWith('list_application_comments', { applicationId: 3 });
  });

  it('sends eight distinct commands, one per method', async () => {
    await gateway.listApplications();
    await gateway.listPipelineCards();
    await gateway.getAnalyticsFacts();
    await gateway.upsertApplication({} as never);
    await gateway.setApplicationStatus(1, 'applied' as never);
    await gateway.setApplicationPriority(1, 'high' as never);
    await gateway.addApplicationComment(1, 'c');
    await gateway.listApplicationComments(1);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands).toHaveLength(8);
    expect(new Set(commands).size).toBe(8);
  });

  it('prefixes only five of the eight commands with `db_`', async () => {
    await gateway.setApplicationPriority(1, 'high' as never);
    await gateway.addApplicationComment(1, 'c');
    await gateway.listApplicationComments(1);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands.filter((c) => c.startsWith('db_'))).toEqual([]);
    expect(commands).toEqual([
      'set_application_priority',
      'add_application_comment',
      'list_application_comments',
    ]);
  });
});

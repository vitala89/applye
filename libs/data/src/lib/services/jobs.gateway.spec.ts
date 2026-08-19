import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { JobsGateway } from './jobs.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * Pins the command strings and argument shapes, the one thing this move could
 * break that nothing else would see - every consumer stubs the gateway, so a
 * method invoking the wrong Rust command leaves the suite green and fails only
 * in the running app. `drafts.gateway.spec.ts` is the shape being copied.
 *
 * This domain's traps, each with its own test below:
 *
 * - **Six of the eighteen commands carry no `db_` prefix** - the three
 *   `score_cache_*`, `check_archetype_match`, `set_application_priority`,
 *   `add_application_comment` and `list_application_comments`. Copying a
 *   neighbouring method and keeping its prefix is the failure mode.
 * - **The two sibling setters disagree about their first argument name.**
 *   `setApplicationStatus` sends `id`; `setApplicationPriority` sends
 *   `applicationId`. Both take an application's primary key.
 * - **Three different wrapper keys.** `upsertJob` sends `{ job }`,
 *   `upsertApplication` sends `{ application }`, and both `scoreCacheSave` and
 *   `updateApplicationTrackerFields` send `{ input }`.
 * - **Two projections break the `db_list_*` naming of their neighbours**:
 *   `listPipelineCards` invokes `db_pipeline_cards` and `getAnalyticsFacts`
 *   invokes `db_analytics_facts`.
 *
 * `tauriInvoke` refuses to dispatch outside Tauri, so `__TAURI_INTERNALS__` is
 * set to satisfy that guard - the check being made here is about what is sent,
 * not about the guard.
 */
describe('JobsGateway', () => {
  let gateway: JobsGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [JobsGateway] });
    gateway = TestBed.inject(JobsGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('lists jobs and the jobs overview through two different commands', async () => {
    await gateway.listJobs();
    expect(invoke).toHaveBeenCalledWith('db_list_jobs', undefined);
    await gateway.listJobsOverview();
    expect(invoke).toHaveBeenCalledWith('db_list_jobs_overview', undefined);
  });

  it('upserts a job under the `job` key', async () => {
    const job = { title: 'Dev', jdText: 'text' };
    await gateway.upsertJob(job as never);
    expect(invoke).toHaveBeenCalledWith('db_upsert_job', { job });
  });

  it('reads and deletes a job by id', async () => {
    await gateway.getJob(7);
    expect(invoke).toHaveBeenCalledWith('db_get_job', { id: 7 });
    await gateway.deleteJob(7);
    expect(invoke).toHaveBeenCalledWith('db_delete_job', { id: 7 });
  });

  it('screens a job against the archetypes it is handed, not against a stored profile', async () => {
    await gateway.checkArchetypeMatch('Dev', 'jd', '["a"]');
    expect(invoke).toHaveBeenCalledWith('check_archetype_match', {
      title: 'Dev',
      jdText: 'jd',
      archetypesJson: '["a"]',
    });
  });

  it('reads a cached score by job and profile hash, and the latest by job alone', async () => {
    await gateway.scoreCacheGet(7, 'h');
    expect(invoke).toHaveBeenCalledWith('score_cache_get', { jobId: 7, profileHash: 'h' });
    await gateway.scoreCacheLatest(7);
    expect(invoke).toHaveBeenCalledWith('score_cache_latest', { jobId: 7 });
  });

  it('saves a score under one input key', async () => {
    const input = { jobId: 7, profileHash: 'h', score: 80 };
    await gateway.scoreCacheSave(input as never);
    expect(invoke).toHaveBeenCalledWith('score_cache_save', { input });
  });

  it('lists applications, pipeline cards and analytics facts under three unrelated commands', async () => {
    // `db_pipeline_cards` and `db_analytics_facts` deliberately do not follow
    // the `db_list_*` naming of the method next to them.
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
    // The two setters take the same primary key under different names; a
    // copy-paste between them sends an argument Rust will not bind.
    await gateway.setApplicationStatus(3, 'applied' as never);
    expect(invoke).toHaveBeenCalledWith('db_set_application_status', { id: 3, status: 'applied' });
    await gateway.setApplicationPriority(3, 'high' as never);
    expect(invoke).toHaveBeenCalledWith('set_application_priority', {
      applicationId: 3,
      priority: 'high',
    });
  });

  it('patches tracker fields under one input key', async () => {
    const input = { applicationId: 3, notes: 'n' };
    await gateway.updateApplicationTrackerFields(input as never);
    expect(invoke).toHaveBeenCalledWith('db_update_application_tracker_fields', { input });
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

  it('sends eighteen distinct commands, one per method', async () => {
    // Counted rather than listed: the failure this catches is two methods
    // sharing a string after a copy-paste, which each test above would pass.
    await gateway.listJobs();
    await gateway.upsertJob({} as never);
    await gateway.listJobsOverview();
    await gateway.getJob(1);
    await gateway.checkArchetypeMatch('t', 'jd', undefined);
    await gateway.deleteJob(1);
    await gateway.scoreCacheGet(1, 'h');
    await gateway.scoreCacheLatest(1);
    await gateway.scoreCacheSave({} as never);
    await gateway.listApplications();
    await gateway.listPipelineCards();
    await gateway.getAnalyticsFacts();
    await gateway.upsertApplication({} as never);
    await gateway.setApplicationStatus(1, 'applied' as never);
    await gateway.updateApplicationTrackerFields({} as never);
    await gateway.setApplicationPriority(1, 'high' as never);
    await gateway.addApplicationComment(1, 'c');
    await gateway.listApplicationComments(1);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands).toHaveLength(18);
    expect(new Set(commands).size).toBe(18);
  });

  it('prefixes only twelve of the eighteen commands with `db_`', async () => {
    // The six that do not are the exact set a "make it consistent" edit would
    // break: Rust registers them under these names and no others.
    await gateway.checkArchetypeMatch('t', 'jd', undefined);
    await gateway.scoreCacheGet(1, 'h');
    await gateway.scoreCacheLatest(1);
    await gateway.scoreCacheSave({} as never);
    await gateway.setApplicationPriority(1, 'high' as never);
    await gateway.addApplicationComment(1, 'c');
    await gateway.listApplicationComments(1);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands.filter((c) => c.startsWith('db_'))).toEqual([]);
  });
});

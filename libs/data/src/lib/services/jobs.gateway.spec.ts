import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { JobsGateway } from './jobs.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * Pins the command strings and argument shapes. Application tests stub this
 * gateway, so a method invoking the wrong Rust command leaves the suite green
 * and fails only in the running app.
 *
 * `check_archetype_match` and the three `score_cache_*` commands carry no
 * `db_` prefix. `upsertJob` sends `{ job }`. `scoreCacheSave` sends `{ input }`.
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

  it('sends nine distinct commands, one per method', async () => {
    await gateway.listJobs();
    await gateway.upsertJob({} as never);
    await gateway.listJobsOverview();
    await gateway.getJob(1);
    await gateway.checkArchetypeMatch('t', 'jd', undefined);
    await gateway.deleteJob(1);
    await gateway.scoreCacheGet(1, 'h');
    await gateway.scoreCacheLatest(1);
    await gateway.scoreCacheSave({} as never);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands).toHaveLength(9);
    expect(new Set(commands).size).toBe(9);
  });

  it('prefixes only five of the nine commands with `db_`', async () => {
    await gateway.checkArchetypeMatch('t', 'jd', undefined);
    await gateway.scoreCacheGet(1, 'h');
    await gateway.scoreCacheLatest(1);
    await gateway.scoreCacheSave({} as never);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(commands.filter((c) => c.startsWith('db_'))).toEqual([]);
    expect(commands).toEqual([
      'check_archetype_match',
      'score_cache_get',
      'score_cache_latest',
      'score_cache_save',
    ]);
  });
});

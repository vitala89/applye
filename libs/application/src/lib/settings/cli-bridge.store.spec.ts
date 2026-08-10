import { TestBed } from '@angular/core/testing';
import type { Settings } from '@applye/core';
import { AiService, type CliStatus } from '@applye/data';
import { CliBridgeStore } from './cli-bridge.store';
import { CLI_MODEL_CUSTOM } from './cli-models';

const STATUSES = [
  { provider: 'claude', label: 'Claude Code', command: 'claude', installed: true, working: true },
  { provider: 'openai', label: 'Codex CLI', command: 'codex', installed: true, working: false },
] as CliStatus[];

function createStore(over: Record<string, jest.Mock> = {}) {
  const ai = {
    probeClis: jest.fn().mockResolvedValue(STATUSES),
    installCli: jest.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [CliBridgeStore, { provide: AiService, useValue: ai }],
  });
  return { store: TestBed.inject(CliBridgeStore), ai };
}

describe('CliBridgeStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('probing', () => {
    it('records what was found', async () => {
      const { store } = createStore();

      await store.probe();

      expect(store.statuses()).toEqual(STATUSES);
      expect(store.probing()).toBe(false);
    });

    /** Outside a Tauri runtime the command does not exist at all. An empty list
     * reads correctly as "none found" rather than breaking the screen. */
    it('reads as none found when the probe is unavailable, without an error', async () => {
      const { store } = createStore({
        probeClis: jest.fn().mockRejectedValue(new Error('no cmd')),
      });

      await store.probe();

      expect(store.statuses()).toEqual([]);
      expect(store.error()).toBe('');
      expect(store.probing()).toBe(false);
    });
  });

  describe('whether a CLI can actually be used', () => {
    /** Present on the path is not enough: a broken npm wrapper is present and
     * still fails on the first call. */
    it('only counts a CLI that runs', async () => {
      const { store } = createStore();
      await store.probe();

      expect(store.works('claude')).toBe(true);
      expect(store.works('openai')).toBe(false);
      expect(store.works(undefined)).toBe(false);
    });
  });

  describe('installing', () => {
    it('re-probes after a successful install', async () => {
      const { store, ai } = createStore();

      expect(await store.install('openai')).toBe('installed');
      expect(ai.installCli).toHaveBeenCalledWith('openai');
      expect(ai.probeClis).toHaveBeenCalled();
      expect(store.installing()).toBeNull();
    });

    /** npm answering "no" is a message worth showing verbatim; the call
     * throwing is a different problem. Collapsing them would hide whichever the
     * page chose not to print. */
    it('keeps a refusal apart from a failure', async () => {
      const refused = createStore({
        installCli: jest.fn().mockResolvedValue({ ok: false, message: 'EACCES' }),
      });
      expect(await refused.store.install('openai')).toBe('refused');
      expect(refused.store.error()).toBe('EACCES');
      expect(refused.ai.probeClis).not.toHaveBeenCalled();

      const failed = createStore({ installCli: jest.fn().mockRejectedValue(new Error('spawn')) });
      expect(await failed.store.install('openai')).toBe('failed');
      expect(failed.store.error()).toContain('spawn');
    });

    it('refuses a second install and clears what the last failure said', async () => {
      const { store, ai } = createStore();
      store.error.set('an older failure');
      store.installing.set('claude');

      expect(await store.install('openai')).toBe('busy');
      expect(store.error()).toBe('');
      expect(ai.installCli).not.toHaveBeenCalled();
    });
  });

  describe('model names', () => {
    it('offers the known names for a CLI, and none for one it does not know', () => {
      const { store } = createStore();

      expect(store.models('claude')).toEqual(['sonnet', 'opus', 'haiku']);
      expect(store.models('deepseek')).toEqual([]);
      expect(store.models(undefined)).toEqual([]);
    });

    it('shows a known name as itself and a hand-typed one as custom', () => {
      const { store } = createStore();

      expect(store.selectValue('sonnet', 'claude')).toBe('sonnet');
      expect(store.selectValue('my-model', 'claude')).toBe(CLI_MODEL_CUSTOM);
      expect(store.selectValue('', 'claude')).toBe('');
    });

    /** A settings row written before the picker existed - or by hand - still
     * has to show up, with its free-text field already open. */
    it('opens the free-text field for a stored name the CLI does not publish', () => {
      const { store } = createStore();

      store.syncCustomFlags({
        provider: 'claude',
        defaultModel: 'my-model',
        economyModel: 'haiku',
      } as Settings);

      expect(store.customModel()).toEqual({ defaultModel: true, economyModel: false });
    });

    it('treats an empty stored model as not custom', () => {
      const { store } = createStore();

      store.syncCustomFlags({ provider: 'claude', defaultModel: '', economyModel: '' } as Settings);

      expect(store.customModel()).toEqual({ defaultModel: false, economyModel: false });
    });

    /** Writing the sentinel would put `__custom__` in the settings row and send
     * it to the CLI verbatim. */
    it('answers null for the custom choice so nothing is stored yet', () => {
      const { store } = createStore();

      expect(store.chooseModel('defaultModel', CLI_MODEL_CUSTOM)).toBeNull();
      expect(store.customModel().defaultModel).toBe(true);

      expect(store.chooseModel('defaultModel', 'opus')).toBe('opus');
      expect(store.customModel().defaultModel).toBe(false);
    });

    it('changes only the field it was asked about', () => {
      const { store } = createStore();

      store.chooseModel('economyModel', CLI_MODEL_CUSTOM);

      expect(store.customModel()).toEqual({ defaultModel: false, economyModel: true });
    });
  });
});

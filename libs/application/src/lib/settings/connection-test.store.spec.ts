import { TestBed } from '@angular/core/testing';
import type { Settings } from '@applye/core';
import { AiService } from '@applye/data';
import { ConnectionTestStore } from './connection-test.store';

const ROW = {
  aiMode: 'api',
  provider: 'claude',
  defaultModel: 'big',
  economyModel: 'small',
  defaultDocLanguage: 'de',
} as Settings;

function createStore(over: Record<string, jest.Mock> = {}) {
  const ai = {
    renderSkill: jest.fn().mockResolvedValue({ systemPrompt: 's', userPrompt: 'u' }),
    run: jest
      .fn()
      .mockResolvedValue({ text: 'OK', tokensInput: 10, tokensOutput: 2, cachedTokens: 1 }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [ConnectionTestStore, { provide: AiService, useValue: ai }],
  });
  return { store: TestBed.inject(ConnectionTestStore), ai };
}

describe('ConnectionTestStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('records the reply and what it cost', async () => {
    const { store } = createStore();

    expect(await store.run(ROW)).toBe(true);

    expect(store.reply()).toBe('OK');
    expect(store.tokens()).toEqual({ in: 10, out: 2, cached: 1 });
    expect(store.testing()).toBe(false);
  });

  it('sends the economy model by default and the quality one on request', async () => {
    const { store, ai } = createStore();

    await store.run(ROW);
    expect(ai.run).toHaveBeenCalledWith(expect.objectContaining({ model: 'small' }));

    store.tier.set('quality');
    await store.run(ROW);
    expect(ai.run).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'big' }));
  });

  it('sends the row it was given, not one it read', async () => {
    const { store, ai } = createStore();

    await store.run(ROW);

    expect(ai.run).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'api', provider: 'claude', language: 'de' }),
    );
  });

  /** A previous reply on screen during a new run would read as this run's
   * answer. */
  it('clears the last reply before running again', async () => {
    const { store } = createStore({
      run: jest.fn().mockRejectedValue(new Error('401')),
    });
    store.reply.set('OK');
    store.tokens.set({ in: 1, out: 1, cached: 0 });

    expect(await store.run(ROW)).toBe(false);

    expect(store.reply()).toBeNull();
    expect(store.tokens()).toBeNull();
    expect(store.error()).toContain('401');
  });

  it('refuses a second run and clears what the last failure said', async () => {
    const { store, ai } = createStore();
    store.error.set('an older failure');
    store.testing.set(true);

    expect(await store.run(ROW)).toBeNull();

    expect(store.error()).toBe('');
    expect(ai.run).not.toHaveBeenCalled();
  });
});

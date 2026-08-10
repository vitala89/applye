import { TestBed } from '@angular/core/testing';
import { KeysService } from '@applye/data';
import { ProviderKeyStore } from './provider-key.store';

function createStore(over: Record<string, jest.Mock> = {}) {
  const keys = {
    hasProviderKey: jest.fn().mockResolvedValue(true),
    setProviderKey: jest.fn().mockResolvedValue(undefined),
    deleteProviderKey: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [ProviderKeyStore, { provide: KeysService, useValue: keys }],
  });
  return { store: TestBed.inject(ProviderKeyStore), keys };
}

describe('ProviderKeyStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('asking whether a key exists', () => {
    it('answers for the provider it was given', async () => {
      const { store, keys } = createStore();

      expect(await store.refresh('deepseek')).toBe(true);
      expect(keys.hasProviderKey).toHaveBeenCalledWith('deepseek');
      expect(store.stored()).toBe(true);
    });

    /** Reporting a key that is not there would unlock a Test button that can
     * only fail, so a failed lookup answers "no" rather than leaving the
     * previous provider's answer standing. */
    it('falls back to no on a failed lookup', async () => {
      const { store } = createStore({
        hasProviderKey: jest.fn().mockRejectedValue(new Error('keychain locked')),
      });
      store.stored.set(true);

      expect(await store.refresh('claude')).toBe(false);
      expect(store.stored()).toBe(false);
      expect(store.error()).toContain('keychain locked');
    });
  });

  describe('saving', () => {
    it('writes the trimmed key and clears the draft', async () => {
      const { store, keys } = createStore();
      store.draft.set('  sk-ant-abc  ');

      expect(await store.save('claude')).toBe(true);

      expect(keys.setProviderKey).toHaveBeenCalledWith('claude', 'sk-ant-abc');
      expect(store.draft()).toBe('');
      expect(store.stored()).toBe(true);
      expect(store.busy()).toBe(false);
    });

    it('refuses an empty or whitespace-only draft, and says nothing', async () => {
      const { store, keys } = createStore();
      store.error.set('an older failure');
      store.draft.set('   ');

      expect(await store.save('claude')).toBeNull();

      expect(keys.setProviderKey).not.toHaveBeenCalled();
      expect(store.error()).toBe('');
    });

    /** Making the user retype a long key over a transient keychain error would
     * be its own bug, so a failure keeps what they typed. */
    it('keeps the draft when the write fails, and does not claim a key is stored', async () => {
      const { store } = createStore({
        setProviderKey: jest.fn().mockRejectedValue(new Error('denied')),
      });
      store.draft.set('sk-ant-abc');

      expect(await store.save('claude')).toBe(false);

      expect(store.draft()).toBe('sk-ant-abc');
      expect(store.stored()).toBe(false);
      expect(store.error()).toContain('denied');
      expect(store.busy()).toBe(false);
    });

    it('refuses a second write while one is in flight', async () => {
      const { store, keys } = createStore();
      store.draft.set('sk-ant-abc');
      store.busy.set(true);

      expect(await store.save('claude')).toBeNull();
      expect(keys.setProviderKey).not.toHaveBeenCalled();
    });
  });

  describe('removing', () => {
    it('deletes the key for the given provider', async () => {
      const { store, keys } = createStore();
      store.stored.set(true);

      expect(await store.remove('deepseek')).toBe(true);
      expect(keys.deleteProviderKey).toHaveBeenCalledWith('deepseek');
      expect(store.stored()).toBe(false);
    });

    it('leaves the key reported as stored when the delete fails', async () => {
      const { store } = createStore({
        deleteProviderKey: jest.fn().mockRejectedValue(new Error('denied')),
      });
      store.stored.set(true);

      expect(await store.remove('claude')).toBe(false);
      expect(store.stored()).toBe(true);
      expect(store.error()).toContain('denied');
    });

    it('refuses while another write is in flight', async () => {
      const { store, keys } = createStore();
      store.busy.set(true);

      expect(await store.remove('claude')).toBeNull();
      expect(keys.deleteProviderKey).not.toHaveBeenCalled();
    });
  });

  /** The keychain has no read path at all from this layer - `stored` is a
   * yes/no answer and there is no method that returns a key. */
  it('exposes no way to read a stored key back', () => {
    const { store } = createStore();
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    expect(surface).toEqual(expect.arrayContaining(['refresh', 'save', 'remove']));
    expect(surface).not.toContain('get');
    expect(surface).not.toContain('read');
  });
});

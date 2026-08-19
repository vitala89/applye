import { TestBed } from '@angular/core/testing';
import { DbService, DocumentsGateway } from '@applye/data';
import { ProfilePhotoStore } from './profile-photo.store';

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    cvPhotoReadFile: jest.fn().mockResolvedValue('data:image/png;base64,x'),
    setProfilePhoto: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ProfilePhotoStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(ProfilePhotoStore), db };
}

describe('ProfilePhotoStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens the crop modal with what the backend read', async () => {
    const { store } = createStore();
    expect(await store.readForCrop('/pictures/me.png')).toBe(true);
    expect(store.cropSourceUri()).toBe('data:image/png;base64,x');
  });

  /** A file the backend cannot read leaves the modal closed: opening a crop
   * over nothing would be a worse failure than saying so. */
  it('leaves the modal closed when the file cannot be read', async () => {
    const { store } = createStore({
      cvPhotoReadFile: jest.fn().mockRejectedValue(new Error('not an image')),
    });
    expect(await store.readForCrop('/pictures/me.txt')).toBe(false);
    expect(store.cropSourceUri()).toBeNull();
    expect(store.error()).toBe('Error: not an image');
  });

  it('writes the photo and reports success', async () => {
    const { store, db } = createStore();
    expect(await store.save('data:image/png;base64,y')).toBe(true);
    expect(db.setProfilePhoto).toHaveBeenCalledWith('data:image/png;base64,y');
    expect(store.saving()).toBe(false);
  });

  it('removes the photo by saving null', async () => {
    const { store, db } = createStore();
    expect(await store.save(null)).toBe(true);
    expect(db.setProfilePhoto).toHaveBeenCalledWith(null);
  });

  it('reports a failed write through error and clears saving', async () => {
    const { store } = createStore({
      setProfilePhoto: jest.fn().mockRejectedValue(new Error('disk full')),
    });
    expect(await store.save('data:image/png;base64,y')).toBe(false);
    expect(store.error()).toBe('Error: disk full');
    expect(store.saving()).toBe(false);
  });

  /**
   * The component reverts its optimistic value on a `false`, so a refusal must
   * not reach the gateway - otherwise a second click would revert a write the
   * first is still performing.
   */
  it('refuses a second write while one is in flight', async () => {
    let release: () => void = () => undefined;
    const setProfilePhoto = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const { store } = createStore({ setProfilePhoto });

    const first = store.save('data:image/png;base64,y');
    expect(await store.save(null)).toBe(false);
    expect(setProfilePhoto).toHaveBeenCalledTimes(1);

    release();
    expect(await first).toBe(true);
  });

  it('clears a previous error when a retry succeeds', async () => {
    const setProfilePhoto = jest
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const { store } = createStore({ setProfilePhoto });

    await store.save('data:image/png;base64,y');
    await store.save('data:image/png;base64,y');

    expect(store.error()).toBe('');
  });

  it('closes the crop modal when the crop is cancelled', async () => {
    const { store } = createStore();
    await store.readForCrop('/pictures/me.png');
    store.cancelCrop();
    expect(store.cropSourceUri()).toBeNull();
  });
});

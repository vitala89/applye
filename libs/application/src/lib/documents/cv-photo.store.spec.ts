import { TestBed } from '@angular/core/testing';
import type { CvSection } from '@applye/core';
import { DocumentsGateway, JobsGateway, ProfileSettingsGateway } from '@applye/data';
import { CvPhotoStore } from './cv-photo.store';
import { photoSectionOf } from './cv-photo-sections';

function photo(over: Partial<Extract<CvSection, { key: 'photo' }>> = {}): CvSection {
  return { key: 'photo', order: 0, visible: true, ...over } as CvSection;
}

function personal(over: Partial<Extract<CvSection, { key: 'personal_details' }>> = {}): CvSection {
  return { key: 'personal_details', order: 1, fullName: 'Ada Lovelace', ...over } as CvSection;
}

function createStore(profile: { photoDataUri?: string | null } | null = null) {
  const db = { getProfile: jest.fn().mockResolvedValue(profile) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      CvPhotoStore,
      { provide: ProfileSettingsGateway, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(CvPhotoStore), db };
}

describe('CvPhotoStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with no photo and the legacy placement', () => {
    const { store } = createStore();
    expect(store.includePhoto()).toBe(false);
    expect(store.placement()).toBe('above_left');
    expect(store.dataUri()).toBeNull();
  });

  it('takes the four toggles from a loaded document', () => {
    const { store } = createStore();
    store.hydrate([
      photo({ visible: true, dataUri: 'legacy', placement: 'above_center' }),
      personal({ birthDate: '1815-12-10' }),
    ]);

    expect(store.includePhoto()).toBe(true);
    expect(store.placement()).toBe('above_center');
    expect(store.includeBirthdate()).toBe(true);
    expect(store.includeMaritalStatus()).toBe(false);
  });

  /// The image is the profile's now. A document's own bytes are a fallback for
  /// CVs written before that, so the profile must win when both exist.
  it('prefers the profile photo over bytes the document carries', async () => {
    const { store } = createStore({ photoDataUri: 'profile-photo' });
    store.hydrate([photo({ dataUri: 'legacy' })]);
    expect(store.dataUri()).toBe('legacy');

    await store.loadProfilePhoto();
    expect(store.dataUri()).toBe('profile-photo');
  });

  it('falls back to the document photo when the profile has none', async () => {
    const { store } = createStore({ photoDataUri: null });
    store.hydrate([photo({ dataUri: 'legacy' })]);

    await store.loadProfilePhoto();
    expect(store.dataUri()).toBe('legacy');
  });

  /// A CV whose photo cannot be read is still a CV worth editing, and the
  /// document read reports its own failure - so this one is silent.
  it('survives a failed profile read', async () => {
    const { store, db } = createStore();
    db.getProfile.mockRejectedValue(new Error('locked'));

    await expect(store.loadProfilePhoto()).resolves.toBeUndefined();
    expect(store.profilePhoto()).toBeNull();
  });

  describe('toggleIncludePhoto', () => {
    it('creates the section the upload card needs when switched on', () => {
      const { store } = createStore();
      const sections = store.toggleIncludePhoto([personal()]);

      expect(store.includePhoto()).toBe(true);
      expect(sections.map((s) => s.key)).toEqual(['photo', 'personal_details']);
    });

    /// Switching off must never create a section. Without this, "always ensure a
    /// photo section" passes every other case, because the off-case above already
    /// has one.
    it('creates nothing when switched off on a document with no photo section', () => {
      const { store } = createStore();
      store.hydrate([photo({ visible: true })]);

      const sections = store.toggleIncludePhoto([personal()]);

      expect(store.includePhoto()).toBe(false);
      expect(sections.map((s) => s.key)).toEqual(['personal_details']);
    });

    it('only hides the photo when switched off, keeping the section', () => {
      const { store } = createStore();
      store.hydrate([photo({ visible: true, dataUri: 'legacy' })]);

      const sections = store.toggleIncludePhoto([photo({ visible: true, dataUri: 'legacy' })]);

      expect(store.includePhoto()).toBe(false);
      expect(photoSectionOf(sections)?.dataUri).toBe('legacy');
    });
  });

  /// The store does not own the section list: `documentLibraryUpsert` writes a
  /// whole record, so the row's owner stays the only writer and this returns what
  /// the toggles contribute.
  it('writes the toggles into the sections about to be saved', () => {
    const { store } = createStore();
    store.hydrate([photo({ visible: true, dataUri: 'legacy' })]);
    store.setPlacement('above_right');

    const saved = store.sectionsForSave([photo({ visible: true, dataUri: 'legacy' })]);

    expect(photoSectionOf(saved)?.placement).toBe('above_right');
    expect(photoSectionOf(saved)?.visible).toBe(true);
  });

  it('reports its flags, which is what the ATS notes read', () => {
    const { store } = createStore();
    store.hydrate([photo({ visible: true }), personal({ maritalStatus: 'single' })]);

    expect(store.flags()).toEqual({
      includePhoto: true,
      legacyPhotoDataUri: null,
      placement: 'above_left',
      includeBirthdate: false,
      includeMaritalStatus: true,
    });
  });
});

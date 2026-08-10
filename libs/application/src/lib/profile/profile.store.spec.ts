import { TestBed } from '@angular/core/testing';
import type { Profile } from '@applye/core';
import { DbService } from '@applye/data';
import { ProfileFormStore } from './profile-form.store';
import { ProfileStore } from './profile.store';

const MD = '# Anna Kowalska\n\n## Experience\nA role';

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    getProfile: jest.fn().mockResolvedValue(null),
    getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en', aiMode: 'api' }),
    hashText: jest.fn().mockImplementation(async (t: string) => `hash(${t})`),
    upsertProfile: jest
      .fn()
      .mockImplementation(async (input: Partial<Profile>) => ({ id: 1, ...input })),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [ProfileFormStore, ProfileStore, { provide: DbService, useValue: db }],
  });
  return { store: TestBed.inject(ProfileStore), db };
}

describe('ProfileStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('loading', () => {
    it('records the failure and leaves the form empty', async () => {
      const { store } = createStore({ getProfile: jest.fn().mockRejectedValue(new Error('gone')) });

      expect(await store.load()).toBe(false);
      expect(store.error()).toContain('gone');
      expect(store.editor.form().name).toBe('');
      expect(store.loading()).toBe(false);
    });

    /** Sections with content collapse; empty ones stay open so they invite
     * filling - and that must hold after a failed load too. */
    it('seeds the sections open when there is nothing in them', async () => {
      const { store } = createStore();

      await store.load();

      expect(store.sectionOpen().experience).toBe(true);
      expect(store.sectionOpen().photo).toBe(false);
    });

    it('collapses a section that came back with content', async () => {
      const { store } = createStore({
        getProfile: jest.fn().mockResolvedValue({ id: 1, fullMd: MD }),
      });

      await store.load();

      expect(store.editor.experienceEntries().length).toBeGreaterThan(0);
      expect(store.sectionOpen().experience).toBe(false);
    });

    /** The hash is trimmed to match what the artefact hashes, or the two never
     * compare equal and everything reports stale forever. */
    it('hashes the trimmed markdown', async () => {
      const { store, db } = createStore({
        getProfile: jest.fn().mockResolvedValue({ id: 1, fullMd: `  ${MD}  ` }),
      });

      await store.load();

      expect(db.hashText).toHaveBeenCalledWith(MD);
      expect(store.savedMdHash()).toBe(`hash(${MD})`);
    });

    it('leaves the hash null for an empty profile rather than hashing nothing', async () => {
      const { store, db } = createStore();

      await store.load();

      expect(db.hashText).not.toHaveBeenCalled();
      expect(store.savedMdHash()).toBeNull();
    });
  });

  describe('the form', () => {
    it('keeps fullMd in step with every field edit', () => {
      const { store } = createStore();

      store.editor.updateField('name', 'Anna');

      expect(store.editor.fullMd()).toContain('Anna');
      expect(store.dirty()).toBe(true);
    });

    /** Blank entries serialize to nothing, but the row must stay editable -
     * which is why the mirrors are their own signals rather than computeds. */
    it('keeps a blank entry alive while dropping it from the markdown', () => {
      const { store } = createStore();

      store.editor.onEducationChanged([
        { title: '', institution: '', startDate: '', endDate: '', details: '' },
      ]);

      expect(store.editor.educationEntries()).toHaveLength(1);
      expect(store.editor.form().education).toBe('');
    });

    it('re-parses the markdown back into fields when raw mode is left', () => {
      const { store } = createStore();
      store.toggleRawMode();
      store.editor.fullMd.set(MD);

      store.toggleRawMode();

      expect(store.editor.rawMode()).toBe(false);
      expect(store.editor.form().name).toBe('Anna Kowalska');
      expect(store.editor.experienceEntries().length).toBeGreaterThan(0);
    });
  });

  describe('saving', () => {
    /**
     * `persist` is the only writer, so the hash can never lag the row. This is
     * the assertion that fails if a second writer appears.
     */
    it('advances savedMdHash with the row it just wrote', async () => {
      const { store } = createStore();
      await store.load();
      store.editor.fullMd.set(MD);

      expect(await store.save()).toBe(true);
      expect(store.savedMdHash()).toBe(`hash(${MD})`);
      expect(store.mdDirty()).toBe(false);
    });

    it('records a failed save and leaves the edit in the form', async () => {
      const { store } = createStore({
        upsertProfile: jest.fn().mockRejectedValue(new Error('disk full')),
      });
      await store.load();
      store.editor.fullMd.set(MD);

      expect(await store.save()).toBe(false);
      expect(store.error()).toContain('disk full');
      expect(store.editor.fullMd()).toBe(MD);
      expect(store.saving()).toBe(false);
    });

    /** Archetypes never enter fullMd, so editing them must not stale the
     * artefacts - but they still make the page dirty. */
    it('counts an archetype edit as dirty without staling the markdown', async () => {
      const { store } = createStore({
        getProfile: jest.fn().mockResolvedValue({ id: 1, fullMd: MD, targetArchetypes: '[]' }),
      });
      await store.load();

      store.archetypes.set([{ name: 'Engineer', fit: 'primary', sellWhen: '' }]);

      expect(store.archetypesDirty()).toBe(true);
      expect(store.mdDirty()).toBe(false);
      expect(store.dirty()).toBe(true);
    });
  });

  /** The store hands over facts; the page joins them, because a separator is
   * presentation. */
  it('drops blanks from the hero facts without formatting them', async () => {
    const { store } = createStore({
      getProfile: jest.fn().mockResolvedValue({
        id: 1,
        fullMd: MD,
        scoringJson: '{"seniority":"Senior","domains":["Fintech"]}',
      }),
    });

    await store.load();

    expect(store.heroFacts()).toEqual(['Senior', 'Fintech']);
  });
});

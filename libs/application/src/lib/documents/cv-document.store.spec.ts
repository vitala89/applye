import { TestBed } from '@angular/core/testing';
import type { CvSection, DocumentLibraryItem } from '@applye/core';
import { DbService, DocumentsGateway } from '@applye/data';
import { CvDocumentStore } from './cv-document.store';
import { CvPhotoStore } from './cv-photo.store';
import { CvStyleStore } from './cv-style.store';

function sec(key: string, order: number, over: Record<string, unknown> = {}): CvSection {
  return { key, order, visible: true, ...over } as CvSection;
}

function row(over: Partial<DocumentLibraryItem> = {}): DocumentLibraryItem {
  return {
    id: 7,
    docType: 'cv',
    source: 'generated',
    label: 'CV for Berlin',
    regionTag: 'de',
    themeId: 2,
    isDefault: false,
    isApplicationDraft: false,
    contentJson: JSON.stringify({ sections: [sec('experience', 1), sec('summary', 0)] }),
    ...over,
  } as DocumentLibraryItem;
}

class DbStub {
  documentLibraryGet = jest.fn().mockResolvedValue(row());
  cvTemplatesList = jest.fn().mockResolvedValue([]);
  documentLibraryList = jest.fn().mockResolvedValue([]);
  documentLibraryUpsert = jest.fn((input: DocumentLibraryItem) =>
    Promise.resolve({ ...row(), ...input }),
  );
  cvTemplateUpsert = jest.fn().mockResolvedValue(undefined);
  getProfile = jest.fn().mockResolvedValue(null);
  checkStyleSafety = jest.fn().mockResolvedValue([]);
}

describe('CvDocumentStore', () => {
  let store: CvDocumentStore;
  let db: DbStub;

  beforeEach(() => {
    db = new DbStub();
    TestBed.configureTestingModule({
      providers: [
        CvDocumentStore,
        CvPhotoStore,
        CvStyleStore,
        { provide: DbService, useValue: db },
        { provide: DocumentsGateway, useValue: db },
      ],
    });
    store = TestBed.inject(CvDocumentStore);
  });

  describe('load', () => {
    it('fills the row, sorts sections by order, and hydrates the other two stores', async () => {
      await store.load(7);
      expect(store.loading()).toBe(false);
      expect(store.loadError()).toBe(false);
      expect(store.label()).toBe('CV for Berlin');
      expect(store.regionTag()).toBe('de');
      // `personal_details` leads because `normalizeCvContent` inserts it at
      // order 0 when the stored row has none, which every real load already did.
      expect(store.sections().map((s) => s.key)).toEqual([
        'personal_details',
        'summary',
        'experience',
      ]);
      expect(TestBed.inject(CvStyleStore).themeId()).toBe(2);
      expect(db.documentLibraryGet).toHaveBeenCalledWith(7);
    });

    it('defaults label and region when the row omits them', async () => {
      db.documentLibraryGet.mockResolvedValue(row({ label: undefined, regionTag: undefined }));
      await store.load(7);
      expect(store.label()).toBe('');
      expect(store.regionTag()).toBe('generic');
    });

    /** A row with no content is not a failure - it opens as a blank CV with the
     * one section every CV has, which is what the editor needs to render at
     * all. */
    it('opens a contentless row on a single empty personal-details section', async () => {
      db.documentLibraryGet.mockResolvedValue(row({ contentJson: undefined }));
      await store.load(7);
      expect(store.sections().map((s) => s.key)).toEqual(['personal_details']);
      expect(store.loadError()).toBe(false);
    });

    it('reports a missing document without throwing', async () => {
      db.documentLibraryGet.mockResolvedValue(null);
      await store.load(7);
      expect(store.loadError()).toBe(true);
      expect(store.loading()).toBe(false);
    });

    it('reports a gateway failure as a load error rather than rejecting', async () => {
      db.documentLibraryGet.mockRejectedValue(new Error('offline'));
      await expect(store.load(7)).resolves.toBeUndefined();
      expect(store.loadError()).toBe(true);
      expect(store.loading()).toBe(false);
    });

    /**
     * A CV saved before skills gained groups holds `items: string[]`. The
     * editor binds to groups, so an unmigrated row would present the user with
     * an empty skills section and silently drop their skills on the next save -
     * which is what `normalizeCvContent` is run on every load to prevent.
     */
    it('migrates a legacy skills section into a group on load', async () => {
      db.documentLibraryGet.mockResolvedValue(
        row({
          contentJson: JSON.stringify({
            sections: [
              sec('personal_details', 0),
              { key: 'skills', order: 1, visible: true, items: ['TypeScript', 'Rust'] },
            ],
          }),
        }),
      );
      await store.load(7);
      const skills = store.sections().find((s) => s.key === 'skills') as Extract<
        CvSection,
        { key: 'skills' }
      >;
      expect(skills.groups).toEqual([{ label: 'Skills', values: ['TypeScript', 'Rust'] }]);
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      await store.load(7);
    });

    it('writes the row once and keeps the saved document', async () => {
      const saved = await store.save();
      expect(saved).not.toBeNull();
      expect(db.documentLibraryUpsert).toHaveBeenCalledTimes(1);
      expect(store.doc()).toBe(saved);
    });

    it('assembles style and theme from the style store, not from the loaded row', async () => {
      const style = TestBed.inject(CvStyleStore);
      // Theme first: selectTheme reseeds the base tokens, so setting the size
      // before it would be overwritten by the theme's own default.
      style.selectTheme(1);
      style.updateStyle({ fontSizePt: 19 });
      await store.save();
      const input = db.documentLibraryUpsert.mock.calls[0][0];
      expect(JSON.parse(input.styleJson).fontSizePt).toBe(19);
      expect(input.themeId).toBe(1);
    });

    it('writes the photo toggles into the sections it saves, and keeps them', async () => {
      const photo = TestBed.inject(CvPhotoStore);
      const applied = [sec('summary', 0, { text: 'toggled' })];
      jest.spyOn(photo, 'sectionsForSave').mockReturnValue(applied);
      await store.save();
      expect(store.sections()).toBe(applied);
      expect(JSON.parse(db.documentLibraryUpsert.mock.calls[0][0].contentJson).sections).toEqual(
        applied,
      );
    });

    it('does not touch siblings when this document is not the default', async () => {
      await store.save();
      expect(db.documentLibraryList).not.toHaveBeenCalled();
    });

    it('displaces same-region default siblings before writing itself', async () => {
      db.documentLibraryList.mockResolvedValue([
        row({ id: 1, isDefault: true, regionTag: 'de' }),
        row({ id: 2, isDefault: true, regionTag: 'us' }),
        row({ id: 3, isDefault: false, regionTag: 'de' }),
      ]);
      store.isDefault.set(true);
      await store.save();
      const calls = db.documentLibraryUpsert.mock.calls.map((c) => c[0]);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ id: 1, isDefault: false });
      expect(calls[1]).toMatchObject({ id: 7, isDefault: true });
    });

    it('returns null instead of writing when there is no document', async () => {
      store.doc.set(null);
      await expect(store.save()).resolves.toBeNull();
      expect(db.documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('returns null instead of writing a second time while a save is running', async () => {
      store.saving.set(true);
      await expect(store.save()).resolves.toBeNull();
      expect(db.documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('lets a gateway failure propagate and still clears the saving flag', async () => {
      db.documentLibraryUpsert.mockRejectedValue(new Error('disk full'));
      await expect(store.save()).rejects.toThrow('disk full');
      expect(store.saving()).toBe(false);
    });
  });

  describe('section editing', () => {
    beforeEach(async () => {
      await store.load(7);
    });

    it('reorder, moveSection and replaceSection all write the sections signal', () => {
      store.setSections([sec('photo', 0), sec('summary', 1), sec('experience', 2)]);
      store.moveSection('summary', 1);
      expect(store.sections().map((s) => s.key)).toEqual(['photo', 'experience', 'summary']);
      store.reorder(2, 1);
      expect(store.sections().map((s) => s.key)).toEqual(['photo', 'summary', 'experience']);
      store.replaceSection(sec('summary', 1, { text: 'new' }));
      expect(store.sections()[1]).toMatchObject({ key: 'summary', text: 'new' });
    });

    it('setSections does NOT re-pin, because the photo toggle already reindexed', () => {
      // A list the photo toggle produced: photo first and reindexed already.
      // Re-pinning here would be invisible on a correct list, so this asserts a
      // list that pinning WOULD change is stored verbatim.
      const unpinned = [sec('summary', 0), sec('photo', 1)];
      store.setSections(unpinned);
      expect(store.sections().map((s) => `${s.key}:${s.order}`)).toEqual(['summary:0', 'photo:1']);
    });
  });

  describe('save template', () => {
    beforeEach(async () => {
      await store.load(7);
    });

    it('opens with a cleared name and closes without writing', async () => {
      store.saveTemplateName.set('stale');
      store.openSaveTemplate();
      expect(store.saveTemplateName()).toBe('');
      expect(store.saveTemplateOpen()).toBe(true);
      store.cancelSaveTemplate();
      expect(store.saveTemplateOpen()).toBe(false);
      expect(db.cvTemplateUpsert).not.toHaveBeenCalled();
    });

    it('writes the ordered section keys, the region and the three photo flags', async () => {
      const photo = TestBed.inject(CvPhotoStore);
      // Asymmetric on purpose: the three flags differ from each other, so a
      // mutation that reads the wrong one fails instead of matching by luck.
      photo.includePhoto.set(true);
      photo.includeBirthdate.set(false);
      photo.includeMaritalStatus.set(true);
      store.setSections([sec('experience', 2), sec('summary', 1), sec('photo', 0)]);
      store.saveTemplateName.set('  Berlin standard  ');
      await expect(store.confirmSaveTemplate()).resolves.toBe(true);
      expect(db.cvTemplateUpsert).toHaveBeenCalledWith({
        name: 'Berlin standard',
        regionTag: 'de',
        sectionsJson: JSON.stringify(['photo', 'summary', 'experience']),
        includePhoto: true,
        includeBirthdate: false,
        includeMaritalStatus: true,
      });
      expect(store.saveTemplateOpen()).toBe(false);
      expect(db.cvTemplatesList).toHaveBeenCalledTimes(2); // once on load, once after
    });

    it('refuses a blank or whitespace-only name without writing', async () => {
      store.saveTemplateName.set('   ');
      await expect(store.confirmSaveTemplate()).resolves.toBe(false);
      expect(db.cvTemplateUpsert).not.toHaveBeenCalled();
    });

    it('refuses to run twice at once', async () => {
      store.saveTemplateName.set('x');
      store.savingTemplate.set(true);
      await expect(store.confirmSaveTemplate()).resolves.toBe(false);
      expect(db.cvTemplateUpsert).not.toHaveBeenCalled();
    });

    it('lets a gateway failure propagate, clears the flag and leaves the dialog open', async () => {
      db.cvTemplateUpsert.mockRejectedValue(new Error('nope'));
      store.openSaveTemplate();
      store.saveTemplateName.set('x');
      await expect(store.confirmSaveTemplate()).rejects.toThrow('nope');
      expect(store.savingTemplate()).toBe(false);
      expect(store.saveTemplateOpen()).toBe(true);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import type { CvSection, DocumentLibraryItem } from '@applye/core';
import { AiService, DbService, DocumentsGateway, JobsGateway, SystemGateway } from '@applye/data';
import { CvDocumentStore } from './cv-document.store';
import { CvPhotoStore } from './cv-photo.store';
import { CvStyleStore } from './cv-style.store';
import { CvNoProfileError } from './cv-regeneration';
import { CvRegenerationStore } from './cv-regeneration.store';

function sec(key: string, order: number, over: Record<string, unknown> = {}): CvSection {
  return { key, order, visible: true, ...over } as CvSection;
}

/** What the `cv-generate-baseline` skill answers. It is serialised into
 * `ai.run`'s reply and read back by the store's own `parseCvSkillResponse`, so
 * these tests exercise the real parse and the real section merge. */
const ANSWER = JSON.stringify({
  personalDetails: { fullName: 'Ada King', title: 'Analyst' },
  summary: 'Ten years of analysis.',
});

class DbStub {
  getProfile = jest.fn().mockResolvedValue({ fullMd: '# Ada', scoringJson: '{"a":1}' });
  getSettings = jest.fn().mockResolvedValue({
    aiMode: 'api',
    provider: 'anthropic',
    defaultModel: 'claude',
    defaultDocLanguage: 'pl',
  });
  hashText = jest.fn().mockResolvedValue('hash-new');
  checkStyleSafety = jest.fn().mockResolvedValue([]);
}

class AiStub {
  renderSkill = jest
    .fn()
    .mockResolvedValue({ systemPrompt: 'SYS', userPrompt: 'USR', version: '1' });
  run = jest.fn().mockResolvedValue({ text: ANSWER });
}

describe('CvRegenerationStore', () => {
  let store: CvRegenerationStore;
  let doc: CvDocumentStore;
  let db: DbStub;
  let ai: AiStub;

  beforeEach(() => {
    db = new DbStub();
    ai = new AiStub();
    TestBed.configureTestingModule({
      providers: [
        CvRegenerationStore,
        CvDocumentStore,
        CvPhotoStore,
        CvStyleStore,
        { provide: DbService, useValue: db },
        { provide: JobsGateway, useValue: db },
        { provide: DocumentsGateway, useValue: db },
        { provide: SystemGateway, useValue: db },
        { provide: AiService, useValue: ai },
      ],
    });
    store = TestBed.inject(CvRegenerationStore);
    doc = TestBed.inject(CvDocumentStore);
    doc.doc.set({
      id: 7,
      docType: 'cv',
      source: 'generated',
      language: 'de',
      archetypeTag: 'specialist',
      isDefault: false,
    } as DocumentLibraryItem);
    doc.regionTag.set('de');
    doc.sections.set([sec('personal_details', 0, { fullName: 'Ada Lovelace' }), sec('summary', 1)]);
  });

  describe('regenerateSection', () => {
    it('renders the skill with the document context and folds the answer back in', async () => {
      await expect(store.regenerateSection('summary')).resolves.toBe(true);
      expect(ai.renderSkill).toHaveBeenCalledWith('cv-generate-baseline', {
        profile_md: '# Ada',
        scoring_json: '{"a":1}',
        region_tag: 'de',
        archetype_tag: 'specialist',
        language: 'de',
        section: 'summary',
      });
      // The real merge rewrites the named section in place and leaves the rest
      // alone - it never appends, which is what the fake codec used to do.
      expect(doc.sections().map((s) => s.key)).toEqual(['personal_details', 'summary']);
      const summary = doc.sections().find((s) => s.key === 'summary');
      expect(summary).toMatchObject({ order: 1, sourceHash: 'hash-new' });
    });

    it('reads settings once, and passes them to the run', async () => {
      await store.regenerateSection('summary');
      expect(db.getSettings).toHaveBeenCalledTimes(1);
      expect(ai.run).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'api', provider: 'anthropic', model: 'claude' }),
      );
    });

    it('falls back to the settings language when the document has none', async () => {
      doc.doc.update((d) => ({ ...d, language: undefined }) as DocumentLibraryItem);
      await store.regenerateSection('summary');
      expect(ai.renderSkill.mock.calls[0][1].language).toBe('pl');
    });

    it('skips the model when the section hash already matches', async () => {
      doc.sections.set([sec('summary', 0, { sourceHash: 'hash-new' })]);
      await expect(store.regenerateSection('summary')).resolves.toBe(false);
      expect(ai.run).not.toHaveBeenCalled();
    });

    it('DOES call the model when the hash differs', async () => {
      doc.sections.set([sec('summary', 0, { sourceHash: 'hash-old' })]);
      await expect(store.regenerateSection('summary')).resolves.toBe(true);
      expect(ai.run).toHaveBeenCalledTimes(1);
    });

    it('refuses while another regeneration is running, and when there is no document', async () => {
      store.regeneratingKey.set('skills');
      await expect(store.regenerateSection('summary')).resolves.toBe(false);
      store.regeneratingKey.set(null);
      doc.doc.set(null);
      await expect(store.regenerateSection('summary')).resolves.toBe(false);
      expect(ai.run).not.toHaveBeenCalled();
    });

    it('raises a typed error for a profile with no markdown, and clears the flag', async () => {
      db.getProfile.mockResolvedValue({ fullMd: '' });
      await expect(store.regenerateSection('summary')).rejects.toBeInstanceOf(CvNoProfileError);
      expect(store.regeneratingKey()).toBeNull();
    });

    it('clears the in-flight key when the model call fails', async () => {
      ai.run.mockRejectedValue(new Error('rate limited'));
      await expect(store.regenerateSection('summary')).rejects.toThrow('rate limited');
      expect(store.regeneratingKey()).toBeNull();
    });
  });

  describe('pullFromProfile', () => {
    it('merges fresh personal details into a NEW section object', async () => {
      const before = doc.sections()[0];
      await expect(store.pullFromProfile()).resolves.toBe(true);
      const after = doc.sections()[0];
      expect(after).not.toBe(before);
      expect(after).toMatchObject({ fullName: 'Ada King', title: 'Analyst' });
      expect(ai.renderSkill.mock.calls[0][1].section).toBe('personalDetails');
    });

    it('leaves the other sections untouched', async () => {
      await store.pullFromProfile();
      expect(doc.sections().map((s) => s.key)).toEqual(['personal_details', 'summary']);
    });

    it('refuses when the document has no personal-details section', async () => {
      doc.sections.set([sec('summary', 0)]);
      await expect(store.pullFromProfile()).resolves.toBe(false);
      expect(ai.run).not.toHaveBeenCalled();
    });

    it('refuses while a pull is already running', async () => {
      store.pullingProfile.set(true);
      await expect(store.pullFromProfile()).resolves.toBe(false);
      expect(ai.run).not.toHaveBeenCalled();
    });

    it('raises a typed error for a profile with no markdown, and clears the flag', async () => {
      db.getProfile.mockResolvedValue(null);
      await expect(store.pullFromProfile()).rejects.toBeInstanceOf(CvNoProfileError);
      expect(store.pullingProfile()).toBe(false);
    });
  });
});

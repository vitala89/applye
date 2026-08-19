import { TestBed } from '@angular/core/testing';
import { DocumentsGateway, JobsGateway, SystemGateway } from '@applye/data';
import { LinkedDocumentsService } from './linked-documents.service';

describe('LinkedDocumentsService', () => {
  let svc: LinkedDocumentsService;
  let rows: Record<number, Record<string, unknown> | null>;
  let committed: number[];
  let upserted: Record<string, unknown>[];
  let commitFails: boolean;
  let commitReturnsNull: boolean;

  const APP = { id: 1, jobId: 7, cvDocumentId: 10, coverLetterDocumentId: 20 };

  beforeEach(() => {
    committed = [];
    upserted = [];
    commitFails = false;
    commitReturnsNull = false;
    rows = {
      10: { id: 10, label: 'CV', isApplicationDraft: true, inputHash: 'H1', language: 'de' },
      20: { id: 20, label: 'Letter', isApplicationDraft: false, inputHash: 'H2' },
      30: { id: 30, label: 'Picked', isApplicationDraft: false, language: 'fr' },
      31: { id: 31, label: 'No language', isApplicationDraft: false },
    };

    const db = {
      documentLibraryGet: (id: number) => Promise.resolve(rows[id] ?? null),
      documentLibraryCommit: (id: number) => {
        if (commitFails) return Promise.reject(new Error('db down'));
        committed.push(id);
        if (commitReturnsNull) return Promise.resolve(null);
        return Promise.resolve({ ...rows[id], isApplicationDraft: false });
      },
      upsertApplication: (a: Record<string, unknown>) => {
        upserted.push(a);
        return Promise.resolve({ ...a });
      },
      hashText: (v: string) => Promise.resolve(`hash(${v})`),
    };

    TestBed.configureTestingModule({
      providers: [
        LinkedDocumentsService,
        { provide: JobsGateway, useValue: db },
        { provide: DocumentsGateway, useValue: db },
        { provide: SystemGateway, useValue: db },
      ],
    });
    svc = TestBed.inject(LinkedDocumentsService);
  });

  describe('loading', () => {
    it('reads both documents the application points at', async () => {
      await svc.load(APP as never);

      expect(svc.cv()?.id).toBe(10);
      expect(svc.coverLetter()?.id).toBe(20);
    });

    it('leaves a side null when the application points at nothing', async () => {
      await svc.load({ id: 1, jobId: 7, cvDocumentId: 10 } as never);

      expect(svc.cv()?.id).toBe(10);
      expect(svc.coverLetter()).toBeNull();
    });

    it('handles no application at all', async () => {
      await svc.load(null);

      expect(svc.cv()).toBeNull();
      expect(svc.coverLetter()).toBeNull();
    });
  });

  describe('committing', () => {
    it('commits a draft and mirrors the committed row back', async () => {
      await svc.load(APP as never);

      await svc.commit('cv');

      expect(committed).toEqual([10]);
      expect(svc.cv()?.isApplicationDraft).toBe(false);
    });

    it('does nothing for a document that is already committed', async () => {
      await svc.load(APP as never);

      await svc.commit('cover_letter');

      expect(committed).toEqual([]);
    });

    it('does nothing with nothing linked', async () => {
      await svc.commit('cv');

      expect(committed).toEqual([]);
    });

    /**
     * The swallow is deliberate - a failed commit must not break an export -
     * but it used to leave nothing behind, so a document that never left draft
     * was indistinguishable from one nobody had committed yet.
     */
    it('keeps the draft when the commit throws, so the next attempt retries, and records why', async () => {
      await svc.load(APP as never);
      commitFails = true;

      await svc.commit('cv');

      expect(svc.cv()?.isApplicationDraft).toBe(true);
      expect(svc.commitError()).toContain('db down');
    });

    it('clears the recorded failure once a commit succeeds', async () => {
      await svc.load(APP as never);
      commitFails = true;
      await svc.commit('cv');
      expect(svc.commitError()).not.toBeNull();

      commitFails = false;
      await svc.commit('cv');

      expect(svc.commitError()).toBeNull();
      expect(svc.cv()?.isApplicationDraft).toBe(false);
    });

    it('keeps the draft when the commit returns nothing', async () => {
      await svc.load(APP as never);
      commitReturnsNull = true;

      await svc.commit('cv');

      expect(svc.cv()?.isApplicationDraft).toBe(true);
    });
  });

  describe('linking an existing library row', () => {
    it('points the application at it and adopts its language', async () => {
      const result = await svc.link('cv', 30, APP as never, 'en');

      expect(result?.item.id).toBe(30);
      expect(svc.cv()?.id).toBe(30);
      expect(upserted[0]['cvDocumentId']).toBe(30);
      // The other side is carried forward untouched.
      expect(upserted[0]['coverLetterDocumentId']).toBe(20);
      expect(upserted[0]['docLanguage']).toBe('fr');
    });

    it('falls back to the caller language when the row has none', async () => {
      await svc.link('cover_letter', 31, APP as never, 'en');

      expect(upserted[0]['docLanguage']).toBe('en');
      expect(upserted[0]['coverLetterDocumentId']).toBe(31);
      expect(upserted[0]['cvDocumentId']).toBe(10);
    });

    it('returns null and writes nothing when the row has gone', async () => {
      const result = await svc.link('cv', 404, APP as never, 'en');

      expect(result).toBeNull();
      expect(upserted).toEqual([]);
      expect(svc.cv()).toBeNull();
    });
  });

  describe('staleness', () => {
    it('is stale when the inputs no longer hash to what was saved', async () => {
      await svc.load(APP as never);

      expect(await svc.isStale('cv', 'something else')).toBe(true);
    });

    it('is fresh when they do', async () => {
      rows[10] = { ...rows[10], inputHash: 'hash(SAME)' };
      await svc.load(APP as never);

      expect(await svc.isStale('cv', 'SAME')).toBe(false);
    });

    it("is not stale with nothing linked - absent is the caller's branch, not this one", async () => {
      expect(await svc.isStale('cv', 'anything')).toBe(false);
    });
  });

  it('clear drops both sides', async () => {
    await svc.load(APP as never);

    svc.clear();

    expect(svc.cv()).toBeNull();
    expect(svc.coverLetter()).toBeNull();
  });
});

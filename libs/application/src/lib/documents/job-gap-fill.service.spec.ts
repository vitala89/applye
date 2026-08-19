import { TestBed } from '@angular/core/testing';
import { DbService, DocumentsGateway } from '@applye/data';
import { CvGapDialogService } from './cv-gap-dialog.service';
import { JobGapFillService, jobDocLabel } from './job-gap-fill.service';

describe('jobDocLabel', () => {
  it('names the company and the role the document was tailored for', () => {
    expect(jobDocLabel({ company: 'Acme', title: 'Engineer' } as never, 'Tailored CV')).toBe(
      'Acme - Engineer - Tailored CV',
    );
  });

  it('drops a missing half rather than leaving a dangling separator', () => {
    expect(jobDocLabel({ company: 'Acme' } as never, 'Cover Letter')).toBe('Acme - Cover Letter');
    expect(jobDocLabel({ title: 'Engineer' } as never, 'Cover Letter')).toBe(
      'Engineer - Cover Letter',
    );
  });

  it('still produces a usable label for a job with neither', () => {
    // The Documents list must never show a row labelled " - Tailored CV".
    expect(jobDocLabel({} as never, 'Tailored CV')).toBe('Job - Tailored CV');
  });
});

describe('JobGapFillService', () => {
  let svc: JobGapFillService;
  let upserted: Record<string, unknown>[];
  let upsertFails: boolean;

  const PROFILE = {
    fullMd: 'PROFILE',
    scoringJson: '{"a":1}',
    scoringHash: 'SCORE-HASH',
    pitchMd: 'PITCH',
    pitchHash: 'PITCH-HASH',
    targetArchetypes: 'ARCHETYPES',
  };

  beforeEach(() => {
    upserted = [];
    upsertFails = false;

    const db = {
      upsertProfile: (p: Record<string, unknown>) => {
        if (upsertFails) return Promise.reject(new Error('write failed'));
        upserted.push(p);
        return Promise.resolve({ ...p, id: 1 });
      },
    };

    TestBed.configureTestingModule({
      providers: [
        JobGapFillService,
        CvGapDialogService,
        { provide: DbService, useValue: db },
        { provide: DocumentsGateway, useValue: db },
      ],
    });

    svc = TestBed.inject(JobGapFillService);
  });

  describe('appendToProfile', () => {
    it('carries every other profile field forward, not only the text', async () => {
      // The #97 lesson: upsertProfile replaces the whole row, so a partial
      // payload silently wipes the scoring cache, the pitch and the
      // archetypes.
      await svc.appendToProfile(PROFILE as never, 'ANSWERS', () => undefined);

      expect(upserted[0]).toMatchObject({
        scoringJson: '{"a":1}',
        scoringHash: 'SCORE-HASH',
        pitchMd: 'PITCH',
        pitchHash: 'PITCH-HASH',
        targetArchetypes: 'ARCHETYPES',
      });
    });

    it('appends the block below the existing profile, separated by a blank line', async () => {
      await svc.appendToProfile(PROFILE as never, 'ANSWERS', () => undefined);

      expect(upserted[0]['fullMd']).toBe('PROFILE\n\nANSWERS');
    });

    it('hands the saved profile back so the page holds what the database holds', async () => {
      let applied: unknown = null;

      await svc.appendToProfile(PROFILE as never, 'ANSWERS', (p) => (applied = p));

      expect(applied).toMatchObject({ id: 1, fullMd: 'PROFILE\n\nANSWERS' });
    });

    it('writes nothing when there is no profile or no block', async () => {
      await svc.appendToProfile(null, 'ANSWERS', () => undefined);
      await svc.appendToProfile(PROFILE as never, '', () => undefined);

      expect(upserted).toEqual([]);
    });

    it('lets a failed write surface rather than swallowing it here', async () => {
      upsertFails = true;

      await expect(
        svc.appendToProfile(PROFILE as never, 'ANSWERS', () => undefined),
      ).rejects.toThrow('write failed');
    });
  });

  describe('hooks', () => {
    it('builds a bundle both document flows can pass straight through', () => {
      const hooks = svc.hooks({
        job: { id: 7 } as never,
        settings: { defaultModel: 'quality' } as never,
        language: 'en',
        profile: PROFILE as never,
        applyProfile: () => undefined,
      });

      expect(typeof hooks.analyzeGaps).toBe('function');
      expect(typeof hooks.askGaps).toBe('function');
      expect(typeof hooks.saveToProfile).toBe('function');
    });

    it('routes saveToProfile at the profile the bundle was built with', async () => {
      const hooks = svc.hooks({
        job: { id: 7 } as never,
        settings: null,
        language: 'en',
        profile: PROFILE as never,
        applyProfile: () => undefined,
      });

      await hooks.saveToProfile('FROM THE DIALOG');

      expect(upserted[0]['fullMd']).toBe('PROFILE\n\nFROM THE DIALOG');
    });
  });
});

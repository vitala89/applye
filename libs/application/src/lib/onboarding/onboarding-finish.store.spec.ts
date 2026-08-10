import { TestBed } from '@angular/core/testing';
import type { CvContent, CvParsedContent } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { OnboardingFinishStore } from './onboarding-finish.store';
import { OnboardingResumeStore } from './onboarding-resume.store';
import { OnboardingReviewStore } from './onboarding-review.store';
import { OnboardingTargetingStore } from './onboarding-targeting.store';

function parsedCv(): CvParsedContent {
  return {
    personalDetails: { fullName: 'Vitalii Kasap', email: 'v@example.com' },
    summary: 'Frontend engineer',
    experience: [{ role: 'Senior FE', company: 'Acme', bullets: [] }],
    skills: ['Angular'],
    education: [],
    languages: [],
    lowConfidenceNotes: [],
  } as unknown as CvParsedContent;
}

/** Stands in for `buildCvContent`, which stays in `apps/desktop`. What it lays
 * out is proved by `onboarding-cv-input.spec.ts` there, against the real one. */
const buildContent = (): CvContent => ({ sections: [] }) as unknown as CvContent;

describe('OnboardingFinishStore', () => {
  let store: OnboardingFinishStore;
  let review: OnboardingReviewStore;
  let resume: OnboardingResumeStore;
  let documentLibraryList: jest.Mock;
  let documentLibraryUpsert: jest.Mock;

  beforeEach(() => {
    documentLibraryList = jest.fn().mockResolvedValue([]);
    documentLibraryUpsert = jest.fn().mockResolvedValue({ id: 1 });

    TestBed.configureTestingModule({
      providers: [
        OnboardingFinishStore,
        OnboardingResumeStore,
        OnboardingReviewStore,
        OnboardingTargetingStore,
        {
          provide: DbService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({ uiLanguage: 'en' }),
            getProfile: jest.fn().mockResolvedValue(null),
            upsertProfile: jest.fn().mockResolvedValue({ id: 1 }),
            cvTemplatesList: jest.fn().mockResolvedValue([]),
            documentLibraryList,
            documentLibraryUpsert,
          },
        },
        { provide: AiService, useValue: {} },
      ],
    });
    store = TestBed.inject(OnboardingFinishStore);
    review = TestBed.inject(OnboardingReviewStore);
    resume = TestBed.inject(OnboardingResumeStore);
  });

  const save = () => store.saveCvDocument({ fallbackLabel: 'Untitled CV', buildContent });

  describe('saveCvDocument', () => {
    it('writes the CV and says so', async () => {
      review.parsedCv.set(parsedCv());

      await expect(save()).resolves.toBe('saved');
      expect(documentLibraryUpsert).toHaveBeenCalled();
    });

    it('declines when there is nothing parsed to write', async () => {
      await expect(save()).resolves.toBe('skipped');
      expect(documentLibraryUpsert).not.toHaveBeenCalled();
    });

    it('declines when the user skipped the resume step', async () => {
      review.parsedCv.set(parsedCv());
      resume.path.set('skip');

      await expect(save()).resolves.toBe('skipped');
    });

    /// The existing document wins: it may already carry edits made in
    /// Documents, and silently overwriting those costs more than not rewriting.
    it('declines rather than stacking a copy of a file already imported', async () => {
      review.parsedCv.set(parsedCv());
      resume.inputHash.set('abc123');
      documentLibraryList.mockResolvedValue([{ source: 'uploaded', inputHash: 'abc123' }]);

      await expect(save()).resolves.toBe('skipped');
      expect(documentLibraryUpsert).not.toHaveBeenCalled();
    });

    /// `failed` is kept apart from `skipped` even though the wizard finishes
    /// either way: only one of the two is worth telling the user about, and
    /// only the page can tell them (ADR-0005, amendment fifteen).
    it('reports a refused write as failed, not as skipped', async () => {
      review.parsedCv.set(parsedCv());
      documentLibraryUpsert.mockRejectedValue(new Error('disk full'));
      const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(save()).resolves.toBe('failed');

      logged.mockRestore();
    });
  });
});

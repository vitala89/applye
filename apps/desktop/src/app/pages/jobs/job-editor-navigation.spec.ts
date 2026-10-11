import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { FinalChecks, JobDocumentDraftsStore, JobDocumentsStore } from '@applye/application';
import { parkFinalChecks } from '../../core/browser-ui-state';
import { editorRoute, JobEditorNavigation } from './job-editor-navigation';

jest.mock('../../core/browser-ui-state', () => ({
  parkFinalChecks: jest.fn(),
}));

const CHECKS = {
  inputHash: 'h',
  ats: 'pass',
  hr: 'strong',
  fit: 'valid',
  notes: [],
} as FinalChecks;

describe('JobEditorNavigation', () => {
  let navigated: { commands: unknown[]; extras: unknown }[];

  beforeEach(() => {
    navigated = [];
    sessionStorage.clear();
    (parkFinalChecks as jest.Mock).mockClear();
    TestBed.configureTestingModule({
      providers: [
        JobEditorNavigation,
        {
          provide: Router,
          useValue: {
            navigate: (commands: unknown[], extras: unknown) => {
              navigated.push({ commands, extras });
              return Promise.resolve(true);
            },
          },
        },
        {
          provide: JobDocumentsStore,
          useValue: {
            openCv: async () => ({
              kind: 'cv' as const,
              documentId: 11,
              preview: true,
              returnTo: { context: 'applyWizard' as const, jobId: 4, reviewHash: 'rh' },
              parkedReview: { reviewHash: 'rh', checks: CHECKS },
            }),
            openCoverLetter: async () => null,
          },
        },
        {
          provide: JobDocumentDraftsStore,
          useValue: {
            startTailoringCoverLetter: async () => ({
              kind: 'cover_letter' as const,
              documentId: 22,
            }),
          },
        },
      ],
    });
  });

  it('navigates to the destination and parks the checks that travel with it', async () => {
    await TestBed.inject(JobEditorNavigation).openCv(11, true);

    expect(parkFinalChecks).toHaveBeenCalledWith('rh', CHECKS);
    expect(navigated).toEqual([
      {
        commands: ['/documents/cv', 11],
        extras: {
          queryParams: {
            returnTo: 'applyWizard',
            jobId: 4,
            documentType: 'cv',
            documentId: 11,
            reviewHash: 'rh',
            preview: '1',
          },
        },
      },
    ]);
  });

  it('does not navigate when the store has nowhere to go', async () => {
    await TestBed.inject(JobEditorNavigation).openCoverLetter(4);

    expect(navigated).toEqual([]);
    expect(parkFinalChecks).not.toHaveBeenCalled();
  });

  it('opens a tailored cover letter on the existing editor route', async () => {
    await TestBed.inject(JobEditorNavigation).openTailoredCoverLetter();

    expect(navigated).toEqual([{ commands: ['/documents/cover-letter', 22], extras: undefined }]);
  });

  it('maps a My Jobs return onto the existing query', () => {
    expect(
      editorRoute({
        kind: 'cv',
        documentId: 11,
        returnTo: { context: 'myJobs', jobId: 4, jobLabel: 'Acme' },
      }),
    ).toEqual({
      commands: ['/documents/cv', 11],
      extras: { queryParams: { returnTo: 'myJobs', jobId: 4, jobLabel: 'Acme' } },
    });
  });
});

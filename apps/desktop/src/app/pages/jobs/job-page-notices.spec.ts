import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  CoverLetterTailorService,
  CvGapDialogService,
  DocumentReviewStatusService,
  JobDetailLifecycleStore,
  JobDetailStore,
  PortalAnswersService,
  TailoringService,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../core/toast/toast.service';
import { JobPageNotices } from './job-page-notices';

describe('JobPageNotices', () => {
  const unexpectedFailure = signal<string | null>(null);
  const loadError = signal<string | null>(null);
  const partialLoadError = signal<string | null>(null);
  const baselineWarning = signal<string | null>(null);
  const portalError = signal(false);
  const portalStatus = signal('');
  const analyzeError = signal<string | null>(null);
  const letterError = signal('');
  const toast = { error: jest.fn(), warning: jest.fn(), success: jest.fn() };

  beforeEach(() => {
    unexpectedFailure.set(null);
    loadError.set(null);
    partialLoadError.set(null);
    baselineWarning.set(null);
    portalError.set(false);
    portalStatus.set('');
    analyzeError.set(null);
    letterError.set('');
    toast.error.mockClear();
    toast.warning.mockClear();
    TestBed.configureTestingModule({
      providers: [
        JobPageNotices,
        { provide: ToastService, useValue: toast },
        { provide: TranslateService, useValue: { t: signal((key: string) => key) } },
        { provide: DocumentReviewStatusService, useValue: { unexpectedFailure } },
        { provide: JobDetailStore, useValue: { loadError } },
        { provide: JobDetailLifecycleStore, useValue: { partialLoadError } },
        { provide: TailoringService, useValue: { baselineWarning } },
        { provide: PortalAnswersService, useValue: { error: portalError, status: portalStatus } },
        { provide: CvGapDialogService, useValue: { analyzeError } },
        { provide: CoverLetterTailorService, useValue: { error: letterError } },
      ],
    });
    TestBed.inject(JobPageNotices);
    TestBed.flushEffects();
  });

  it('stays quiet while every notice is empty', () => {
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('toasts an unexpected review failure', () => {
    unexpectedFailure.set('database is gone');
    TestBed.flushEffects();

    expect(toast.error).toHaveBeenCalledWith('database is gone');
  });

  it('prefixes a gap-analysis failure so the desktop owns the wording', () => {
    analyzeError.set('provider down');
    TestBed.flushEffects();

    expect(toast.warning).toHaveBeenCalledWith('jobs.gap_analysis_unavailable provider down');
  });
});

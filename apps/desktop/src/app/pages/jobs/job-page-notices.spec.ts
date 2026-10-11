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

  afterEach(() => TestBed.resetTestingModule());

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

describe('JobPageNotices does not track the toast list', () => {
  const unexpectedFailure = signal<string | null>(null);

  beforeEach(() => {
    jest.useFakeTimers();
    unexpectedFailure.set(null);
    TestBed.configureTestingModule({
      providers: [
        JobPageNotices,
        ToastService,
        TranslateService,
        { provide: DocumentReviewStatusService, useValue: { unexpectedFailure } },
        { provide: JobDetailStore, useValue: { loadError: signal<string | null>(null) } },
        {
          provide: JobDetailLifecycleStore,
          useValue: { partialLoadError: signal<string | null>(null) },
        },
        { provide: TailoringService, useValue: { baselineWarning: signal<string | null>(null) } },
        {
          provide: PortalAnswersService,
          useValue: { error: signal(false), status: signal('') },
        },
        { provide: CvGapDialogService, useValue: { analyzeError: signal<string | null>(null) } },
        { provide: CoverLetterTailorService, useValue: { error: signal('') } },
      ],
    });
    TestBed.inject(JobPageNotices);
    TestBed.flushEffects();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('toasts a failure once, including after the toast dismisses itself', () => {
    unexpectedFailure.set('database is gone');
    TestBed.flushEffects();

    const toast = TestBed.inject(ToastService);
    expect(toast.toasts().map((item) => item.message)).toEqual(['database is gone']);

    jest.advanceTimersByTime(7000);
    TestBed.flushEffects();

    expect(toast.toasts()).toEqual([]);
  });
});

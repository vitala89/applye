import { TestBed } from '@angular/core/testing';
import {
  FinalChecks,
  TailoringPassDraftsService,
  WizardProgressService,
} from '@applye/application';
import {
  BrowserUiState,
  parkFinalChecks,
  persistTailoringPassDrafts,
  persistWizardProgress,
  readParkedFinalChecks,
  readSidebarCollapsed,
  readTailoringPassDrafts,
  readWizardProgress,
  writeSidebarCollapsed,
} from './browser-ui-state';

const CHECKS = {
  inputHash: 'h',
  ats: 'pass',
  hr: 'strong',
  fit: 'valid',
  notes: [],
} as FinalChecks;

describe('browser UI state', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('remembers the sidebar rail across a fresh read', () => {
    expect(readSidebarCollapsed()).toBe(false);

    writeSidebarCollapsed(true);
    expect(readSidebarCollapsed()).toBe(true);

    writeSidebarCollapsed(false);
    expect(localStorage.getItem('applye.sidebar.collapsed')).toBe('0');
  });

  it('hydrates wizard progress and mirrors a later step', () => {
    sessionStorage.setItem('applye:wizardProgress', JSON.stringify({ jobId: 9, step: 2 }));
    TestBed.configureTestingModule({});
    const wizard = TestBed.inject(WizardProgressService);
    TestBed.inject(BrowserUiState);
    TestBed.flushEffects();

    expect(wizard.progress()).toEqual({ jobId: 9, step: 2 });

    wizard.set(9, 4);
    TestBed.flushEffects();
    expect(readWizardProgress()).toEqual({ jobId: 9, step: 4 });

    wizard.clear(9);
    TestBed.flushEffects();
    expect(sessionStorage.getItem('applye:wizardProgress')).toBeNull();
  });

  it('ignores malformed wizard progress and tailoring records', () => {
    sessionStorage.setItem('applye:wizardProgress', '{ not json');
    sessionStorage.setItem('applye:tailoringPassDrafts', JSON.stringify({ jobId: 7 }));

    expect(readWizardProgress()).toBeNull();
    expect(readTailoringPassDrafts()).toBeNull();
  });

  it('keeps tailoring-pass ownership across a new service in the same session', () => {
    TestBed.configureTestingModule({});
    const drafts = TestBed.inject(TailoringPassDraftsService);
    TestBed.inject(BrowserUiState);
    drafts.record(7, 11);
    TestBed.flushEffects();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const revived = TestBed.inject(TailoringPassDraftsService);
    TestBed.inject(BrowserUiState);

    expect(revived.ids(7)).toEqual([11]);
    expect(readTailoringPassDrafts()).toEqual({ jobId: 7, ids: [11] });
  });

  it('parks final checks under the review hash and ignores a corrupt payload', () => {
    parkFinalChecks('rh', CHECKS);
    expect(readParkedFinalChecks('rh')).toEqual(CHECKS);
    expect(readParkedFinalChecks('missing')).toBeNull();
    expect(readParkedFinalChecks(null)).toBeNull();

    sessionStorage.setItem('applye:wizardFinalChecks:corrupt', '{not json');
    expect(readParkedFinalChecks('corrupt')).toBeNull();
  });

  it('round-trips the wizard and tailoring writers the effect uses', () => {
    persistWizardProgress({ jobId: 3, step: 1 });
    persistTailoringPassDrafts({ jobId: 3, ids: [8] });

    expect(readWizardProgress()).toEqual({ jobId: 3, step: 1 });
    expect(readTailoringPassDrafts()).toEqual({ jobId: 3, ids: [8] });

    persistWizardProgress(null);
    persistTailoringPassDrafts(null);
    expect(sessionStorage.length).toBe(0);
  });
});

import { Injectable, effect, inject } from '@angular/core';
import {
  FinalChecks,
  TailoringPassDrafts,
  TailoringPassDraftsService,
  WizardProgress,
  WizardProgressService,
} from '@applye/application';

/** Per-machine sidebar rail. Not career data, and not in SQLite. */
const SIDEBAR_KEY = 'applye.sidebar.collapsed';
const WIZARD_KEY = 'applye:wizardProgress';
const TAILORING_KEY = 'applye:tailoringPassDrafts';
const FINAL_CHECKS_PREFIX = 'applye:wizardFinalChecks:';

/**
 * Browser storage for UI state the application layer owns but must not touch.
 *
 * The keys are unchanged, so a session that already stored them keeps them.
 * The application services hold the values; this file is the only reader and
 * writer of the browser APIs.
 */
export function readSidebarCollapsed(): boolean {
  return globalThis.localStorage?.getItem(SIDEBAR_KEY) === '1';
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  globalThis.localStorage?.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
}

export function readWizardProgress(): WizardProgress | null {
  return parseWizard(globalThis.sessionStorage?.getItem(WIZARD_KEY));
}

export function persistWizardProgress(progress: WizardProgress | null): void {
  const storage = globalThis.sessionStorage;
  if (!storage) return;
  if (!progress) storage.removeItem(WIZARD_KEY);
  else storage.setItem(WIZARD_KEY, JSON.stringify(progress));
}

export function readTailoringPassDrafts(): TailoringPassDrafts | null {
  return parseDrafts(globalThis.sessionStorage?.getItem(TAILORING_KEY));
}

export function persistTailoringPassDrafts(drafts: TailoringPassDrafts | null): void {
  const storage = globalThis.sessionStorage;
  if (!storage) return;
  if (!drafts) storage.removeItem(TAILORING_KEY);
  else storage.setItem(TAILORING_KEY, JSON.stringify(drafts));
}

export function parkFinalChecks(reviewHash: string, checks: FinalChecks): void {
  globalThis.sessionStorage?.setItem(`${FINAL_CHECKS_PREFIX}${reviewHash}`, JSON.stringify(checks));
}

export function readParkedFinalChecks(reviewHash: string | null): FinalChecks | null {
  if (!reviewHash) return null;
  const raw = globalThis.sessionStorage?.getItem(`${FINAL_CHECKS_PREFIX}${reviewHash}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FinalChecks;
  } catch {
    return null;
  }
}

function parseWizard(raw: string | null | undefined): WizardProgress | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WizardProgress;
    return typeof parsed?.jobId === 'number' && typeof parsed?.step === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function parseDrafts(raw: string | null | undefined): TailoringPassDrafts | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TailoringPassDrafts;
    if (typeof parsed?.jobId !== 'number' || !Array.isArray(parsed.ids)) return null;
    return { jobId: parsed.jobId, ids: parsed.ids.filter((id) => typeof id === 'number') };
  } catch {
    return null;
  }
}

/**
 * Hydrates the root UI-state services once, then mirrors them back to
 * session storage. Constructed from the shell so it exists before any page
 * reads the signals.
 */
@Injectable({ providedIn: 'root' })
export class BrowserUiState {
  private readonly wizard = inject(WizardProgressService);
  private readonly drafts = inject(TailoringPassDraftsService);

  constructor() {
    const wizard = readWizardProgress();
    if (wizard) this.wizard.hydrate(wizard);
    const drafts = readTailoringPassDrafts();
    if (drafts) this.drafts.hydrate(drafts);

    effect(() => persistWizardProgress(this.wizard.progress()));
    effect(() => persistTailoringPassDrafts(this.drafts.current()));
  }
}

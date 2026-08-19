import { Injectable, inject, signal } from '@angular/core';
import { SystemGateway } from '@applye/data';
import {
  CoverLetterContent,
  CvContent,
  DocumentLibraryItem,
  SupportedLanguage,
  cvContentToMd,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DocumentRegionTag } from './job-document-defaults';

export type FinalCheckStatus =
  'not_run' | 'pass' | 'needs_review' | 'strong' | 'needs_edits' | 'valid' | 'rescore' | 'outdated';

export interface FinalChecks {
  inputHash: string;
  ats: FinalCheckStatus;
  hr: FinalCheckStatus;
  fit: FinalCheckStatus;
  notes: string[];
}

/** Everything the checks are computed against. Owned by the caller and passed
 * per call, so there is no second copy of the linked documents to keep in sync. */
export interface FinalCheckInputs {
  cv: DocumentLibraryItem | null;
  coverLetter: DocumentLibraryItem | null;
  jdText: string;
  language: SupportedLanguage;
  region: DocumentRegionTag;
}

/**
 * The wizard's "final checks" step, hoisted out of the jobs page component.
 *
 * Deliberately token-free: every rule here is local text analysis, so the step
 * costs nothing to re-run. `inputHash` is what makes the result falsifiable -
 * it fingerprints the exact documents and settings the checks were computed
 * against, so editing a document afterwards marks the result outdated instead
 * of leaving a stale green tick on screen.
 *
 * The same hash doubles as the sessionStorage key that survives the round trip
 * into the document editor and back.
 *
 * That storage is reached through `globalThis` rather than through the injected
 * `DOCUMENT`, which is what lets this live in `libs/application`. Not a
 * loosening of the layer's DOM rule but the rule as `ADR-0005` amendment
 * thirty-three already settled it for `sidebarCollapsed`: browser storage is
 * screen state that happens to outlive the session, not view.
 */
@Injectable()
export class FinalChecksService {
  private readonly db = inject(SystemGateway);
  private readonly i18n = inject(TranslateService);

  private readonly t = this.i18n.t;

  readonly checks = signal<FinalChecks | null>(null);
  readonly outdated = signal(false);

  /**
   * Set when a document's stored content could not be read, so the checks below
   * ran on nothing rather than on its text. Without it a corrupt row produced a
   * confident set of red ticks that looked like a verdict on the document.
   */
  readonly unreadableDocuments = signal<string[]>([]);

  /** Clears the signals - a fresh job, or a wizard reset. */
  reset(): void {
    this.checks.set(null);
    this.outdated.set(false);
    this.unreadableDocuments.set([]);
  }

  statusKey(status: FinalCheckStatus): string {
    return `jobs.wizard.final_check_${status}`;
  }

  /** Fingerprints the documents and settings the checks are computed against. */
  documentsHash(inputs: FinalCheckInputs): Promise<string> {
    const { cv, coverLetter } = inputs;
    return this.db.hashText(
      JSON.stringify({
        cv: cv
          ? {
              label: cv.label ?? '',
              contentJson: cv.contentJson ?? '',
              language: cv.language ?? '',
              regionTag: cv.regionTag ?? '',
            }
          : null,
        coverLetter: coverLetter
          ? {
              label: coverLetter.label ?? '',
              contentJson: coverLetter.contentJson ?? '',
              language: coverLetter.language ?? '',
              regionTag: coverLetter.regionTag ?? '',
            }
          : null,
        language: inputs.language,
        region: inputs.region,
      }),
    );
  }

  async run(inputs: FinalCheckInputs): Promise<void> {
    const hash = await this.documentsHash(inputs);
    // Re-run from scratch: last run's unreadable documents may have been fixed.
    this.unreadableDocuments.set([]);
    const cvText = this.documentText(inputs.cv);
    const letterText = this.documentText(inputs.coverLetter);
    const jobText = inputs.jdText.toLowerCase();
    const keywords = Array.from(new Set(jobText.match(/[a-zäöüß]{5,}/gi) ?? [])).slice(0, 24);
    const overlap = keywords.filter((word) =>
      cvText.toLowerCase().includes(word.toLowerCase()),
    ).length;
    const cvReasonable = cvText.trim().length >= 900;
    const hasSettings = !!inputs.language && !!inputs.region;
    const notes: string[] = [];

    if (!inputs.cv) notes.push(this.t()('jobs.wizard.final_note_missing_cv'));
    if (!inputs.coverLetter) notes.push(this.t()('jobs.wizard.final_note_missing_cover_letter'));
    if (inputs.cv && !cvReasonable) notes.push(this.t()('jobs.wizard.final_note_short_cv'));
    if (keywords.length && overlap < Math.min(4, keywords.length)) {
      notes.push(this.t()('jobs.wizard.final_note_keyword_overlap'));
    }
    if (!hasSettings) notes.push(this.t()('jobs.wizard.final_note_market_language'));
    if (letterText && letterText.length < 500) {
      notes.push(this.t()('jobs.wizard.final_note_short_cover_letter'));
    }

    this.checks.set({
      inputHash: hash,
      ats: inputs.cv && cvReasonable && hasSettings ? 'pass' : 'needs_review',
      hr: notes.length <= 1 ? 'strong' : 'needs_edits',
      fit: this.outdated() ? 'rescore' : 'valid',
      notes,
    });
    this.outdated.set(false);
  }

  /** True when a re-tailor would plausibly move the result, so the step can
   * offer it. Never while the checks are outdated - rerun them first. */
  needRetailor(cv: DocumentLibraryItem | null): boolean {
    const checks = this.checks();
    if (!checks || this.outdated()) return false;
    return !!cv && (checks.ats === 'needs_review' || checks.fit === 'rescore');
  }

  /** Re-hashes the current documents and flags the stored result stale if they moved. */
  async refreshFreshness(inputs: FinalCheckInputs): Promise<void> {
    const checks = this.checks();
    if (!checks) {
      this.outdated.set(false);
      return;
    }
    this.outdated.set((await this.documentsHash(inputs)) !== checks.inputHash);
  }

  /** Parks the current result under `reviewHash` for the trip into the
   * document editor, which destroys this page component. */
  storeForReturn(reviewHash: string): void {
    const checks = this.checks();
    const storage = globalThis.sessionStorage;
    if (!checks || !storage) return;
    storage.setItem(`applye:wizardFinalChecks:${reviewHash}`, JSON.stringify(checks));
  }

  restoreAfterReturn(reviewHash: string): FinalChecks | null {
    const storage = globalThis.sessionStorage;
    const raw = storage?.getItem(`applye:wizardFinalChecks:${reviewHash}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as FinalChecks;
    } catch {
      return null;
    }
  }

  /**
   * The plain text of a stored document, or `''` when it cannot be read.
   *
   * Returning the raw `contentJson` on a parse failure was worse than returning
   * nothing: the keyword overlap and the length check then ran against JSON
   * syntax, which is long and full of words, so a corrupt document scored as a
   * plausible one. An empty string fails those checks honestly, and the
   * document is named in `unreadableDocuments` so the step can say why.
   */
  private documentText(item: DocumentLibraryItem | null): string {
    if (!item?.contentJson) return '';
    try {
      if (item.docType === 'cv') return cvContentToMd(JSON.parse(item.contentJson) as CvContent);
      const content = JSON.parse(item.contentJson) as CoverLetterContent;
      return [
        content.subject,
        content.greeting,
        ...(content.bodyParagraphs ?? []),
        content.closing,
        content.signature,
      ]
        .filter(Boolean)
        .join('\n\n');
    } catch {
      this.unreadableDocuments.update((names) =>
        names.includes(item.docType) ? names : [...names, item.docType],
      );
      return '';
    }
  }
}

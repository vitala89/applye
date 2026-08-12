import { Injectable, inject, signal } from '@angular/core';
import { JobSourceService } from '@applye/data';
import { JobIdentityResolverService } from './job-identity-resolver.service';

export type PasteTab = 'link' | 'text';

// Clipboard heuristic (0 tokens): a plausible job description is long and
// contains at least two job-posting-shaped keywords. The read itself stays in
// the app, guarded on the modal being open; this only judges the text it is
// handed, and never auto-submits - the user reviews and clicks "Paste copied
// description" themselves.
const CLIPBOARD_MIN_LENGTH = 300;
const CLIPBOARD_KEYWORDS = [
  'responsibilities',
  'requirements',
  'qualifications',
  'experience',
  'we are looking for',
  "we're looking for",
  'apply',
  'salary',
  'skills',
  'about the role',
  "what you'll do",
  'what you will do',
  'benefits',
  'about you',
  'your profile',
  'aufgaben',
  'anforderungen',
  'qualifikation',
];

export function looksLikeJobDescription(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < CLIPBOARD_MIN_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  const matches = CLIPBOARD_KEYWORDS.reduce((n, k) => (lower.includes(k) ? n + 1 : n), 0);
  return matches >= 2;
}

/**
 * The Paste Job modal's state and its two ways of making a job: fetch from an
 * allowed open/ATS URL, or paste raw text. Both funnel into `jobPaste`.
 *
 * A submit returns the new job's id and nothing else. Closing the modal and
 * navigating stay with the page, because the modal is a single shared instance
 * the app shell owns - the store does not know it exists.
 */
@Injectable({ providedIn: 'root' })
export class PasteJobStore {
  private readonly source = inject(JobSourceService);
  private readonly identity = inject(JobIdentityResolverService);

  readonly tab = signal<PasteTab>('link');

  // From link
  readonly linkUrl = signal('');
  readonly linkBusy = signal(false);
  readonly linkError = signal('');
  readonly closedBoardName = signal<string | null>(null);
  readonly isUnknownDomain = signal(false);

  // Paste text
  readonly textValue = signal('');
  readonly textBusy = signal(false);
  readonly textError = signal('');

  // Clipboard helper - never auto-fills, only offers.
  readonly clipboardOffer = signal('');

  setTab(next: PasteTab): void {
    this.tab.set(next);
  }

  reset(): void {
    this.tab.set('link');
    this.linkUrl.set('');
    this.linkBusy.set(false);
    this.linkError.set('');
    this.closedBoardName.set(null);
    this.isUnknownDomain.set(false);
    this.textValue.set('');
    this.textBusy.set(false);
    this.textError.set('');
    this.clipboardOffer.set('');
  }

  /**
   * Fetch and create from the URL on the link tab. Returns the new job's id, or
   * null when the URL could not be used - in which case the reason is on
   * `closedBoardName`, `isUnknownDomain` or `linkError`, all of which the link
   * tab renders. Refusing does **not** move the user to the text tab: the
   * explanation and the "Open in browser" button live on the tab they are on,
   * so switching away hid the answer.
   */
  async submitLink(): Promise<number | null> {
    const url = this.linkUrl().trim();
    if (!url || this.linkBusy()) return null;
    this.linkBusy.set(true);
    this.linkError.set('');
    this.closedBoardName.set(null);
    this.isUnknownDomain.set(false);
    try {
      const classification = await this.source.classifyJobUrl(url);
      if (classification.kind === 'allowed') {
        const fetched = await this.source.fetchJobFromUrl(url);
        // `authoritative` (the default): these came back as structured fields
        // from the board, which beats anything parsed out of the prose.
        const job = await this.source.jobPaste(
          fetched.jdText,
          fetched.title,
          fetched.company,
          'authoritative',
        );
        this.identity.start(job);
        return job.id;
      }
      if (classification.kind === 'closed') {
        this.closedBoardName.set(classification.boardName);
      } else {
        this.isUnknownDomain.set(true);
      }
      return null;
    } catch (e) {
      this.linkError.set(String(e));
      return null;
    } finally {
      this.linkBusy.set(false);
    }
  }

  /** Create from the pasted text. Returns the new job's id, or null on failure,
   * with the reason on `textError`. */
  async submitText(): Promise<number | null> {
    const text = this.textValue().trim();
    if (!text || this.textBusy()) return null;
    this.textBusy.set(true);
    this.textError.set('');
    try {
      const job = await this.source.jobPaste(text);
      // Same chain as Parse & filter, for the same reason: this is the other
      // way a job is made out of raw text, and a user who pasted a posting the
      // rules could not read should not have to find a second button and press
      // it to be asked. The job page they land on raises the dialog.
      this.identity.start(job);
      return job.id;
    } catch (e) {
      this.textError.set(String(e));
      return null;
    } finally {
      this.textBusy.set(false);
    }
  }

  /** Offer clipboard text the user may want, or nothing when it does not look
   * like a posting. The caller has already decided it was allowed to read. */
  offerClipboardText(text: string | null): void {
    this.clipboardOffer.set(text && looksLikeJobDescription(text) ? text : '');
  }

  useClipboardText(): void {
    const text = this.clipboardOffer();
    if (!text) return;
    this.textValue.set(text);
    this.tab.set('text');
    this.clipboardOffer.set('');
  }
}

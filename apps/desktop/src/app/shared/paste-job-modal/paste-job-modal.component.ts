import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Clipboard,
  ClipboardPaste,
  ExternalLink,
  FileText,
  Link,
  LucideAngularModule,
  X,
} from 'lucide-angular';
import { DbService, JobSourceService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { PasteJobModalService } from './paste-job-modal.service';

type PasteTab = 'link' | 'text';

// Clipboard heuristic (0 tokens): a plausible job description is long and
// contains at least two job-posting-shaped keywords. Never reads more than
// this one clipboard check, never auto-submits - the user reviews and
// clicks "Paste copied description" themselves.
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

function looksLikeJobDescription(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < CLIPBOARD_MIN_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  const matches = CLIPBOARD_KEYWORDS.reduce((n, k) => (lower.includes(k) ? n + 1 : n), 0);
  return matches >= 2;
}

// Single shared "Paste Job" modal (topbar + My Jobs both open this same
// instance via PasteJobModalService). Two modes: fetch from an allowed
// open/ATS URL, or paste raw text - both funnel into the existing
// job_paste pipeline (hard filter + legitimacy check), 0 duplication.
@Component({
  selector: 'app-paste-job-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './paste-job-modal.component.html',
  styleUrl: './paste-job-modal.component.scss',
})
export class PasteJobModalComponent {
  private readonly db = inject(DbService);
  private readonly source = inject(JobSourceService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  protected readonly modal = inject(PasteJobModalService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    link: Link,
    text: FileText,
    open: ExternalLink,
    clipboard: Clipboard,
    clipboardPaste: ClipboardPaste,
    close: X,
  };

  protected readonly tab = signal<PasteTab>('link');

  // From link
  protected readonly linkUrl = signal('');
  protected readonly linkBusy = signal(false);
  protected readonly linkError = signal('');
  protected readonly closedBoardName = signal<string | null>(null);
  protected readonly isUnknownDomain = signal(false);

  // Paste text
  protected readonly textValue = signal('');
  protected readonly textBusy = signal(false);
  protected readonly textError = signal('');

  // Clipboard helper - never auto-fills, only offers.
  protected readonly clipboardOffer = signal('');

  protected close(): void {
    this.modal.close();
    this.resetState();
  }

  // Only close when the backdrop itself is clicked, not bubbled clicks from
  // inside the dialog (the inner .modal has no click handler of its own).
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  private resetState(): void {
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

  protected setTab(next: PasteTab): void {
    this.tab.set(next);
  }

  protected closedWarningTitle(): string {
    const board = this.closedBoardName();
    return board ? this.t()('pasteModal.closed_title').replace('{board}', board) : '';
  }

  protected closedWarningBody(): string {
    const board = this.closedBoardName();
    return board
      ? this.t()('pasteModal.closed_body').replace('{board}', board)
      : this.t()('pasteModal.unknown_body');
  }

  protected async submitLink(): Promise<void> {
    const url = this.linkUrl().trim();
    if (!url || this.linkBusy()) return;
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
        this.close();
        void this.router.navigate(['/jobs', job.id]);
        return;
      }
      if (classification.kind === 'closed') {
        this.closedBoardName.set(classification.boardName);
      } else {
        this.isUnknownDomain.set(true);
      }
      this.tab.set('text');
    } catch (e) {
      this.linkError.set(String(e));
    } finally {
      this.linkBusy.set(false);
    }
  }

  protected async openInBrowser(): Promise<void> {
    const url = this.linkUrl().trim();
    if (!url) return;
    try {
      await openUrl(url);
    } catch {
      // Best-effort: if no default browser handler exists, the OS/opener
      // surfaces its own error; there's nothing more useful to show here.
    }
  }

  protected async submitText(): Promise<void> {
    const text = this.textValue().trim();
    if (!text || this.textBusy()) return;
    this.textBusy.set(true);
    this.textError.set('');
    try {
      const job = await this.source.jobPaste(text);
      this.close();
      void this.router.navigate(['/jobs', job.id]);
    } catch (e) {
      this.textError.set(String(e));
    } finally {
      this.textBusy.set(false);
    }
  }

  // Window focus is the practical proxy for "user switched back from their
  // browser" in a single-window desktop app. The component itself is
  // mounted once at the shell root (so both entry points share it), so this
  // listener is live even when closed - guard explicitly on modal state so
  // the clipboard is only ever read while the paste modal is actually open.
  @HostListener('window:focus')
  protected onWindowFocus(): void {
    if (!this.modal.isOpen()) return;
    void this.checkClipboard();
  }

  protected async checkClipboard(): Promise<void> {
    try {
      const text = await readText();
      this.clipboardOffer.set(text && looksLikeJobDescription(text) ? text : '');
    } catch {
      // No text on the clipboard (e.g. an image) - nothing to offer.
      this.clipboardOffer.set('');
    }
  }

  protected useClipboardText(): void {
    const text = this.clipboardOffer();
    if (!text) return;
    this.textValue.set(text);
    this.tab.set('text');
    this.clipboardOffer.set('');
  }
}

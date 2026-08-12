import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
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
import { TranslateService } from '@applye/i18n';
import { openUrl } from '@tauri-apps/plugin-opener';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { PasteJobModalService } from './paste-job-modal.service';
import { PasteJobStore, PasteTab } from '@applye/application';

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
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  /** Root-provided: the modal is a single shared instance, so its state is too. */
  protected readonly store = inject(PasteJobStore);
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

  protected close(): void {
    this.modal.close();
    this.store.reset();
  }

  // Only close when the backdrop itself is clicked, not bubbled clicks from
  // inside the dialog (the inner .modal has no click handler of its own).
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  protected setTab(next: PasteTab): void {
    this.store.setTab(next);
  }

  protected closedWarningTitle(): string {
    const board = this.store.closedBoardName();
    return board ? this.t()('pasteModal.closed_title').replace('{board}', board) : '';
  }

  protected closedWarningBody(): string {
    const board = this.store.closedBoardName();
    return board
      ? this.t()('pasteModal.closed_body').replace('{board}', board)
      : this.t()('pasteModal.unknown_body');
  }

  protected async submitLink(): Promise<void> {
    const jobId = await this.store.submitLink();
    if (jobId != null) this.openJob(jobId);
  }

  protected async openInBrowser(): Promise<void> {
    const url = this.store.linkUrl().trim();
    if (!url) return;
    try {
      await openUrl(url);
    } catch {
      // Best-effort: if no default browser handler exists, the OS/opener
      // surfaces its own error; there's nothing more useful to show here.
    }
  }

  protected async submitText(): Promise<void> {
    const jobId = await this.store.submitText();
    if (jobId != null) this.openJob(jobId);
  }

  /** Closing and navigating stay here: the modal is the shell's, not the
   * store's. */
  private openJob(jobId: number): void {
    this.close();
    void this.router.navigate(['/jobs', jobId]);
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
      this.store.offerClipboardText(await readText());
    } catch {
      // No text on the clipboard (e.g. an image) - nothing to offer.
      this.store.offerClipboardText(null);
    }
  }

  protected useClipboardText(): void {
    this.store.useClipboardText();
  }
}

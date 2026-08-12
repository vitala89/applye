import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, LucideAngularModule, Save, Check, Eye, Pencil, Sparkles } from 'lucide-angular';
import { COVER_LETTER_BLOCK_KEYS, resolvePageSettings } from '@applye/core';
import {
  CoverLetterAiStore,
  CoverLetterContentStore,
  CoverLetterDocumentStore,
  CoverLetterNoProfileError,
  CoverLetterStyleStore,
  CoverLetterTextField,
  paragraphStyleKey,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '@applye/application';
import { CoverLetterPreviewComponent } from '../cover-letter-preview/cover-letter-preview.component';

import { CoverLetterBlockComponent } from './cover-letter-block/cover-letter-block.component';
import { CoverLetterAvailabilityCardComponent } from './cover-letter-availability-card/cover-letter-availability-card.component';
import { CoverLetterBodyParagraphsComponent } from './cover-letter-body-paragraphs/cover-letter-body-paragraphs.component';
import { CoverLetterRecipientBlockComponent } from './cover-letter-recipient-block/cover-letter-recipient-block.component';
import { CoverLetterSettingsCardComponent } from './cover-letter-settings-card/cover-letter-settings-card.component';
import { CoverLetterStyleCardComponent } from './cover-letter-style-card/cover-letter-style-card.component';
import { CoverLetterStylePopoverComponent } from './cover-letter-style-popover/cover-letter-style-popover.component';

@Component({
  selector: 'app-cover-letter-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    ButtonDirective,
    CoverLetterPreviewComponent,
    CoverLetterBlockComponent,
    CoverLetterAvailabilityCardComponent,
    CoverLetterBodyParagraphsComponent,
    CoverLetterRecipientBlockComponent,
    CoverLetterSettingsCardComponent,
    CoverLetterStyleCardComponent,
    CoverLetterStylePopoverComponent,
  ],
  templateUrl: './cover-letter-detail.component.html',
  styleUrl: './cover-letter-detail.component.scss',
  providers: [
    CoverLetterContentStore,
    CoverLetterStyleStore,
    CoverLetterDocumentStore,
    CoverLetterAiStore,
  ],
})
export class CoverLetterDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    save: Save,
    check: Check,
    preview: Eye,
    edit: Pencil,
    draft: Sparkles,
  };
  protected readonly blockKeys = COVER_LETTER_BLOCK_KEYS;

  /** Which block/paragraph Style popover is open, if any - only one at a
   * time. A `CoverLetterBlockKey` for a block, or `body_<i>` for a paragraph. */
  readonly openStyleKey = signal<string | null>(null);

  readonly previewMode = signal(false);

  /** The row itself - what was loaded, the row-level fields the editor changes,
   * and the one write that persists all three stores' state. It owns the
   * gateway calls; this page owns the toast and the navigation that follow
   * them (ADR-0005, amendment three). */
  protected readonly docs = inject(CoverLetterDocumentStore);

  /** Read-only aliases onto the document store, for the same reason as the
   * content aliases below: the template is over budget and prefixing its
   * bindings would grow a file the ratchet will not let grow. */
  readonly loading = this.docs.loading;
  readonly loadError = this.docs.loadError;
  readonly doc = this.docs.doc;
  readonly label = this.docs.label;
  readonly saving = this.docs.saving;

  /** The letter itself - its blocks, its paragraphs and the application
   * answers. Touches no gateway: the row it belongs to is loaded and saved
   * elsewhere. */
  protected readonly letter = inject(CoverLetterContentStore);

  /**
   * Read-only aliases onto the content store, for the bindings the template
   * repeats most. Same device as `t` above, and they alias rather than hold:
   * every write still goes through the store's own methods.
   *
   * They exist because this template is **669/300** and the ratchet refuses to
   * let an over-budget file grow - prefixing forty-odd bindings with `letter.`
   * re-wraps them and adds lines to a file that may not gain any. Cutting the
   * template is a named next phase; this keeps it byte-identical meanwhile.
   */
  protected readonly content = this.letter.content;
  protected readonly wordCount = this.letter.wordCount;
  protected readonly wordStatus = this.letter.wordStatus;

  /** The letter's visual style and its debounced ATS safety check. Not a
   * variant of `CvStyleStore`: a cover letter has no themes (ADR-0005,
   * amendment twelve). Page geometry stays here, because it clamps through the
   * app-local `resolvePageSettings`. */
  protected readonly styles = inject(CoverLetterStyleStore);
  protected readonly style = this.styles.style;

  readonly justSaved = signal(false);

  /** Drafting the whole letter and regenerating one block. Owns both in-flight
   * flags and both writes into the content store; this page owns only the toast
   * that reports a failure (ADR-0005, amendment three). */
  protected readonly ai = inject(CoverLetterAiStore);
  readonly drafting = this.ai.drafting;
  readonly regeneratingBlock = this.ai.regeneratingBlock;

  /** Runs one AI path and reports its failure. The store raises a typed error
   * rather than a sentence (ADR-0005, amendment three), so the wording the user
   * reads is chosen here, where the translations are - once, for both paths. */
  private async runAi(op: () => Promise<unknown>): Promise<void> {
    try {
      await op();
    } catch (e) {
      this.toast.error(
        e instanceof CoverLetterNoProfileError
          ? this.t()('documents.cv_generate_no_profile')
          : String(e),
      );
    }
  }

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    await this.docs.load(Number(this.route.snapshot.paramMap.get('id')));
    if (this.loadError()) return;
    // Opened from the apply wizard's "Review letter": show the rendered result
    // first, not the raw editor. The user can toggle to Edit. Route state, so
    // it stays on the page rather than in the store.
    if (this.route.snapshot.queryParamMap.get('preview') === '1') {
      this.previewMode.set(true);
    }
  }

  back(): void {
    if (this.shouldReturnToApplyWizard()) {
      void this.returnToApplyWizard(false);
      return;
    }
    const jobId = this.returnJobId();
    if (jobId) {
      void this.router.navigate(['/jobs', jobId]);
      return;
    }
    void this.router.navigate(['/documents'], { queryParams: { tab: 'cover-letter' } });
  }

  /** Label for the back button: the job it returns to, or plain "Documents". */
  backLabel(): string {
    const jobLabel = this.route.snapshot.queryParamMap.get('jobLabel');
    return this.returnJobId() && jobLabel
      ? this.t()('documents.cover_letter_back_to_job').replace('{job}', jobLabel)
      : this.t()('documents.cover_letter_back_to_documents');
  }

  private shouldReturnToApplyWizard(): boolean {
    return this.route.snapshot.queryParamMap.get('returnTo') === 'applyWizard';
  }

  /** Job id to return to when opened from My Jobs (returnTo=myJobs), else null. */
  private returnJobId(): string | null {
    const params = this.route.snapshot.queryParamMap;
    return params.get('returnTo') === 'myJobs' ? params.get('jobId') : null;
  }

  private returnToApplyWizard(documentSaved: boolean): Promise<boolean> {
    const params = this.route.snapshot.queryParamMap;
    const jobId = params.get('jobId');
    if (!jobId) {
      return this.router.navigate(['/documents'], { queryParams: { tab: 'cover-letter' } });
    }
    return this.router.navigate(['/jobs', jobId], {
      queryParams: {
        returnTo: 'applyWizard',
        wizardStep: 'documents',
        documentType: 'cover_letter',
        documentId: this.doc()?.id ?? params.get('documentId'),
        reviewHash: params.get('reviewHash'),
        documentSaved: documentSaved ? '1' : '0',
      },
    });
  }

  toggleStylePopover(key: string): void {
    this.openStyleKey.set(this.openStyleKey() === key ? null : key);
  }

  /** Per-block collapse state for the content-block accordion - session only
   * (not persisted); every block starts expanded (an empty set means nothing
   * is collapsed). Keyed by the same string keys as `openStyleKey`/
   * `hasCustomStyle` (`'recipient'`, `'date'`, ..., `'body'`). */
  readonly collapsedBlocks = signal<Set<string>>(new Set());

  isBlockOpen(key: string): boolean {
    return !this.collapsedBlocks().has(key);
  }

  toggleBlockCollapse(key: string): void {
    const next = new Set(this.collapsedBlocks());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsedBlocks.set(next);
  }

  hasCustomStyle(key: string): boolean {
    return this.styles.hasCustomStyle(key);
  }

  updateField(field: CoverLetterTextField, value: string): void {
    this.letter.updateField(field, value);
  }

  /**
   * Removing a paragraph touches three owners, which is why it stays here while
   * the block itself owns its text: the content store drops the paragraph and
   * reports how many are left, the open-popover key is page view state, and the
   * `body_<i>` style overrides above the removal have to shift down so they keep
   * pointing at the paragraph the user set them on.
   */
  removeParagraph(index: number): void {
    const remaining = this.letter.removeParagraph(index);
    if (this.openStyleKey() === paragraphStyleKey(index)) this.openStyleKey.set(null);
    this.styles.reindexAfterParagraphRemoved(index, remaining);
  }

  /** Full-letter AI draft - fills every block in one pass honoring the current
   * tone + length. Populates the editor only; the user still reviews and Saves
   * (AI assists, the user decides - never auto-applied). */
  async draftWithAI(): Promise<void> {
    await this.runAi(() => this.ai.draftWithAI());
  }

  async regenerateBlock(blockKey: string, index?: number): Promise<void> {
    await this.runAi(() => this.ai.regenerateBlock(blockKey, index));
  }

  /**
   * WYSIWYG PDF export via the OS print dialog. Injects a `@page` rule sized
   * from the current page settings, toggles `printing-cv` on `<body>` so the
   * print stylesheet isolates `.letter-sheet`, then invokes the standard DOM
   * `window.print()`. Tauri's webview plugin already overrides
   * `window.print` on macOS to route through its native print command (gated
   * by the `core:webview:allow-print` capability); on Windows/Linux the
   * webview's built-in print is used directly - no `@tauri-apps/api` import
   * is needed or available for this in the installed SDK version. Mirrors
   * `exportPdfWysiwyg` on `CvDetailComponent`.
   */
  async exportPdfWysiwyg(): Promise<void> {
    const r = resolvePageSettings(this.style().page);
    const rule =
      `@page { size: ${r.widthMm}mm ${r.heightMm}mm;` +
      ` margin: ${r.margin.top}mm ${r.margin.right}mm ${r.margin.bottom}mm ${r.margin.left}mm; }`;
    let el = document.getElementById('wysiwyg-page-rule') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'wysiwyg-page-rule';
      document.head.appendChild(el);
    }
    el.textContent = rule;
    // Native macOS print (Tauri) is async: window.print() returns before the
    // page is rendered for print, so removing the class synchronously would
    // strip the print styles before the snapshot and capture the whole app.
    // Keep the class on and clear it on `afterprint`. Every `body.printing-cv`
    // rule lives inside `@media print`, so a lingering class has no on-screen
    // effect if `afterprint` never fires.
    const clearPrinting = (): void => {
      document.body.classList.remove('printing-cv');
      window.removeEventListener('afterprint', clearPrinting);
    };
    window.addEventListener('afterprint', clearPrinting);
    document.body.classList.add('printing-cv');
    window.print();
  }

  async save(): Promise<void> {
    try {
      // `null` means no write happened - no document, or a save already in
      // flight - so there is nothing to confirm to the user either.
      if (!(await this.docs.save())) return;
      this.justSaved.set(true);
      this.toast.success(this.t()('documents.cover_letter_saved'));
      if (this.shouldReturnToApplyWizard()) {
        await this.returnToApplyWizard(true);
        return;
      }
      setTimeout(() => this.justSaved.set(false), 2500);
    } catch (e) {
      this.toast.error(String(e));
    }
  }
}

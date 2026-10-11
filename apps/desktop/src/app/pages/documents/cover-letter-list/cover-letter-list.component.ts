import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Copy, Download, LucideAngularModule, Trash2, WandSparkles } from 'lucide-angular';
import type { DocumentLibraryItem, SupportedLanguage } from '@applye/core';
import {
  CoverLetterGenerateStore,
  CoverLetterListStore,
  suggestCoverLetterFilename,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import { DocumentRowActionsComponent } from '../document-row-actions/document-row-actions.component';

const REGION_TAGS = ['de', 'us', 'uk', 'generic'];
const LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

@Component({
  selector: 'app-cover-letter-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective, DocumentRowActionsComponent],
  templateUrl: './cover-letter-list.component.html',
  styleUrl: './cover-letter-list.component.scss',
  providers: [CoverLetterListStore, CoverLetterGenerateStore],
})
export class CoverLetterListComponent {
  protected readonly list = inject(CoverLetterListStore);
  protected readonly gen = inject(CoverLetterGenerateStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    generate: WandSparkles,
    duplicate: Copy,
    export: Download,
    trash: Trash2,
  };

  protected readonly regionTags = REGION_TAGS;
  protected readonly languages = LANGUAGES;

  constructor() {
    void this.load();
  }

  /** The page owns the toast, so it owns the load call too. */
  async load(): Promise<void> {
    if (!(await this.list.load())) this.toast.error(this.list.error());
  }

  open(id: number): void {
    void this.router.navigate(['/documents/cover-letter', id]);
  }

  /** The store hands over the facts; a separator is presentation. */
  linkedJobLabel(item: DocumentLibraryItem): string {
    return this.list.linkedJobFacts(item).join(' · ');
  }

  async duplicate(item: DocumentLibraryItem, event: Event): Promise<void> {
    event.stopPropagation();
    const label = `${item.label ?? this.t()('documents.cover_letter_untitled')} ${this.t()('documents.cv_copy_suffix')}`;
    if (await this.list.duplicate(item, label)) {
      this.toast.success(this.t()('documents.duplicated'));
    } else {
      this.toast.error(this.list.error());
    }
  }

  /**
   * Picking the path is the app's job - no file under `libs/` imports a Tauri
   * plugin - and the store writes the file from there.
   */
  async exportDoc(item: DocumentLibraryItem, format: 'pdf' | 'docx', event: Event): Promise<void> {
    event.stopPropagation();
    if (!format || this.list.exportBusyId() != null) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: suggestCoverLetterFilename(item.label, format) });
    if (!path) return;

    const ok = await this.list.exportDoc(item, format, path);
    if (ok === null) return;
    if (ok) this.toast.success(this.t()('documents.exported').replace('{path}', path));
    else this.toast.error(this.list.error());
  }

  requestDelete(item: DocumentLibraryItem, event: Event): void {
    event.stopPropagation();
    this.list.requestDelete(item);
  }

  onDeleteBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.list.cancelDelete();
  }

  async confirmDelete(): Promise<void> {
    const ok = await this.list.confirmDelete();
    if (ok === null) return;
    if (ok) this.toast.success(this.t()('documents.cover_letter_deleted'));
    else this.toast.error(this.list.error());
  }

  // ── Generate Cover Letter Modal ──────────────────

  /**
   * Reads the model's answer. `cleanJsonText` lives here in the app, so it is
   * handed to the store rather than imported by it (ADR-0005, amendment six).
   */
  async confirmGenerate(): Promise<void> {
    const company = this.gen.selectedCompany(this.list.trackedJobs());
    const documentLabel = company
      ? `${company} - ${this.t()('documents.tab_cover_letter')}`
      : `${this.t()('documents.cover_letter_untitled')} - ${this.gen.regionTag().toUpperCase()}`;

    const outcome = await this.gen.generate(this.list.trackedJobs(), { documentLabel });
    switch (outcome) {
      case 'busy':
        return;
      case 'no-profile':
        this.toast.error(this.t()('documents.cv_generate_no_profile'));
        return;
      case 'bad-json':
        this.toast.error(
          `${this.t()('common.error')}: Invalid JSON returned by AI. ${this.gen.error()}`,
        );
        return;
      case 'failed':
        this.toast.error(this.gen.error());
        return;
      case 'generated': {
        await this.load();
        this.toast.success(this.t()('documents.cover_letter_generated'));
        const id = this.gen.createdId();
        if (id != null) this.open(id);
      }
    }
  }
}

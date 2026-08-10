import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Copy, Download, LucideAngularModule, Trash2, Upload, WandSparkles } from 'lucide-angular';
import type { DocumentLibraryItem, SupportedLanguage } from '@applye/core';
import {
  CvGenerateStore,
  CvImportStore,
  CvListStore,
  suggestCvFilename,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import { DocumentRowActionsComponent } from '../document-row-actions/document-row-actions.component';
import { buildCvContent, parseCvSkillResponse, cleanJsonText } from '../cv-content.util';

const REGION_TAGS = ['de', 'us', 'uk', 'generic'];
const LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

@Component({
  selector: 'app-cv-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective, DocumentRowActionsComponent],
  templateUrl: './cv-list.component.html',
  styleUrl: './cv-list.component.scss',
  providers: [CvListStore, CvImportStore, CvGenerateStore],
})
export class CvListComponent {
  protected readonly list = inject(CvListStore);
  protected readonly imp = inject(CvImportStore);
  protected readonly gen = inject(CvGenerateStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    upload: Upload,
    generate: WandSparkles,
    duplicate: Copy,
    export: Download,
    trash: Trash2,
  };

  protected readonly regionTags = REGION_TAGS;
  protected readonly languages = LANGUAGES;

  /**
   * Reading a skill's answer and laying it out against a template live here in
   * the app (`cv-parse.util.ts`, `cv-content.util.ts`), so they are handed to
   * the stores rather than imported by them (ADR-0005, amendment six).
   */
  private readonly codec = {
    parse: parseCvSkillResponse,
    buildContent: buildCvContent,
    cleanScoring: cleanJsonText,
  };

  constructor() {
    void this.load();
  }

  /** The page owns the toast, so it owns the load call too. */
  async load(): Promise<void> {
    if (!(await this.list.load())) this.toast.error(this.list.error());
  }

  open(id: number): void {
    void this.router.navigate(['/documents/cv', id]);
  }

  /** The store hands over the facts; a separator is presentation. */
  linkedJobLabel(item: DocumentLibraryItem): string {
    return this.list.linkedJobFacts(item).join(' · ');
  }

  async duplicate(item: DocumentLibraryItem, event: Event): Promise<void> {
    event.stopPropagation();
    const label = `${item.label ?? this.t()('documents.cv_untitled')} ${this.t()('documents.cv_copy_suffix')}`;
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
    const path = await save({ defaultPath: suggestCvFilename(item, format) });
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
    if (ok) this.toast.success(this.t()('documents.cv_deleted'));
    else this.toast.error(this.list.error());
  }

  // ── Import own CV (upload → cv-import skill → preview → save) ─────────────

  async pickAndParse(): Promise<void> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'CV', extensions: ['docx', 'pdf'] }],
    });
    if (!path || Array.isArray(path)) return;

    const outcome = await this.imp.parseFile(
      path,
      this.list.cvs(),
      this.list.templates(),
      { untitled: this.t()('documents.cv_untitled') },
      this.codec,
    );
    switch (outcome) {
      case 'busy':
      case 'parsed':
        return;
      case 'existing': {
        const id = this.imp.existingId();
        if (id != null) this.open(id);
        return;
      }
      case 'failed':
        this.toast.error(this.imp.error());
    }
  }

  async confirmImport(): Promise<void> {
    const outcome = await this.imp.save(this.list.templates(), this.codec);
    if (outcome === 'busy') return;
    if (outcome === 'failed') {
      this.toast.error(this.imp.error());
      return;
    }
    await this.load();
    this.toast.success(this.t()('documents.cv_import_done'));
  }

  // ── Generate baseline (profile + template → cv-generate-baseline skill) ───

  async openGenerate(): Promise<void> {
    if (!(await this.gen.start(this.list.templates()))) this.toast.error(this.gen.error());
  }

  async confirmGenerate(): Promise<void> {
    const job = this.gen.selectedJob(this.list.trackedJobs());
    const untitled = this.t()('documents.cv_untitled');
    const documentLabel = job
      ? `${job.title ?? untitled} - ${job.company ?? 'Job'}`
      : `${this.gen.archetypeTag() || untitled} - ${this.gen.regionTag().toUpperCase()}`;

    const outcome = await this.gen.generate(
      this.list.trackedJobs(),
      this.list.templates(),
      { documentLabel },
      this.codec,
    );
    switch (outcome) {
      case 'busy':
        return;
      case 'no-profile':
        this.toast.error(this.t()('documents.cv_generate_no_profile'));
        return;
      // `parseCvSkillResponse` already says what was wrong with the answer, so
      // the page has nothing truer to add than what the store carries.
      case 'bad-json':
      case 'failed':
        this.toast.error(this.gen.error());
        return;
      case 'generated': {
        await this.load();
        this.toast.success(this.t()('documents.cv_generated'));
        const id = this.gen.createdId();
        if (id != null) this.open(id);
      }
    }
  }
}

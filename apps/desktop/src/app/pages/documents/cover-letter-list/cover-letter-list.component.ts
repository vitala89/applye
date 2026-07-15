import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Copy, Download, LucideAngularModule, Trash2, WandSparkles } from 'lucide-angular';
import type {
  Application,
  CoverLetterContent,
  DocumentLibraryItem,
  Job,
  SupportedLanguage,
} from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { cleanJsonText } from '../cv-content.util';

const REGION_TAGS = ['de', 'us', 'uk', 'generic'];
const LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

@Component({
  selector: 'app-cover-letter-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective],
  templateUrl: './cover-letter-list.component.html',
  styleUrl: './cover-letter-list.component.scss',
})
export class CoverLetterListComponent {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    generate: WandSparkles,
    duplicate: Copy,
    export: Download,
    trash: Trash2,
  };

  protected readonly regionTags = REGION_TAGS;
  protected readonly languages = LANGUAGES;

  readonly coverLetters = signal<DocumentLibraryItem[]>([]);
  readonly trackedJobs = signal<Job[]>([]);
  readonly applications = signal<Application[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);

  readonly hasCoverLetters = computed(() => this.coverLetters().length > 0);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [letters, jobs, applications] = await Promise.all([
        this.db.documentLibraryList('cover_letter'),
        this.db.listJobs(),
        this.db.listApplications(),
      ]);
      this.coverLetters.set(letters);
      this.trackedJobs.set(jobs);
      this.applications.set(applications);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  open(id: number): void {
    void this.router.navigate(['/documents/cover-letter', id]);
  }

  linkedJobLabel(item: DocumentLibraryItem): string {
    const app = this.applications().find((a) => a.coverLetterDocumentId === item.id);
    if (!app) return '';
    const job = this.trackedJobs().find((j) => j.id === app.jobId);
    return [job?.company, job?.title].filter(Boolean).join(' — ');
  }

  async duplicate(item: DocumentLibraryItem, event: Event): Promise<void> {
    event.stopPropagation();
    await this.db.documentLibraryUpsert({
      docType: 'cover_letter',
      source: item.source,
      label: `${item.label ?? this.t()('documents.cover_letter_untitled')} ${this.t()('documents.cv_copy_suffix')}`,
      contentJson: item.contentJson,
      styleJson: item.styleJson,
      regionTag: item.regionTag,
      language: item.language,
      archetypeTag: item.archetypeTag,
      isDefault: false,
    });
    await this.load();
  }

  readonly exportBusyId = signal<number | null>(null);

  async exportDoc(item: DocumentLibraryItem, format: 'pdf' | 'docx', event: Event): Promise<void> {
    event.stopPropagation();
    if (!format || this.exportBusyId() != null) return;
    // Silent export: pick a path, file is written directly — no print dialog,
    // no visible windows. PDF goes through the WYSIWYG engine (a hidden window
    // renders the editor's own preview and the OS prints it to the file), so
    // the export is pixel-identical to the editor.
    this.exportBusyId.set(item.id);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ defaultPath: this.suggestCoverLetterFilename(item, format) });
      if (!path) return;
      if (format === 'pdf') {
        await this.db.coverLetterDocumentExportPdfWysiwyg(item.id, path);
      } else {
        await this.db.coverLetterDocumentExport(item.id, format, path);
      }
    } finally {
      this.exportBusyId.set(null);
    }
  }

  private suggestCoverLetterFilename(item: DocumentLibraryItem, format: 'pdf' | 'docx'): string {
    const base = (item.label || 'cover-letter')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${base}.${format}`;
  }

  readonly deleteTarget = signal<DocumentLibraryItem | null>(null);
  readonly deleting = signal(false);

  requestDelete(item: DocumentLibraryItem, event: Event): void {
    event.stopPropagation();
    this.deleteTarget.set(item);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  onDeleteBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancelDelete();
  }

  async confirmDelete(): Promise<void> {
    const item = this.deleteTarget();
    if (!item || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.db.documentLibraryDelete(item.id);
      this.deleteTarget.set(null);
      await this.load();
    } finally {
      this.deleting.set(false);
    }
  }

  // ── Generate Cover Letter Modal ──────────────────

  readonly generateOpen = signal(false);
  readonly generateBusy = signal(false);
  readonly generateError = signal('');
  readonly generateRegionTag = signal('de');
  readonly generateLanguage = signal<SupportedLanguage>('en');
  readonly selectedJobId = signal<number | null>(null);
  readonly customJdText = signal('');

  async openGenerate(): Promise<void> {
    this.generateError.set('');
    this.selectedJobId.set(null);
    this.customJdText.set('');
    this.generateOpen.set(true);

    try {
      const settings = await this.db.getSettings();
      this.generateLanguage.set(settings.defaultDocLanguage ?? 'en');
    } catch {
      // Use fallback language
    }
  }

  cancelGenerate(): void {
    this.generateOpen.set(false);
  }

  async confirmGenerate(): Promise<void> {
    if (this.generateBusy()) return;
    this.generateBusy.set(true);
    this.generateError.set('');

    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) {
        throw new Error(this.t()('documents.cv_generate_no_profile'));
      }

      let jd = this.customJdText().trim();
      let company = '';
      if (this.selectedJobId()) {
        const job = this.trackedJobs().find((j) => j.id === this.selectedJobId());
        if (job) {
          jd = job.jdText ?? '';
          company = job.company ?? '';
        }
      }

      const rendered = await this.ai.renderSkill('cover-letter-generate', {
        profile_md: profile.fullMd,
        job_description: jd || 'General job application',
        language: this.generateLanguage(),
        section: 'all',
      });

      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.generateLanguage(),
      });

      // Parse JSON from AI response
      const rawText = cleanJsonText(res.text);

      let content: CoverLetterContent;
      try {
        content = JSON.parse(rawText);
      } catch {
        throw new Error(
          this.t()('common.error') + `: Invalid JSON returned by AI. ${res.text.slice(0, 100)}`,
        );
      }

      const label = company
        ? `${company} — ${this.t()('documents.tab_cover_letter')}`
        : `${this.t()('documents.cover_letter_untitled')} — ${this.generateRegionTag().toUpperCase()}`;

      const created = await this.db.documentLibraryUpsert({
        docType: 'cover_letter',
        source: 'generated',
        label,
        contentJson: JSON.stringify(content),
        regionTag: this.generateRegionTag(),
        language: this.generateLanguage(),
        modelUsed: settings.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });

      this.generateOpen.set(false);
      await this.load();
      this.open(created.id);
    } catch (e) {
      this.generateError.set(String(e));
    } finally {
      this.generateBusy.set(false);
    }
  }
}

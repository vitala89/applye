import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Copy, Download, LucideAngularModule, Trash2, Upload, WandSparkles } from 'lucide-angular';
import type {
  CvParsedContent,
  CvTemplate,
  DocumentLibraryItem,
  SupportedLanguage,
  Job,
  Application,
} from '@applye/core';
import { parseArchetypes, archetypeNames } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import {
  buildCvContent,
  parseCvSkillResponse,
  suggestCvFilename,
  cleanJsonText,
} from '../cv-content.util';

type ImportStep = 'pick' | 'preview' | 'done';
type GenerateStep = 'config' | 'done';

const REGION_TAGS = ['de', 'us', 'uk', 'generic'];
const LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];

@Component({
  selector: 'app-cv-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective],
  templateUrl: './cv-list.component.html',
  styleUrl: './cv-list.component.scss',
})
export class CvListComponent {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
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

  readonly cvs = signal<DocumentLibraryItem[]>([]);
  readonly templates = signal<CvTemplate[]>([]);
  readonly trackedJobs = signal<Job[]>([]);
  readonly applications = signal<Application[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);

  readonly hasCvs = computed(() => this.cvs().length > 0);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [cvs, templates, jobs, applications] = await Promise.all([
        this.db.documentLibraryList('cv'),
        this.db.cvTemplatesList(),
        this.db.listJobs(),
        this.db.listApplications(),
      ]);
      this.cvs.set(cvs);
      this.templates.set(templates);
      this.trackedJobs.set(jobs);
      this.applications.set(applications);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  open(id: number): void {
    void this.router.navigate(['/documents/cv', id]);
  }

  linkedJobLabel(item: DocumentLibraryItem): string {
    const app = this.applications().find((a) => a.cvDocumentId === item.id);
    if (!app) return '';
    const job = this.trackedJobs().find((j) => j.id === app.jobId);
    return [job?.company, job?.title].filter(Boolean).join(' — ');
  }

  async duplicate(item: DocumentLibraryItem, event: Event): Promise<void> {
    event.stopPropagation();
    await this.db.documentLibraryUpsert({
      docType: 'cv',
      source: item.source,
      label: `${item.label ?? this.t()('documents.cv_untitled')} ${this.t()('documents.cv_copy_suffix')}`,
      contentJson: item.contentJson,
      templateId: item.templateId,
      styleJson: item.styleJson,
      regionTag: item.regionTag,
      language: item.language,
      archetypeTag: item.archetypeTag,
      isDefault: false,
    });
    await this.load();
  }

  readonly exportBusyId = signal<number | null>(null);
  readonly texExportNoteOpen = signal(false);

  async exportDoc(
    item: DocumentLibraryItem,
    format: 'docx' | 'pdf' | 'tex',
    event: Event,
  ): Promise<void> {
    event.stopPropagation();
    if (!format || this.exportBusyId() != null) return;
    if (format === 'tex') this.texExportNoteOpen.set(true);
    this.exportBusyId.set(item.id);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ defaultPath: suggestCvFilename(item, format) });
      if (!path) return;
      await this.db.cvDocumentExport(item.id, format, path);
    } finally {
      this.exportBusyId.set(null);
    }
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

  // ── Import own CV (upload → cv-import skill → preview → save) ─────────────

  readonly importOpen = signal(false);
  readonly importStep = signal<ImportStep>('pick');
  readonly importBusy = signal(false);
  readonly importError = signal('');
  readonly importParsed = signal<CvParsedContent | null>(null);
  readonly importInputHash = signal('');
  readonly importLabel = signal('');
  readonly importRegionTag = signal('de');
  readonly importLanguage = signal<SupportedLanguage>('en');
  readonly importTemplateId = signal<number | null>(null);

  openImport(): void {
    this.importStep.set('pick');
    this.importError.set('');
    this.importParsed.set(null);
    this.importOpen.set(true);
  }

  cancelImport(): void {
    this.importOpen.set(false);
  }

  async pickAndParse(): Promise<void> {
    if (this.importBusy()) return;
    this.importError.set('');
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        multiple: false,
        filters: [{ name: 'CV', extensions: ['docx', 'pdf'] }],
      });
      if (!path || Array.isArray(path)) return;

      this.importBusy.set(true);
      const file = await this.db.cvImportReadFile(path);

      const existing = this.cvs().find(
        (c) => c.source === 'uploaded' && c.inputHash === file.inputHash,
      );
      if (existing) {
        this.importBusy.set(false);
        this.importOpen.set(false);
        this.open(existing.id);
        return;
      }

      const settings = await this.db.getSettings();
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-import', {
        cv_text: file.text,
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });

      const parsed = parseCvSkillResponse(res.text);
      this.importParsed.set(parsed);
      this.importInputHash.set(file.inputHash);
      this.importLabel.set(parsed.personalDetails.fullName ?? this.t()('documents.cv_untitled'));
      this.importLanguage.set(settings.defaultDocLanguage ?? 'en');
      const defaultTemplate =
        this.templates().find((tpl) => tpl.regionTag === this.importRegionTag()) ??
        this.templates()[0] ??
        null;
      this.importTemplateId.set(defaultTemplate?.id ?? null);
      this.importStep.set('preview');
    } catch (e) {
      this.importError.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.importBusy.set(false);
    }
  }

  async confirmImport(): Promise<void> {
    const parsed = this.importParsed();
    if (!parsed || this.importBusy()) return;
    this.importBusy.set(true);
    this.importError.set('');
    try {
      const template = this.templates().find((tpl) => tpl.id === this.importTemplateId()) ?? null;
      const content = buildCvContent(parsed, template);
      await this.db.documentLibraryUpsert({
        docType: 'cv',
        source: 'uploaded',
        label: this.importLabel(),
        contentJson: JSON.stringify(content),
        templateId: template?.id,
        regionTag: this.importRegionTag(),
        language: this.importLanguage(),
        inputHash: this.importInputHash(),
      });
      this.importStep.set('done');
      await this.load();
    } catch (e) {
      this.importError.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.importBusy.set(false);
    }
  }

  // ── Generate baseline (profile + template → cv-generate-baseline skill) ───

  readonly generateOpen = signal(false);
  readonly generateStep = signal<GenerateStep>('config');
  readonly generateBusy = signal(false);
  readonly generateError = signal('');
  readonly generateRegionTag = signal('de');
  readonly generateArchetypeTag = signal('');
  readonly generateLanguage = signal<SupportedLanguage>('en');
  readonly generateTemplateId = signal<number | null>(null);
  readonly selectedJobId = signal<number | null>(null);

  async openGenerate(): Promise<void> {
    this.generateStep.set('config');
    this.generateError.set('');
    this.selectedJobId.set(null);
    this.generateOpen.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.generateArchetypeTag.set(
        archetypeNames(parseArchetypes(profile?.targetArchetypes))[0] ?? '',
      );
      this.generateLanguage.set(settings.defaultDocLanguage ?? 'en');
      const defaultTemplate =
        this.templates().find((tpl) => tpl.regionTag === this.generateRegionTag()) ??
        this.templates()[0] ??
        null;
      this.generateTemplateId.set(defaultTemplate?.id ?? null);
    } catch (e) {
      this.generateError.set(String(e));
      this.toast.error(String(e));
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

      let scoringJson = profile.scoringJson ?? '{}';
      let label = `${this.generateArchetypeTag() || this.t()('documents.cv_untitled')} — ${this.generateRegionTag().toUpperCase()}`;

      if (this.selectedJobId()) {
        const job = this.trackedJobs().find((j) => j.id === this.selectedJobId());
        if (job) {
          let originalScoring = {};
          try {
            originalScoring = JSON.parse(cleanJsonText(profile.scoringJson ?? '{}'));
          } catch {
            // Ignore parse errors on profile scoring
          }
          const jobContext = {
            targetJobTitle: job.title,
            targetCompany: job.company,
            jobDescription: job.jdText,
            originalScoring,
          };
          scoringJson = JSON.stringify(jobContext);
          label = `${job.title ?? this.t()('documents.cv_untitled')} — ${job.company ?? 'Job'}`;
        }
      }

      const rendered = await this.ai.renderSkill('cv-generate-baseline', {
        profile_md: profile.fullMd,
        scoring_json: scoringJson,
        region_tag: this.generateRegionTag(),
        archetype_tag: this.generateArchetypeTag() || 'generalist',
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
        maxTokens: 8192,
      });

      const parsed = parseCvSkillResponse(res.text);
      const template = this.templates().find((tpl) => tpl.id === this.generateTemplateId()) ?? null;
      const content = buildCvContent(parsed, template);
      const created = await this.db.documentLibraryUpsert({
        docType: 'cv',
        source: 'generated',
        label,
        contentJson: JSON.stringify(content),
        templateId: template?.id,
        regionTag: this.generateRegionTag(),
        language: this.generateLanguage(),
        archetypeTag: this.generateArchetypeTag() || undefined,
        modelUsed: settings.defaultModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });

      // Link to job application if selected
      if (this.selectedJobId()) {
        const apps = await this.db.listApplications();
        const app = apps.find((a) => a.jobId === this.selectedJobId());
        if (app) {
          await this.db.upsertApplication({
            ...app,
            cvDocumentId: created.id,
          });
        }
      }

      this.generateOpen.set(false);
      await this.load();
      this.open(created.id);
    } catch (e) {
      this.generateError.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.generateBusy.set(false);
    }
  }
}

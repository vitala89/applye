import { Injectable, computed, inject, signal } from '@angular/core';
import type { Application, CvTemplate, DocumentLibraryItem, Job } from '@applye/core';
import { DocumentsGateway, JobsGateway } from '@applye/data';

/**
 * The CV library: the documents, the templates every creation flow picks from,
 * the two lists needed to name which job a CV belongs to, and the in-flight
 * state of an export or a delete.
 *
 * **This store is the screen's single load.** `CvImportStore` and
 * `CvGenerateStore` need the same templates and jobs, and they take them as
 * method arguments rather than fetching their own - one read, one source of
 * truth, and no way for two stores to disagree about which templates exist.
 *
 * **Every label the user reads is the page's.** `duplicate` takes the copy's
 * label already composed, because building it needs two translation keys, and
 * this layer does not translate.
 *
 * **The save dialog is the page's too.** No file under `libs/` imports a Tauri
 * plugin; the page picks a path and `exportDoc` takes it from there, the same
 * shape `ProfilePhotoStore` and `CoverLetterListStore` settled.
 */
@Injectable()
export class CvListStore {
  private readonly db = inject(JobsGateway);
  private readonly docs = inject(DocumentsGateway);

  readonly cvs = signal<DocumentLibraryItem[]>([]);
  readonly templates = signal<CvTemplate[]>([]);
  readonly trackedJobs = signal<Job[]>([]);
  readonly applications = signal<Application[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly error = signal('');

  readonly hasCvs = computed(() => this.cvs().length > 0);

  readonly exportBusyId = signal<number | null>(null);
  readonly deleteTarget = signal<DocumentLibraryItem | null>(null);
  readonly deleting = signal(false);

  /** Never rejects. `loadError` is the flag the page's error branch renders;
   * `error` carries what to say about it. */
  async load(): Promise<boolean> {
    this.loading.set(true);
    this.loadError.set(false);
    this.error.set('');
    try {
      const [cvs, templates, jobs, applications] = await Promise.all([
        this.docs.documentLibraryList('cv'),
        this.docs.cvTemplatesList(),
        this.db.listJobs(),
        this.db.listApplications(),
      ]);
      this.cvs.set(cvs);
      this.templates.set(templates);
      this.trackedJobs.set(jobs);
      this.applications.set(applications);
      return true;
    } catch (e) {
      this.loadError.set(true);
      this.error.set(String(e));
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * The company and role a CV is attached to, as facts rather than a sentence:
   * an application points at the document, and the job at the application. The
   * page joins them, because a separator is presentation.
   */
  linkedJobFacts(item: DocumentLibraryItem): string[] {
    const app = this.applications().find((a) => a.cvDocumentId === item.id);
    if (!app) return [];
    const job = this.trackedJobs().find((j) => j.id === app.jobId);
    return [job?.company, job?.title].filter((v): v is string => !!v);
  }

  /** `label` arrives composed, because naming a copy needs translations. */
  async duplicate(item: DocumentLibraryItem, label: string): Promise<boolean> {
    this.error.set('');
    try {
      await this.docs.documentLibraryUpsert({
        docType: 'cv',
        source: item.source,
        label,
        contentJson: item.contentJson,
        templateId: item.templateId,
        styleJson: item.styleJson,
        regionTag: item.regionTag,
        language: item.language,
        archetypeTag: item.archetypeTag,
        isDefault: false,
      });
      await this.load();
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }

  /**
   * Writes the file the page already chose a path for. Returns `null` when an
   * export is already running - a refusal, so nothing is said.
   *
   * PDF goes through the WYSIWYG engine: a hidden window renders the editor's
   * own preview and the OS prints it to the file, so the export is
   * pixel-identical to the editor rather than a second renderer's guess.
   */
  async exportDoc(
    item: DocumentLibraryItem,
    format: 'pdf' | 'docx',
    path: string,
  ): Promise<boolean | null> {
    this.error.set('');
    if (this.exportBusyId() != null) return null;
    this.exportBusyId.set(item.id);
    try {
      if (format === 'pdf') {
        await this.docs.cvDocumentExportPdfWysiwyg(item.id, path);
      } else {
        await this.docs.cvDocumentExport(item.id, format, path);
      }
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.exportBusyId.set(null);
    }
  }

  requestDelete(item: DocumentLibraryItem): void {
    this.deleteTarget.set(item);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  /** `null` when there was nothing to delete, or a delete already running. */
  async confirmDelete(): Promise<boolean | null> {
    this.error.set('');
    const item = this.deleteTarget();
    if (!item || this.deleting()) return null;
    this.deleting.set(true);
    try {
      await this.docs.documentLibraryDelete(item.id);
      this.deleteTarget.set(null);
      await this.load();
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.deleting.set(false);
    }
  }
}

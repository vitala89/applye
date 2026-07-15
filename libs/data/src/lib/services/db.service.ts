import { Injectable } from '@angular/core';
import {
  FetchedJob,
  Job,
  JobOverview,
  ScoringCache,
  TrackerRow,
  UrlClassification,
} from '@applye/core';
import { ImportPreviewRow, ImportRawRow, ImportResult } from '@applye/core';
import {
  Application,
  ApplicationStatus,
  ApplicationTrackerFieldsInput,
  Comment,
  PipelineCard,
  Priority,
} from '@applye/core';
import { CreateInterviewStageInput, InterviewStage, UpdateInterviewStageInput } from '@applye/core';
import { Profile } from '@applye/core';
import { Settings } from '@applye/core';
import { GeneratedDoc, SaveTailoringInput, TailoringCache } from '@applye/core';
import { PortalAnswer, SavePortalAnswersInput } from '@applye/core';
import { FollowupDraft, SaveFollowupDraftInput } from '@applye/core';
import {
  CvImportFile,
  CvTemplate,
  DocumentLibraryItem,
  LibraryDocType,
  StyleNote,
  UpsertCvTemplateInput,
  UpsertDocumentLibraryItemInput,
} from '@applye/core';
import { HealthReport } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/** Typed wrappers over the Rust db_* commands. The frontend stays SQL-free. */
@Injectable({ providedIn: 'root' })
export class DbService {
  // --- Profile (source of truth) ---
  async getProfile(): Promise<Profile | null> {
    return tauriInvoke<Profile | null>('db_get_profile');
  }

  async upsertProfile(
    profile: Partial<
      Pick<Profile, 'fullMd' | 'scoringJson' | 'scoringHash' | 'pitchMd' | 'targetArchetypes'>
    >,
  ): Promise<Profile> {
    return tauriInvoke<Profile>('db_upsert_profile', { profile });
  }

  hashText(text: string): Promise<string> {
    return tauriInvoke<string>('hash_text', { text });
  }

  /** Layer-1 archetype overlap (0 tokens). True = on-archetype or no archetypes defined. */
  checkArchetypeMatch(
    title: string | undefined,
    jdText: string,
    archetypesJson: string | undefined,
  ): Promise<boolean> {
    return tauriInvoke<boolean>('check_archetype_match', { title, jdText, archetypesJson });
  }

  // --- Settings ---
  async getSettings(): Promise<Settings> {
    return tauriInvoke<Settings>('db_get_settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    return tauriInvoke<Settings>('db_update_settings', { settings });
  }

  // --- Jobs ---
  async listJobs(): Promise<Job[]> {
    return tauriInvoke<Job[]>('db_list_jobs');
  }

  async upsertJob(job: Omit<Job, 'id' | 'jdHash' | 'createdAt'>): Promise<Job> {
    return tauriInvoke<Job>('db_upsert_job', { job });
  }

  async jobPaste(jdText: string, title?: string, company?: string): Promise<Job> {
    return tauriInvoke<Job>('job_paste', { jdText, title, company });
  }

  /** 0-token allowlist check: is this URL an open/ATS source, or a closed board? */
  classifyJobUrl(url: string): Promise<UrlClassification> {
    return tauriInvoke<UrlClassification>('classify_job_url', { url });
  }

  /** Fetches title/company/JD text from an Allowed-classified URL only. */
  fetchJobFromUrl(url: string): Promise<FetchedJob> {
    return tauriInvoke<FetchedJob>('fetch_job_from_url', { url });
  }

  /** My Jobs table rows: job columns + latest score + current status. */
  async listJobsOverview(): Promise<JobOverview[]> {
    return tauriInvoke<JobOverview[]>('db_list_jobs_overview');
  }

  async getJob(id: number): Promise<Job | null> {
    return tauriInvoke<Job | null>('db_get_job', { id });
  }

  /** Job Tracker rows: applications + jobs + last status change (0 tokens). */
  async trackerRows(): Promise<TrackerRow[]> {
    return tauriInvoke<TrackerRow[]>('db_tracker_rows');
  }

  /** Write a laid-out report (pdf/csv) to Documents/Applye/reports; returns path. */
  async exportReport(content: string, format: 'pdf' | 'csv', fileBase: string): Promise<string> {
    return tauriInvoke<string>('export_report', { content, format, fileBase });
  }

  async scoreCacheGet(jobId: number, profileHash: string): Promise<ScoringCache | null> {
    return tauriInvoke<ScoringCache | null>('score_cache_get', { jobId, profileHash });
  }

  async scoreCacheSave(input: {
    jobId: number;
    profileHash: string;
    language: string;
    score: number;
    dimensionsJson: string;
    missingKeywordsJson: string;
    redFlagsJson: string;
    atsPass: boolean;
    atsNotes: string;
    summary: string;
    beforeYouSubmitJson: string;
    modelUsed: string;
    tokensInput: number;
    tokensOutput: number;
  }): Promise<ScoringCache> {
    return tauriInvoke<ScoringCache>('score_cache_save', { input });
  }

  // --- Applications ---
  async listApplications(): Promise<Application[]> {
    return tauriInvoke<Application[]>('db_list_applications');
  }

  async listPipelineCards(): Promise<PipelineCard[]> {
    return tauriInvoke<PipelineCard[]>('db_pipeline_cards');
  }

  async upsertApplication(
    application: Partial<Application> & Pick<Application, 'jobId' | 'status'>,
  ): Promise<Application> {
    return tauriInvoke<Application>('db_upsert_application', { application });
  }

  async setApplicationStatus(id: number, status: ApplicationStatus): Promise<Application> {
    return tauriInvoke<Application>('db_set_application_status', { id, status });
  }

  /** Job Tracker inline edit — patches only contact/next-action/salary/notes. */
  async updateApplicationTrackerFields(input: ApplicationTrackerFieldsInput): Promise<Application> {
    return tauriInvoke<Application>('db_update_application_tracker_fields', { input });
  }

  /** Pipeline quick-view priority flag — distinct from the legitimacy tier. */
  async setApplicationPriority(applicationId: number, priority: Priority): Promise<Application> {
    return tauriInvoke<Application>('set_application_priority', { applicationId, priority });
  }

  async addApplicationComment(applicationId: number, commentText: string): Promise<Comment> {
    return tauriInvoke<Comment>('add_application_comment', { applicationId, commentText });
  }

  /** Oldest → newest, for the quick-view comment feed. */
  async listApplicationComments(applicationId: number): Promise<Comment[]> {
    return tauriInvoke<Comment[]>('list_application_comments', { applicationId });
  }

  // --- Interview stages ---
  async createInterviewStage(input: CreateInterviewStageInput): Promise<InterviewStage> {
    return tauriInvoke<InterviewStage>('create_interview_stage', { input });
  }

  /** Partial patch — only stageId is required; other fields keep their current value. */
  async updateInterviewStage(input: UpdateInterviewStageInput): Promise<InterviewStage> {
    return tauriInvoke<InterviewStage>('update_interview_stage', { input });
  }

  async deleteInterviewStage(stageId: number): Promise<void> {
    return tauriInvoke<void>('delete_interview_stage', { stageId });
  }

  /** Hard delete — removes the job and every dependent row (applications,
   *  scoring, tailoring, interview data). Irreversible; caller must confirm
   *  with the user first. */
  async deleteJob(id: number): Promise<void> {
    return tauriInvoke<void>('db_delete_job', { id });
  }

  /** Ordered by stageOrder ascending. */
  async listInterviewStages(applicationId: number): Promise<InterviewStage[]> {
    return tauriInvoke<InterviewStage[]>('list_interview_stages', { applicationId });
  }

  // --- Tailoring cache ---
  async tailoringCacheGet(
    jobId: number,
    pass: number,
    inputHash: string,
  ): Promise<TailoringCache | null> {
    return tauriInvoke<TailoringCache | null>('tailoring_cache_get', { jobId, pass, inputHash });
  }

  async tailoringCacheSave(input: SaveTailoringInput): Promise<TailoringCache> {
    return tauriInvoke<TailoringCache>('tailoring_cache_save', { input });
  }

  // --- Portal answer drafts ---
  async portalAnswersGet(
    jobId: number,
    profileHash: string,
    inputHash: string,
  ): Promise<PortalAnswer | null> {
    return tauriInvoke<PortalAnswer | null>('portal_answers_get', {
      jobId,
      profileHash,
      inputHash,
    });
  }

  async portalAnswersSave(input: SavePortalAnswersInput): Promise<PortalAnswer> {
    return tauriInvoke<PortalAnswer>('portal_answers_save', { input });
  }

  // --- Follow-up drafts ---
  async followupDraftGet(applicationId: number, inputHash: string): Promise<FollowupDraft | null> {
    return tauriInvoke<FollowupDraft | null>('followup_draft_get', { applicationId, inputHash });
  }

  async followupDraftSave(input: SaveFollowupDraftInput): Promise<FollowupDraft> {
    return tauriInvoke<FollowupDraft>('followup_draft_save', { input });
  }

  // --- Documents library (CV / Cover Letter) ---
  async cvTemplatesList(): Promise<CvTemplate[]> {
    return tauriInvoke<CvTemplate[]>('cv_templates_list');
  }

  async documentLibraryList(docType?: LibraryDocType): Promise<DocumentLibraryItem[]> {
    return tauriInvoke<DocumentLibraryItem[]>('document_library_list', { docType });
  }

  async documentLibraryGet(id: number): Promise<DocumentLibraryItem | null> {
    return tauriInvoke<DocumentLibraryItem | null>('document_library_get', { id });
  }

  async documentLibraryUpsert(input: UpsertDocumentLibraryItemInput): Promise<DocumentLibraryItem> {
    return tauriInvoke<DocumentLibraryItem>('document_library_upsert', { input });
  }

  async documentLibraryDelete(id: number): Promise<void> {
    return tauriInvoke<void>('document_library_delete', { id });
  }

  async cvTemplateUpsert(input: UpsertCvTemplateInput): Promise<CvTemplate> {
    return tauriInvoke<CvTemplate>('cv_template_upsert', { input });
  }

  /** Reads a picked DOCX/PDF and extracts its plain text (deterministic,
   * 0 tokens) — ready for the `cv-import` skill. */
  async cvImportReadFile(path: string): Promise<CvImportFile> {
    return tauriInvoke<CvImportFile>('cv_import_read_file', { path });
  }

  /** Reads a picked CV photo file and returns it as a base64 data URI,
   * ready for inline storage/preview in a `CvPhotoSection`. */
  async cvPhotoReadFile(path: string): Promise<string> {
    return tauriInvoke<string>('cv_photo_read_file', { path });
  }

  /** Exports a library CV to `savePath` as DOCX or PDF — a library export,
   * distinct from the job-specific tailoring export journal. */
  async cvDocumentExport(id: number, format: 'docx' | 'pdf', savePath: string): Promise<string> {
    return tauriInvoke<string>('cv_document_export', { id, format, savePath });
  }

  /** Silent WYSIWYG PDF export: a hidden window renders the same preview as
   * the editor and the OS prints it straight to `savePath` — pixel-identical
   * to the editor, no dialogs. Falls back to the structured renderer on
   * platforms without a native print-to-file call. */
  async cvDocumentExportPdfWysiwyg(id: number, savePath: string): Promise<string> {
    return tauriInvoke<string>('cv_document_export_pdf_wysiwyg', { id, savePath });
  }

  /** Called by the print route once its preview has settled — releases the
   * export command waiting on this window. */
  printWindowReady(): Promise<void> {
    return tauriInvoke<void>('print_window_ready');
  }

  async coverLetterDocumentExport(
    id: number,
    format: 'docx' | 'pdf',
    savePath: string,
  ): Promise<string> {
    return tauriInvoke<string>('cover_letter_document_export', { id, format, savePath });
  }

  /** The cover letter's counterpart to `cvDocumentExportPdfWysiwyg` — same
   * hidden-window print path, via the `print/cover-letter/:id` route. */
  async coverLetterDocumentExportPdfWysiwyg(id: number, savePath: string): Promise<string> {
    return tauriInvoke<string>('cover_letter_document_export_pdf_wysiwyg', { id, savePath });
  }

  /** Deterministic, 0-token ATS/readability check (ROADMAP §16.5) — empty
   * array when `styleJson` is unset or already at the safe default. */
  async checkStyleSafety(styleJson?: string): Promise<StyleNote[]> {
    return tauriInvoke<StyleNote[]>('check_style_safety', { styleJson });
  }

  // --- Document export ---
  async generatedDocGet(
    jobId: number,
    inputHash: string,
    exportFormat: string,
  ): Promise<GeneratedDoc | null> {
    return tauriInvoke<GeneratedDoc | null>('generated_doc_get', {
      jobId,
      inputHash,
      exportFormat,
    });
  }

  async exportDocx(
    jobId: number,
    contentMd: string,
    company: string,
    jobTitle: string,
    inputHash: string,
  ): Promise<GeneratedDoc> {
    return tauriInvoke<GeneratedDoc>('export_docx', {
      jobId,
      contentMd,
      company,
      jobTitle,
      inputHash,
    });
  }

  async exportPdf(
    jobId: number,
    contentMd: string,
    company: string,
    jobTitle: string,
    inputHash: string,
  ): Promise<GeneratedDoc> {
    return tauriInvoke<GeneratedDoc>('export_pdf', {
      jobId,
      contentMd,
      company,
      jobTitle,
      inputHash,
    });
  }

  openFile(path: string): Promise<void> {
    return tauriInvoke<void>('open_file', { path });
  }

  revealInFolder(path: string): Promise<void> {
    return tauriInvoke<void>('reveal_in_folder', { path });
  }

  // --- Backup / export ---
  async exportDatabase(targetPath: string): Promise<string> {
    return tauriInvoke<string>('db_export', { targetPath });
  }

  // --- Import tracklist (Phase 6.4) ---
  importReadFile(path: string): Promise<{ fileType: string; content: string }> {
    return tauriInvoke<{ fileType: string; content: string }>('import_read_file', { path });
  }

  importPreview(rows: ImportRawRow[]): Promise<ImportPreviewRow[]> {
    return tauriInvoke<ImportPreviewRow[]>('import_preview', { rows });
  }

  importConfirm(
    rows: ImportRawRow[],
    importedFrom: string,
    followupDaysAfterApply: number,
  ): Promise<ImportResult> {
    return tauriInvoke<ImportResult>('import_confirm', {
      rows,
      importedFrom,
      followupDaysAfterApply,
    });
  }

  // --- Health check (Phase 6.7) ---
  healthCheck(): Promise<HealthReport> {
    return tauriInvoke<HealthReport>('health_check');
  }
}

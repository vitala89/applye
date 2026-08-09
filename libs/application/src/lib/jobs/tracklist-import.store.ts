import { Injectable, computed, inject, signal } from '@angular/core';
import type { ImportPreviewRow, ImportRawRow, ImportSkipped } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { parseImportResponse, toRawRows } from './tracklist-import';

export type ImportStep = 'pick' | 'preview' | 'done';

/** A preview row plus whether the user has it ticked for import. */
export interface ImportUIRow extends ImportPreviewRow {
  selected: boolean;
}

/** What a confirmed import did, for the page to put into words. */
export interface ImportResult {
  inserted: number;
  skippedDuplicate: number;
}

/**
 * The tracklist import flow: pick a file, detect its rows with one AI call,
 * preview them deterministically, then insert the ticked ones.
 *
 * **The file dialog is not here.** Picking is the app's - no file under `libs/`
 * imports a Tauri plugin, and `ProfilePhotoStore` already settled the shape:
 * the page picks a path, the store takes it from there.
 *
 * **The counts are here; the sentences are not.** `Found 3 rows...` and
 * `Imported 2 jobs...` are text, and this layer does not write text for users.
 * The store publishes `total`, `willAdd`, `duplicates`, `skipped` and the
 * result, and the page says what it wants with them.
 */
@Injectable()
export class TracklistImportStore {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);

  readonly open = signal(false);
  readonly step = signal<ImportStep>('pick');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fileType = signal('');
  readonly rows = signal<ImportUIRow[]>([]);
  readonly skipped = signal<ImportSkipped[]>([]);
  readonly result = signal<ImportResult | null>(null);

  readonly duplicates = computed(() => this.rows().filter((r) => r.isDuplicate).length);
  readonly willAdd = computed(() => this.rows().length - this.duplicates());
  readonly total = computed(() => this.rows().length + this.skipped().length);

  readonly selectedCount = computed(
    () => this.rows().filter((r) => r.selected && !r.isDuplicate).length,
  );

  /** Opens on a clean slate, so a previous run's rows never show under a new file. */
  start(): void {
    this.step.set('pick');
    this.error.set('');
    this.rows.set([]);
    this.skipped.set([]);
    this.result.set(null);
    this.open.set(true);
  }

  cancel(): void {
    this.open.set(false);
  }

  setRowSelected(index: number, selected: boolean): void {
    const rows = this.rows().slice();
    rows[index] = { ...rows[index], selected };
    this.rows.set(rows);
  }

  /**
   * Read the picked file, ask the skill to normalise it, and preview the result.
   *
   * Returns `null` when it refused - a detect was already running - so the page
   * can stay silent, and `false` only on a real failure, which `error` carries.
   * Duplicates arrive unticked: importing a row that already exists is the one
   * outcome the user cannot undo in a click.
   */
  async detect(path: string): Promise<boolean | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    this.error.set('');
    try {
      const file = await this.db.importReadFile(path);
      this.fileType.set(file.fileType);

      const settings = await this.db.getSettings();
      const language = settings.uiLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('import-tracklist', {
        file_content: file.content,
        file_type: file.fileType,
        language,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
      });

      const parsed = parseImportResponse(res.text);
      const preview = await this.db.importPreview(toRawRows(parsed));

      this.rows.set(preview.map((r) => ({ ...r, selected: !r.isDuplicate })));
      this.skipped.set(parsed.skipped ?? []);
      this.step.set('preview');
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Insert the ticked, non-duplicate rows.
   *
   * Returns `null` when there was nothing to do - no selection, or already
   * running - which is a refusal rather than a failure and leaves `error` empty.
   */
  async confirm(): Promise<boolean | null> {
    const selected = this.rows().filter((r) => r.selected && !r.isDuplicate);
    if (!selected.length || this.busy()) return null;
    this.busy.set(true);
    this.error.set('');
    try {
      const settings = await this.db.getSettings();
      const rows: ImportRawRow[] = selected.map((r) => ({
        company: r.company,
        role: r.role,
        status: r.status,
        appliedAt: r.appliedAt,
        notes: r.notes,
        techStack: r.techStack,
        sourceUrl: r.sourceUrl,
        contactName: r.contactName,
        contactRole: r.contactRole,
        contactChannel: r.contactChannel,
        nextAction: r.nextAction,
        nextActionAt: r.nextActionAt,
        salaryRange: r.salaryRange,
      }));
      const result = await this.db.importConfirm(
        rows,
        `import_${this.fileType()}`,
        settings.followupDaysAfterApply ?? 7,
      );
      this.result.set({
        inserted: result.inserted,
        skippedDuplicate: result.skippedDuplicate,
      });
      this.step.set('done');
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

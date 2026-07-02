import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ArrowDown, ArrowUp, LucideAngularModule, Search, Upload } from 'lucide-angular';
import type { ImportPreviewRow, ImportRawRow, ImportSkipped, JobOverview } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { PasteJobModalService } from '../../shared/paste-job-modal/paste-job-modal.service';

type SortKey = 'company' | 'title' | 'score' | 'status' | 'legitimacyTier' | 'createdAt' | 'source';
type ImportStep = 'pick' | 'preview' | 'done';
interface ImportUIRow extends ImportPreviewRow {
  selected: boolean;
}
interface ImportSkillResponse {
  normalized_rows: Array<{
    company: string;
    role: string;
    status: string;
    applied_at: string | null;
    notes: string | null;
  }>;
  skipped: ImportSkipped[];
  duplicates_expected: string[];
}

// My Jobs: the full job database as a sortable/filterable table. Read-only,
// 0 tokens. Sort/filter/search run client-side over the local overview list.
@Component({
  selector: 'app-my-jobs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective],
  templateUrl: './my-jobs.component.html',
  styleUrl: './my-jobs.component.scss',
})
export class MyJobsComponent {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly pasteJobModal = inject(PasteJobModalService);
  protected readonly icons = { search: Search, up: ArrowUp, down: ArrowDown, upload: Upload };

  readonly rows = signal<JobOverview[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);

  readonly search = signal('');
  readonly statusFilter = signal<string>('');
  readonly legitFilter = signal<string>('');
  readonly minScore = signal<number | null>(null);
  readonly sortKey = signal<SortKey>('createdAt');
  readonly sortDir = signal<'asc' | 'desc'>('desc');

  readonly statuses = ['saved', 'applied', 'interview', 'offer', 'rejected'];
  readonly legitimacies = ['green', 'yellow', 'red'];

  // Import tracklist flow (Phase 6.4) — pick file -> detect (1 AI call) ->
  // preview (deterministic) -> confirm (deterministic insert).
  readonly importOpen = signal(false);
  readonly importStep = signal<ImportStep>('pick');
  readonly importBusy = signal(false);
  readonly importError = signal('');
  readonly importFileType = signal('');
  readonly importRows = signal<ImportUIRow[]>([]);
  readonly importSkipped = signal<ImportSkipped[]>([]);
  readonly importDoneMsg = signal('');

  readonly importSummary = computed(() => {
    const rows = this.importRows();
    const skipped = this.importSkipped().length;
    const total = rows.length + skipped;
    const duplicate = rows.filter((r) => r.isDuplicate).length;
    const willAdd = rows.length - duplicate;
    return (
      `Found ${total} row${total === 1 ? '' : 's'}. ` +
      `${willAdd} will be added. ${duplicate} already exist. ${skipped} skipped.`
    );
  });

  readonly importSelectedCount = computed(
    () => this.importRows().filter((r) => r.selected && !r.isDuplicate).length,
  );

  readonly view = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sf = this.statusFilter();
    const lf = this.legitFilter();
    const ms = this.minScore();
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    const filtered = this.rows().filter((r) => {
      if (q && !`${r.company ?? ''} ${r.title ?? ''}`.toLowerCase().includes(q)) return false;
      if (sf && (r.status ?? 'saved') !== sf) return false;
      if (lf && (r.legitimacyTier ?? 'green') !== lf) return false;
      if (ms != null && (r.score ?? -1) < ms) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.rows.set(await this.db.listJobsOverview());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  setSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  open(id: number): void {
    void this.router.navigate(['/jobs', id]);
  }

  // ── Import tracklist ────────────────────────────────────────────────────────

  openImport(): void {
    this.importStep.set('pick');
    this.importError.set('');
    this.importRows.set([]);
    this.importSkipped.set([]);
    this.importDoneMsg.set('');
    this.importOpen.set(true);
  }

  cancelImport(): void {
    this.importOpen.set(false);
  }

  async pickAndDetect(): Promise<void> {
    if (this.importBusy()) return;
    this.importError.set('');
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Tracklist', extensions: ['csv', 'xlsx', 'xls', 'json', 'txt'] }],
      });
      if (!path || Array.isArray(path)) return;

      this.importBusy.set(true);
      const file = await this.db.importReadFile(path);
      this.importFileType.set(file.fileType);

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

      const raw = res.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      let parsed: ImportSkillResponse;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`AI returned invalid JSON: ${res.text.slice(0, 200)}`);
      }

      const rawRows: ImportRawRow[] = parsed.normalized_rows.map((r) => ({
        company: r.company,
        role: r.role,
        status: r.status,
        appliedAt: r.applied_at,
        notes: r.notes,
      }));
      const preview = await this.db.importPreview(rawRows);

      this.importRows.set(preview.map((r) => ({ ...r, selected: !r.isDuplicate })));
      this.importSkipped.set(parsed.skipped ?? []);
      this.importStep.set('preview');
    } catch (e) {
      this.importError.set(String(e));
    } finally {
      this.importBusy.set(false);
    }
  }

  setRowSelected(index: number, selected: boolean): void {
    const rows = this.importRows().slice();
    rows[index] = { ...rows[index], selected };
    this.importRows.set(rows);
  }

  async confirmImport(): Promise<void> {
    const selected = this.importRows().filter((r) => r.selected && !r.isDuplicate);
    if (!selected.length || this.importBusy()) return;
    this.importBusy.set(true);
    this.importError.set('');
    try {
      const settings = await this.db.getSettings();
      const rows: ImportRawRow[] = selected.map((r) => ({
        company: r.company,
        role: r.role,
        status: r.status,
        appliedAt: r.appliedAt,
        notes: r.notes,
      }));
      const result = await this.db.importConfirm(
        rows,
        `import_${this.importFileType()}`,
        settings.followupDaysAfterApply ?? 7,
      );
      this.importDoneMsg.set(
        `Imported ${result.inserted} job${result.inserted === 1 ? '' : 's'}. ` +
          `${result.skippedDuplicate} skipped as duplicate.`,
      );
      this.importStep.set('done');
      await this.load();
    } catch (e) {
      this.importError.set(String(e));
    } finally {
      this.importBusy.set(false);
    }
  }
}

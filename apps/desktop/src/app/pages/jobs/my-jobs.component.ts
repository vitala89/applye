import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ArrowDown, ArrowUp, LucideAngularModule, Search } from 'lucide-angular';
import type { JobOverview } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';

type SortKey = 'company' | 'title' | 'score' | 'status' | 'legitimacyTier' | 'createdAt' | 'source';

// My Jobs: the full job database as a sortable/filterable table. Read-only,
// 0 tokens. Sort/filter/search run client-side over the local overview list.
@Component({
  selector: 'app-my-jobs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './my-jobs.component.html',
  styleUrl: './my-jobs.component.scss',
})
export class MyJobsComponent {
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly icons = { search: Search, up: ArrowUp, down: ArrowDown };

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

  // Paste flow
  readonly pasteOpen = signal(false);
  readonly pasteText = signal('');
  readonly pasteBusy = signal(false);
  readonly pasteError = signal('');

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

  async submitPaste(): Promise<void> {
    const text = this.pasteText().trim();
    if (!text || this.pasteBusy()) return;
    this.pasteBusy.set(true);
    this.pasteError.set('');
    try {
      const job = await this.db.jobPaste(text);
      this.pasteOpen.set(false);
      this.pasteText.set('');
      void this.router.navigate(['/jobs', job.id]);
    } catch (e) {
      this.pasteError.set(String(e));
    } finally {
      this.pasteBusy.set(false);
    }
  }
}

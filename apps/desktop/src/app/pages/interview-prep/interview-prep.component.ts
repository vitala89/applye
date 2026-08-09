import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ListOrdered, MoreHorizontal, LucideAngularModule, Target, Trash2 } from 'lucide-angular';
import { PipelineCard } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../core/toast/toast.service';

// Interview Prep list: every application that has at least one stage,
// sorted soonest-upcoming first. CRUD home for stages - the Pipeline board
// and its quick-view only show a read-only summary and link here.
@Component({
  selector: 'app-interview-prep',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, LucideAngularModule],
  templateUrl: './interview-prep.component.html',
  styleUrl: './interview-prep.component.scss',
})
export class InterviewPrepComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    menu: MoreHorizontal,
    timeline: ListOrdered,
    trash: Trash2,
    empty: Target,
  };

  private readonly cards = signal<PipelineCard[]>([]);
  readonly loading = signal(true);
  readonly menuId = signal<number | null>(null);
  readonly confirmId = signal<number | null>(null);
  readonly removing = signal(false);

  readonly rows = computed(() =>
    this.cards()
      .filter((c) => c.currentStageOrder != null)
      .sort((a, b) => {
        const aAt = a.currentStageScheduledAt;
        const bAt = b.currentStageScheduledAt;
        if (!aAt && !bAt) return 0;
        if (!aAt) return 1;
        if (!bAt) return -1;
        return aAt.localeCompare(bAt);
      }),
  );

  readonly stats = computed(() => {
    const rows = this.rows();
    const upcoming = rows.filter((r) => r.currentStageStatus === 'scheduled');
    const next = upcoming.find((r) => r.currentStageScheduledAt);
    return {
      tracking: rows.length,
      upcoming: upcoming.length,
      nextDate: next ? this.formatDate(next.currentStageScheduledAt) : '·',
      nextCompany: next?.company ?? '',
    };
  });

  readonly confirmRow = computed(() => this.rows().find((r) => r.id === this.confirmId()) ?? null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.cards.set(await this.db.listPipelineCards());
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  open(applicationId: number): void {
    void this.router.navigate(['/interview-prep', applicationId]);
  }

  /** Same destination as clicking the row, reached from inside the row menu. */
  openFromMenu(applicationId: number, event: Event): void {
    event.stopPropagation();
    this.menuId.set(null);
    this.open(applicationId);
  }

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.menuId.update((m) => (m === id ? null : id));
  }
  closeMenus(): void {
    this.menuId.set(null);
  }

  askRemove(id: number, event: Event): void {
    event.stopPropagation();
    this.menuId.set(null);
    this.confirmId.set(id);
  }
  cancelRemove(): void {
    this.confirmId.set(null);
  }

  /** Remove an application from Interview Prep = delete every stage it has.
   * The application/job itself stays in My Jobs and Pipeline. */
  async confirmRemove(): Promise<void> {
    const id = this.confirmId();
    if (id == null || this.removing()) return;
    this.removing.set(true);
    try {
      const stages = await this.db.listInterviewStages(id);
      await Promise.all(stages.map((s) => this.db.deleteInterviewStage(s.id)));
      this.cards.update((cs) =>
        cs.map((c) =>
          c.id === id
            ? {
                ...c,
                currentStageOrder: undefined,
                currentStageLabel: undefined,
                currentStageStatus: undefined,
                currentStageScheduledAt: undefined,
              }
            : c,
        ),
      );
      this.toast.success(this.t()('interview.removed'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.removing.set(false);
      this.confirmId.set(null);
    }
  }

  formatDate(iso?: string): string {
    if (!iso) return '·';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

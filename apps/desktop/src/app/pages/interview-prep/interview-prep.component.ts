import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { PipelineCard } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';

// Interview Prep list: every application that has at least one stage,
// sorted soonest-upcoming first. This is the CRUD home for stages — the
// Pipeline board and its quick-view modal only ever show a read-only
// summary and link here (plus the one quick-add exception on transition
// into interview).
@Component({
  selector: 'app-interview-prep',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './interview-prep.component.html',
  styleUrl: './interview-prep.component.scss',
})
export class InterviewPrepComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  private readonly cards = signal<PipelineCard[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly rows = computed(() => {
    return this.cards()
      .filter((c) => c.currentStageOrder != null)
      .sort((a, b) => {
        const aAt = a.currentStageScheduledAt;
        const bAt = b.currentStageScheduledAt;
        if (!aAt && !bAt) return 0;
        if (!aAt) return 1;
        if (!bAt) return -1;
        return aAt.localeCompare(bAt);
      });
  });

  async ngOnInit(): Promise<void> {
    try {
      this.cards.set(await this.db.listPipelineCards());
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  open(applicationId: number): void {
    void this.router.navigate(['/interview-prep', applicationId]);
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

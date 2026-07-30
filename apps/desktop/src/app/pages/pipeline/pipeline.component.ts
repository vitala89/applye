import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import {
  ChevronRight,
  Clock,
  Flag,
  KanbanSquare,
  LucideAngularModule,
  MapPin,
  Search,
  TriangleAlert,
  X,
} from 'lucide-angular';
import { DbService } from '@applye/data';
import {
  Application,
  ApplicationStatus,
  InterviewStage,
  PipelineCard,
  Priority,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { QuickViewModalComponent } from './quick-view-modal/quick-view-modal.component';
import { ToastService } from '../../core/toast/toast.service';

interface KanbanCol {
  status: ApplicationStatus;
  labelKey: string;
  accent: string;
  /** rejected / cancelled - collapsed into a side rail ("archive") unless the
   * user reveals them via the strip's Show archived toggle. */
  terminal: boolean;
}

// Pipeline shows only ACTIVE applications. "saved" jobs live in My Jobs
// (status filter); a job enters the board via the Apply wizard. Terminal
// columns (rejected/cancelled) act as the archive: collapsed to side rails
// by default, revealed on demand - there is no separate archived flag.
const COLS: KanbanCol[] = [
  { status: 'applied', labelKey: 'status.applied', accent: 'var(--text-accent)', terminal: false },
  { status: 'interview', labelKey: 'status.interview', accent: 'var(--warning)', terminal: false },
  { status: 'offer', labelKey: 'status.offer', accent: 'var(--success)', terminal: false },
  { status: 'rejected', labelKey: 'status.rejected', accent: 'var(--danger)', terminal: true },
  {
    status: 'cancelled',
    labelKey: 'status.cancelled',
    accent: 'var(--text-tertiary)',
    terminal: true,
  },
];

const ACTIVE_STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer'];

@Component({
  selector: 'app-pipeline',
  standalone: true,
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    FormsModule,
    LucideAngularModule,
    QuickViewModalComponent,
  ],
  templateUrl: './pipeline.component.html',
  styleUrl: './pipeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;

  readonly COLS = COLS;
  protected readonly placeholder = '-';

  protected readonly icons = {
    empty: KanbanSquare,
    flag: Flag,
    alert: TriangleAlert,
    search: Search,
    close: X,
    chevron: ChevronRight,
    pin: MapPin,
    clock: Clock,
  };

  cards: Record<ApplicationStatus, PipelineCard[]> = {
    saved: [],
    applied: [],
    interview: [],
    offer: [],
    rejected: [],
    cancelled: [],
  };

  readonly loading = signal(true);
  readonly error = signal('');
  readonly totalCards = signal(0);
  readonly selectedCard = signal<PipelineCard | null>(null);
  readonly search = signal('');
  // Terminal columns (rejected/cancelled) collapse to rails independently -
  // each carries its own open/closed state, both closed by default.
  readonly collapsedCols = signal<ReadonlySet<ApplicationStatus>>(
    new Set<ApplicationStatus>(['rejected', 'cancelled']),
  );

  isCollapsed(status: ApplicationStatus): boolean {
    return this.collapsedCols().has(status);
  }

  toggleCollapsed(status: ApplicationStatus): void {
    const next = new Set(this.collapsedCols());
    if (next.has(status)) {
      next.delete(status);
    } else {
      next.add(status);
    }
    this.collapsedCols.set(next);
  }

  async ngOnInit(): Promise<void> {
    await this.load();
    this.openFromQueryParam();
  }

  /** Deep link from dashboard's "need attention" queue: `?openCard=<id>`
   * opens that card's quick-view modal straight to the follow-up section
   * (shown automatically there when the card is overdue). Param is stripped
   * right after so back/refresh don't re-trigger it. */
  private openFromQueryParam(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('openCard'));
    if (!id) return;
    const card = this.allCards().find((c) => c.id === id);
    if (card) this.openQuickView(card);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const all = await this.db.listPipelineCards();
      for (const col of COLS) {
        this.cards[col.status] = all.filter((c) => c.status === col.status);
      }
      this.totalCards.set(all.length);
    } catch (e) {
      this.error.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  // --- Board-summary derivations (plain methods: the board reads mutable
  // `cards` directly under default change detection, so signals would not
  // track the imperative splices in the drop / modal handlers). ---

  private matches(card: PipelineCard): boolean {
    const q = this.search().trim().toLowerCase();
    if (!q) return true;
    return [card.company, card.title, card.location].some((v) =>
      (v ?? '').toLowerCase().includes(q),
    );
  }

  visibleCards(status: ApplicationStatus): PipelineCard[] {
    return this.cards[status].filter((c) => this.matches(c));
  }

  private allCards(): PipelineCard[] {
    return Object.values(this.cards).flat();
  }

  activeCount(): number {
    return ACTIVE_STATUSES.reduce((sum, s) => sum + this.cards[s].length, 0);
  }

  overdueCount(): number {
    return this.allCards().filter((c) => c.overdue).length;
  }

  matchCount(): number {
    return this.allCards().filter((c) => this.matches(c)).length;
  }

  initials(company?: string): string {
    if (!company) return '-';
    const words = company.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '-';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  stageTotal(card: PipelineCard): number {
    return Math.max(card.currentStageTotal ?? 0, card.currentStageOrder ?? 0);
  }

  /** Booleans for the segmented progress track - one per logged stage, filled
   * up to the current stage's position. */
  segments(card: PipelineCard): boolean[] {
    const total = this.stageTotal(card);
    const done = card.currentStageOrder ?? 0;
    return Array.from({ length: total }, (_, i) => i < done);
  }

  async onDrop(event: CdkDragDrop<PipelineCard[]>, toStatus: ApplicationStatus): Promise<void> {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }
    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );
    const card = event.container.data[event.currentIndex];
    try {
      const updated = await this.db.setApplicationStatus(card.id, toStatus);
      // Refresh the card from the row the DB actually wrote: entering
      // applied/interview recomputes applied_at + follow_up_at (and thus
      // overdue) in SQL, so mutating only `status` would leave the footer
      // badge and the modal's follow-up gate stale until a reload.
      this.applyStatusToCard(card, updated);
      this.totalCards.set(Object.values(this.cards).reduce((s, arr) => s + arr.length, 0));
      if (toStatus === 'interview') {
        await this.maybePromptFirstStage(card);
      }
    } catch (e) {
      transferArrayItem(
        event.container.data,
        event.previousContainer.data,
        event.currentIndex,
        event.previousIndex,
      );
      this.toast.error(String(e));
    }
  }

  /** Mirror the DB row onto the in-memory card. `overdue` is not a column -
   * it is derived in `db_pipeline_cards` as `follow_up_at < date('now')`
   * (UTC), so replicate that exact predicate here to stay in sync with what
   * a reload would show. */
  private applyStatusToCard(card: PipelineCard, app: Application): void {
    card.status = app.status;
    card.appliedAt = app.appliedAt;
    card.followUpAt = app.followUpAt;
    card.overdue = this.computeOverdue(app.followUpAt);
  }

  private computeOverdue(followUpAt?: string): boolean {
    if (!followUpAt) return false;
    return followUpAt < new Date().toISOString().slice(0, 10);
  }

  // The one write path allowed outside Interview Prep: dragging a card into
  // INTERVIEW with no open modal to host the prompt, so the quick-view
  // modal itself is opened (pre-focused on the mini form by the modal's own
  // showQuickAdd logic). Only opens when the application has 0 stages yet -
  // never re-prompts on a reschedule that briefly leaves and returns.
  private async maybePromptFirstStage(card: PipelineCard): Promise<void> {
    const stages = await this.db.listInterviewStages(card.id);
    if (stages.length === 0) {
      this.openQuickView(card);
    }
  }

  openQuickView(card: PipelineCard): void {
    this.selectedCard.set(card);
  }

  closeQuickView(): void {
    this.selectedCard.set(null);
  }

  onModalStatusChanged(app: Application): void {
    for (const status of Object.keys(this.cards) as ApplicationStatus[]) {
      const idx = this.cards[status].findIndex((c) => c.id === app.id);
      if (idx === -1) continue;
      const [card] = this.cards[status].splice(idx, 1);
      this.applyStatusToCard(card, app);
      (this.cards[app.status] ??= []).unshift(card);
      this.selectedCard.set(card);
      break;
    }
  }

  onModalPriorityChanged(event: { id: number; priority: Priority }): void {
    for (const status of Object.keys(this.cards) as ApplicationStatus[]) {
      const card = this.cards[status].find((c) => c.id === event.id);
      if (card) {
        card.priority = event.priority;
        this.selectedCard.set(card);
        break;
      }
    }
  }

  onModalStageAdded(event: { id: number; stage: InterviewStage }): void {
    for (const status of Object.keys(this.cards) as ApplicationStatus[]) {
      const card = this.cards[status].find((c) => c.id === event.id);
      if (card) {
        card.currentStageOrder = event.stage.stageOrder;
        card.currentStageLabel = event.stage.stageLabel;
        card.currentStageStatus = event.stage.status;
        card.currentStageTotal = Math.max(card.currentStageTotal ?? 0, event.stage.stageOrder);
        this.selectedCard.set(card);
        break;
      }
    }
  }

  scoreClass(score?: number): string {
    if (score == null) return '';
    if (score >= 75) return 'score--high';
    if (score >= 50) return 'score--mid';
    return 'score--low';
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
}

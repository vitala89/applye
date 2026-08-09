import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
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
import {
  PipelineStore,
  companyInitials,
  scoreClass,
  stageSegments,
  stageTotal,
} from '@applye/application';
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
  providers: [PipelineStore],
  templateUrl: './pipeline.component.html',
  styleUrl: './pipeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineComponent implements OnInit {
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;
  protected readonly board = inject(PipelineStore);

  readonly COLS = COLS;

  /** Pure card drawing, from `libs/application` - exposed for the template. */
  protected readonly initials = companyInitials;
  protected readonly segments = stageSegments;
  protected readonly stageTotal = stageTotal;
  protected readonly scoreClass = scoreClass;
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

  async ngOnInit(): Promise<void> {
    if (!(await this.board.load(COLS.map((c) => c.status)))) this.toast.error(this.board.error());
    this.openFromQueryParam();
  }

  /** Deep link from dashboard's "need attention" queue: `?openCard=<id>`
   * opens that card's quick-view modal straight to the follow-up section
   * (shown automatically there when the card is overdue). Param is stripped
   * right after so back/refresh don't re-trigger it. */
  private openFromQueryParam(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('openCard'));
    if (!id) return;
    const card = this.board.allCards().find((c) => c.id === id);
    if (card) this.board.openQuickView(card);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  async reload(): Promise<void> {
    if (!(await this.board.load(COLS.map((c) => c.status)))) this.toast.error(this.board.error());
  }

  /**
   * CDK has already moved the card by the time this runs - that is what the
   * drop is - so a failed write has to move it back. The revert is here rather
   * than in the store because it is CDK's own operation on CDK's own event,
   * and the store has no business knowing what a `CdkDragDrop` is.
   */
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

    if (!(await this.board.persistStatus(card, toStatus))) {
      transferArrayItem(
        event.container.data,
        event.previousContainer.data,
        event.currentIndex,
        event.previousIndex,
      );
      this.toast.error(this.board.error());
      return;
    }

    // The one write path allowed outside Interview Prep: dragging a card into
    // INTERVIEW with no open modal to host the prompt, so the quick-view modal
    // itself is opened (pre-focused on the mini form by the modal's own
    // showQuickAdd logic). Only when the application has 0 stages yet - never
    // re-prompting on a reschedule that briefly leaves and returns.
    if (toStatus === 'interview' && (await this.board.hasNoStages(card.id))) {
      this.board.openQuickView(card);
    }
  }

  onModalStatusChanged(app: Application): void {
    this.board.applyModalStatus(app);
  }

  onModalPriorityChanged(event: { id: number; priority: Priority }): void {
    this.board.applyModalPriority(event.id, event.priority);
  }

  onModalStageAdded(event: { id: number; stage: InterviewStage }): void {
    this.board.applyModalStage(event.id, event.stage);
  }

  /** Presentation, and therefore the page's: locale-dependent, and the
   * application layer holds no locales. */
  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
}

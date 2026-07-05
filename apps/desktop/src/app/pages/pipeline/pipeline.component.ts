import { Component, inject, OnInit, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Flag, KanbanSquare, LucideAngularModule } from 'lucide-angular';
import { DbService } from '@applye/data';
import { ApplicationStatus, InterviewStage, PipelineCard, Priority } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { QuickViewModalComponent } from './quick-view-modal/quick-view-modal.component';

interface KanbanCol {
  status: ApplicationStatus;
  labelKey: string;
  accent: string;
}

// Pipeline shows only ACTIVE applications. "saved" jobs live in My Jobs
// (status filter); a job enters the board via Add to Pipeline / Mark Applied.
const COLS: KanbanCol[] = [
  { status: 'applied', labelKey: 'status.applied', accent: '#3b82f6' },
  { status: 'interview', labelKey: 'status.interview', accent: '#f59e0b' },
  { status: 'offer', labelKey: 'status.offer', accent: '#22c55e' },
  { status: 'rejected', labelKey: 'status.rejected', accent: '#ef4444' },
];

@Component({
  selector: 'app-pipeline',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, LucideAngularModule, QuickViewModalComponent],
  template: `
    <div class="pipeline">
      @if (loading()) {
        <div class="state-loading" aria-label="Loading pipeline">
          <div class="state-loading__bar state-loading__bar--wide"></div>
          <div class="state-loading__bar state-loading__bar--mid"></div>
          <div class="state-loading__bar state-loading__bar--short"></div>
        </div>
      } @else if (error()) {
        <div class="state-error" role="alert">
          <p class="state-error__msg">{{ t()('pipeline.loading') }} — {{ error() }}</p>
          <button class="state-error__retry" (click)="reload()">{{ t()('common.retry') }}</button>
        </div>
      } @else {
        <div class="kanban" cdkDropListGroup>
          @for (col of COLS; track col.status) {
            <section class="col" [style.--col-accent]="col.accent">
              <header class="col__head">
                <span class="col__label">{{ t()(col.labelKey) }}</span>
                <span class="col__badge">{{ cards[col.status].length }}</span>
              </header>
              <div
                class="col__list"
                cdkDropList
                [cdkDropListData]="cards[col.status]"
                (cdkDropListDropped)="onDrop($event, col.status)"
              >
                @for (card of cards[col.status]; track card.id) {
                  <article
                    class="card"
                    cdkDrag
                    role="button"
                    tabindex="0"
                    (click)="openQuickView(card)"
                    (keydown.enter)="openQuickView(card)"
                    (keydown.space)="openQuickView(card)"
                  >
                    @if (card.priority) {
                      <lucide-icon
                        [img]="icons.flag"
                        [size]="12"
                        class="card__priority-flag"
                        [attr.data-priority]="card.priority"
                        [attr.title]="t()('pipeline.priority_' + card.priority)"
                      />
                    }
                    <div class="card__company">{{ card.company || '–' }}</div>
                    <div class="card__title">{{ card.title || '–' }}</div>
                    <footer class="card__foot">
                      @if (card.score !== null && card.score !== undefined) {
                        <span class="card__score" [class]="scoreClass(card.score)">
                          {{ card.score }}%
                        </span>
                      }
                      @if (card.overdue) {
                        <span class="card__badge card__badge--overdue">{{
                          t()('pipeline.overdue')
                        }}</span>
                      }
                      <span class="card__date">{{
                        formatDate(card.appliedAt ?? card.updatedAt)
                      }}</span>
                    </footer>
                    @if (col.status === 'interview' && card.currentStageOrder !== undefined) {
                      <div class="card__stage">
                        <span
                          class="card__stage-dot"
                          [attr.data-status]="card.currentStageStatus"
                        ></span>
                        {{ t()('interview.stage_prefix') }} {{ card.currentStageOrder }} ·
                        {{ card.currentStageLabel }}
                      </div>
                    }
                    <div class="card__placeholder" *cdkDragPlaceholder></div>
                  </article>
                }
                @if (cards[col.status].length === 0) {
                  <div class="col__empty">{{ t()('common.drop_here') }}</div>
                }
              </div>
            </section>
          }
        </div>
        @if (totalCards() === 0) {
          <div class="state-empty pipeline__board-empty">
            <lucide-icon
              [img]="icons.empty"
              [size]="40"
              class="state-empty__icon"
              aria-hidden="true"
            />
            <p class="state-empty__msg">{{ t()('pipeline.empty') }}</p>
          </div>
        }
      }
    </div>
    @if (selectedCard(); as card) {
      <app-quick-view-modal
        [card]="card"
        (closed)="closeQuickView()"
        (statusChanged)="onModalStatusChanged($event)"
        (priorityChanged)="onModalPriorityChanged($event)"
        (stageAdded)="onModalStageAdded($event)"
      />
    }
  `,
  styles: [
    `
      .pipeline {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: var(--space-4);
        box-sizing: border-box;
      }

      .pipeline__board-empty {
        margin-top: var(--space-6);
      }

      /* Board */
      .kanban {
        display: flex;
        gap: var(--space-3);
        height: 100%;
        overflow-x: auto;
        align-items: flex-start;
        padding-bottom: var(--space-2);
      }

      /* Column */
      .col {
        flex: 0 0 240px;
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--surface-1);
        border-radius: var(--radius-lg, 10px);
        overflow: hidden;
        border-top: 3px solid var(--col-accent);
      }

      .col__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-2) var(--space-3);
        border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
      }

      .col__label {
        font-size: var(--text-xs, 11px);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-secondary);
      }

      .col__badge {
        font-size: var(--text-xs, 11px);
        font-weight: 700;
        background: var(--surface-sunken, rgba(0, 0, 0, 0.25));
        color: var(--text-tertiary);
        border-radius: var(--radius-full, 999px);
        min-width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
      }

      .col__list {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-2);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-height: 80px;
      }

      .col__empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        font-size: var(--text-xs, 11px);
        border: 2px dashed var(--border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--radius-md, 6px);
        min-height: 80px;
        pointer-events: none;
      }

      /* Card */
      .card {
        position: relative;
        background: var(--surface-2);
        border-radius: var(--radius-md, 6px);
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
        cursor: grab;
        user-select: none;
        transition:
          box-shadow 0.15s ease,
          border-color 0.15s ease;

        &:active {
          cursor: grabbing;
        }

        &:hover {
          border-color: var(--border-default, rgba(255, 255, 255, 0.16));
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
      }

      .card__priority-flag {
        position: absolute;
        top: 6px;
        right: 6px;

        &[data-priority='low'] {
          color: var(--text-accent);
        }
        &[data-priority='medium'] {
          color: var(--warning);
        }
        &[data-priority='high'] {
          color: var(--danger);
        }
      }

      .card__company {
        font-family: var(--font-mono);
        font-size: var(--text-sm, 13px);
        font-weight: 700;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card__title {
        font-size: var(--text-xs, 11px);
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
      }

      .card__foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: var(--space-2);
        gap: var(--space-1);
      }

      .card__score {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: var(--radius-full, 999px);
        line-height: 18px;

        &.score--high {
          background: var(--success-tint);
          color: var(--success);
        }
        &.score--mid {
          background: var(--warning-tint);
          color: var(--warning);
        }
        &.score--low {
          background: var(--danger-tint);
          color: var(--danger);
        }
      }

      .card__badge--overdue {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: var(--radius-full, 999px);
        line-height: 18px;
        background: var(--warning-tint);
        color: var(--warning);
      }

      .card__date {
        font-size: 10px;
        color: var(--text-tertiary);
        margin-left: auto;
      }

      .card__stage {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        margin-top: var(--space-1);
        font-size: var(--text-2xs, 10px);
        color: var(--text-tertiary);
      }

      .card__stage-dot {
        width: 6px;
        height: 6px;
        flex: 0 0 auto;
        border-radius: var(--radius-full, 999px);
        background: var(--text-tertiary);

        &[data-status='passed'] {
          background: var(--success);
        }
        &[data-status='rejected'] {
          background: var(--danger);
        }
        &[data-status='scheduled'] {
          background: var(--text-accent);
        }
      }

      /* CDK states */
      .cdk-drag-preview {
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        border-radius: var(--radius-md, 6px);
        opacity: 0.95;
      }

      .cdk-drag-placeholder,
      .card__placeholder {
        background: var(--surface-sunken, rgba(0, 0, 0, 0.25));
        border: 2px dashed var(--border-default, rgba(255, 255, 255, 0.16));
        border-radius: var(--radius-md, 6px);
        min-height: 70px;
      }

      .cdk-drag-animating {
        transition: transform 200ms cubic-bezier(0.25, 0.8, 0.25, 1);
      }

      .col__list.cdk-drop-list-dragging .card:not(.cdk-drag-placeholder) {
        transition: transform 200ms cubic-bezier(0.25, 0.8, 0.25, 1);
      }
    `,
  ],
})
export class PipelineComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly COLS = COLS;

  protected readonly icons = { empty: KanbanSquare, flag: Flag };

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

  async ngOnInit(): Promise<void> {
    await this.load();
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
    } finally {
      this.loading.set(false);
    }
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
      await this.db.setApplicationStatus(card.id, toStatus);
      card.status = toStatus;
      this.totalCards.set(Object.values(this.cards).reduce((s, arr) => s + arr.length, 0));
      if (toStatus === 'interview') {
        await this.maybePromptFirstStage(card);
      }
    } catch {
      transferArrayItem(
        event.container.data,
        event.previousContainer.data,
        event.currentIndex,
        event.previousIndex,
      );
    }
  }

  // The one write path allowed outside Interview Prep: dragging a card into
  // INTERVIEW with no open modal to host the prompt, so the quick-view
  // modal itself is opened (pre-focused on the mini form by the modal's own
  // showQuickAdd logic). Only opens when the application has 0 stages yet —
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

  onModalStatusChanged(event: { id: number; status: ApplicationStatus }): void {
    for (const status of Object.keys(this.cards) as ApplicationStatus[]) {
      const idx = this.cards[status].findIndex((c) => c.id === event.id);
      if (idx === -1) continue;
      const [card] = this.cards[status].splice(idx, 1);
      card.status = event.status;
      (this.cards[event.status] ??= []).unshift(card);
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

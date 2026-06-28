import { Component, inject, OnInit, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { DbService } from '@applye/data';
import { ApplicationStatus, PipelineCard } from '@applye/core';

interface KanbanCol {
  status: ApplicationStatus;
  label: string;
  accent: string;
}

const COLS: KanbanCol[] = [
  { status: 'saved', label: 'Saved', accent: '#64748b' },
  { status: 'applied', label: 'Applied', accent: '#3b82f6' },
  { status: 'interview', label: 'Interview', accent: '#f59e0b' },
  { status: 'offer', label: 'Offer', accent: '#22c55e' },
  { status: 'rejected', label: 'Rejected', accent: '#ef4444' },
];

@Component({
  selector: 'app-pipeline',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag],
  template: `
    <div class="pipeline">
      @if (loading()) {
        <p class="pipeline__msg">Loading pipeline…</p>
      } @else if (error()) {
        <p class="pipeline__msg pipeline__msg--error">{{ error() }}</p>
      } @else {
        <div class="kanban" cdkDropListGroup>
          @for (col of COLS; track col.status) {
            <section class="col" [style.--col-accent]="col.accent">
              <header class="col__head">
                <span class="col__label">{{ col.label }}</span>
                <span class="col__badge">{{ cards[col.status].length }}</span>
              </header>
              <div
                class="col__list"
                cdkDropList
                [cdkDropListData]="cards[col.status]"
                (cdkDropListDropped)="onDrop($event, col.status)"
              >
                @for (card of cards[col.status]; track card.id) {
                  <article class="card" cdkDrag>
                    <div class="card__company">{{ card.company || '–' }}</div>
                    <div class="card__title">{{ card.title || '–' }}</div>
                    <footer class="card__foot">
                      @if (card.score !== null && card.score !== undefined) {
                        <span class="card__score" [class]="scoreClass(card.score)">
                          {{ card.score }}%
                        </span>
                      }
                      <span class="card__date">{{
                        formatDate(card.appliedAt ?? card.updatedAt)
                      }}</span>
                    </footer>
                    <div class="card__placeholder" *cdkDragPlaceholder></div>
                  </article>
                }
                @if (cards[col.status].length === 0) {
                  <div class="col__empty">Drop here</div>
                }
              </div>
            </section>
          }
        </div>
      }
    </div>
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

      .pipeline__msg {
        color: var(--text-secondary);
        font-size: var(--text-sm);
        &--error {
          color: var(--color-danger, #ef4444);
        }
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
        background: var(--surface-raised, #1e1e2e);
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
        background: var(--surface-base, #13131f);
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
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }
        &.score--mid {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
        }
        &.score--low {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }
      }

      .card__date {
        font-size: 10px;
        color: var(--text-tertiary);
        margin-left: auto;
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

  readonly COLS = COLS;

  // Plain mutable object: CDK drag-drop needs stable array references.
  // loading/error are signals so the zoneless scheduler picks up changes.
  cards: Record<ApplicationStatus, PipelineCard[]> = {
    saved: [],
    applied: [],
    interview: [],
    offer: [],
    rejected: [],
  };

  readonly loading = signal(true);
  readonly error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const all = await this.db.listPipelineCards();
      for (const col of COLS) {
        this.cards[col.status] = all.filter((c) => c.status === col.status);
      }
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
    } catch {
      // Rollback optimistic move
      transferArrayItem(
        event.container.data,
        event.previousContainer.data,
        event.currentIndex,
        event.previousIndex,
      );
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

import { Component, inject, OnInit, signal } from '@angular/core';
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
  /** rejected / cancelled — collapsed into a side rail ("archive") unless the
   * user reveals them via the strip's Show archived toggle. */
  terminal: boolean;
}

// Pipeline shows only ACTIVE applications. "saved" jobs live in My Jobs
// (status filter); a job enters the board via the Apply wizard. Terminal
// columns (rejected/cancelled) act as the archive: collapsed to side rails
// by default, revealed on demand — there is no separate archived flag.
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
        <!-- summary strip -->
        <div class="strip">
          <span class="strip__stat">
            <b>{{ activeCount() }}</b> {{ t()('pipeline.active') }}
          </span>
          @if (overdueCount() > 0) {
            <span class="strip__div"></span>
            <span class="strip__overdue">
              <lucide-icon [img]="icons.alert" [size]="13" />
              {{ overdueCount() }} {{ t()('pipeline.overdue') }}
            </span>
          }
          @if (search().trim()) {
            <span class="strip__div"></span>
            <span class="strip__match">{{ matchCount() }} {{ t()('pipeline.match') }}</span>
          }
          <span class="strip__spacer"></span>
          <div class="strip__search">
            <lucide-icon [img]="icons.search" [size]="14" class="strip__search-icon" />
            <input
              type="text"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
              [placeholder]="t()('pipeline.search_placeholder')"
            />
            @if (search()) {
              <button
                class="strip__search-clear"
                [attr.aria-label]="t()('actions.close')"
                (click)="search.set('')"
              >
                <lucide-icon [img]="icons.close" [size]="13" />
              </button>
            }
          </div>
        </div>

        <!-- board -->
        <div class="board" cdkDropListGroup>
          @for (col of COLS; track col.status) {
            @if (col.terminal && isCollapsed(col.status)) {
              <!-- collapsed archival rail -->
              <section
                class="rail"
                [style.--col-accent]="col.accent"
                role="button"
                tabindex="0"
                [attr.title]="t()(col.labelKey)"
                (click)="toggleCollapsed(col.status)"
                (keydown.enter)="toggleCollapsed(col.status)"
              >
                <span class="rail__dot"></span>
                <span class="rail__label">{{ t()(col.labelKey) }}</span>
                <span class="rail__badge">{{ cards[col.status].length }}</span>
              </section>
            } @else {
              <section class="col" [style.--col-accent]="col.accent">
                <header class="col__head">
                  <span class="col__dot"></span>
                  <span class="col__label">{{ t()(col.labelKey) }}</span>
                  <span class="col__badge">{{ visibleCards(col.status).length }}</span>
                  <span class="strip__spacer"></span>
                  @if (col.terminal) {
                    <button
                      class="col__collapse"
                      [attr.aria-label]="t()(col.labelKey)"
                      (click)="toggleCollapsed(col.status)"
                    >
                      <lucide-icon [img]="icons.chevron" [size]="15" />
                    </button>
                  }
                </header>
                <div
                  class="col__list"
                  cdkDropList
                  [cdkDropListData]="cards[col.status]"
                  (cdkDropListDropped)="onDrop($event, col.status)"
                >
                  @for (card of visibleCards(col.status); track card.id) {
                    <article
                      class="card"
                      cdkDrag
                      role="button"
                      tabindex="0"
                      (click)="openQuickView(card)"
                      (keydown.enter)="openQuickView(card)"
                      (keydown.space)="openQuickView(card)"
                    >
                      <div class="card__top">
                        <span class="card__mono">{{ initials(card.company) }}</span>
                        <div class="card__id">
                          <div class="card__company">{{ card.company || placeholder }}</div>
                          <div class="card__role">{{ card.title || placeholder }}</div>
                        </div>
                        @if (card.priority) {
                          <span
                            class="card__flag"
                            [attr.data-priority]="card.priority"
                            [attr.title]="t()('pipeline.priority_' + card.priority)"
                          >
                            <lucide-icon [img]="icons.flag" [size]="14" />
                          </span>
                        }
                      </div>

                      @if (card.location) {
                        <div class="card__loc">
                          <lucide-icon [img]="icons.pin" [size]="11" />
                          <span>{{ card.location }}</span>
                        </div>
                      }

                      @if (col.status === 'interview' && card.currentStageOrder !== undefined) {
                        <div class="card__track">
                          <div class="card__track-head">
                            <span
                              class="card__track-dot"
                              [attr.data-status]="card.currentStageStatus"
                            ></span>
                            <span class="card__track-label">{{ card.currentStageLabel }}</span>
                            <span class="card__track-count">
                              {{ card.currentStageOrder }}/{{ stageTotal(card) }}
                            </span>
                          </div>
                          <div class="card__segs">
                            @for (filled of segments(card); track $index) {
                              <span class="card__seg" [class.is-filled]="filled"></span>
                            }
                          </div>
                        </div>
                      }

                      <div class="card__foot">
                        @if (card.score !== null && card.score !== undefined) {
                          <span class="card__ats" [class]="scoreClass(card.score)">
                            <span class="card__ats-dot"></span>
                            <span class="card__ats-val">{{ card.score }}</span>
                            <span class="card__ats-tag">ATS</span>
                          </span>
                        } @else {
                          <span class="card__noscore">{{ t()('pipeline.no_score') }}</span>
                        }
                        @if (card.overdue) {
                          <span class="card__due card__due--over">
                            <lucide-icon [img]="icons.alert" [size]="11" />
                            {{ t()('pipeline.overdue') }} · {{ formatDate(card.followUpAt) }}
                          </span>
                        } @else {
                          <span class="card__due">
                            <lucide-icon [img]="icons.clock" [size]="11" />
                            {{ formatDate(card.appliedAt ?? card.updatedAt) }}
                          </span>
                        }
                      </div>
                      <div class="card__placeholder" *cdkDragPlaceholder></div>
                    </article>
                  }
                  @if (visibleCards(col.status).length === 0) {
                    <div class="col__empty">
                      {{ search().trim() ? t()('pipeline.no_match') : t()('common.drop_here') }}
                    </div>
                  }
                </div>
              </section>
            }
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
        box-sizing: border-box;
      }

      .pipeline__board-empty {
        margin-top: var(--space-6);
      }

      /* Summary strip */
      .strip {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4) var(--space-5) var(--space-2);
        flex: 0 0 auto;
      }

      .strip__stat {
        font-size: var(--text-xs, 12px);
        color: var(--text-secondary);

        b {
          color: var(--text-primary);
          font-weight: 600;
        }
      }

      .strip__div {
        width: 1px;
        height: 12px;
        background: var(--border-default);
      }

      .strip__overdue,
      .strip__match {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--text-xs, 12px);
      }

      .strip__overdue {
        color: var(--warning);
      }

      .strip__match {
        color: var(--text-accent);
      }

      .strip__spacer {
        flex: 1;
      }

      .strip__search {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        height: 28px;
        padding: 0 var(--space-2);
        min-width: 180px;
        max-width: 260px;
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-input);

        &:focus-within {
          border-color: var(--accent);
        }

        .strip__search-icon {
          color: var(--text-tertiary);
          flex: 0 0 auto;
        }

        input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: var(--text-xs, 12px);
          outline: none;
        }
      }

      .strip__search-clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        border-radius: 4px;
        cursor: pointer;

        &:hover {
          color: var(--text-primary);
        }
      }

      /* Board */
      .board {
        display: flex;
        gap: var(--space-4);
        flex: 1;
        min-height: 0;
        overflow-x: auto;
        align-items: stretch;
        padding: var(--space-3) var(--space-5) var(--space-5);
      }

      /* Collapsed archival rail */
      .rail {
        flex: 0 0 auto;
        width: 44px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) 0;
        background: var(--surface-1);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-card);
        cursor: pointer;

        &:hover {
          background: var(--surface-hover);
          border-color: var(--border-strong);
        }

        &:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
      }

      .rail__dot {
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 2px;
        background: var(--col-accent);
      }

      .rail__label {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }

      .rail__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: var(--radius-badge);
        background: var(--surface-sunken);
        color: var(--text-tertiary);
        font-size: 11px;
        font-weight: 600;
      }

      /* Column */
      .col {
        flex: 0 0 288px;
        width: 288px;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .col__head {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 2px 4px 12px;
      }

      .col__dot {
        width: 8px;
        height: 8px;
        border-radius: 2px;
        background: var(--col-accent);
      }

      .col__label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-secondary);
      }

      .col__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: var(--radius-badge);
        background: var(--surface-sunken);
        color: var(--text-tertiary);
        font-size: 11px;
        font-weight: 600;
      }

      .col__collapse {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        border-radius: var(--radius-input);
        cursor: pointer;

        &:hover {
          background: var(--surface-hover);
          color: var(--text-primary);
        }
      }

      .col__list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-height: 120px;
        /* WKWebView (Tauri) clips the leading-edge border of a flex child
           flush against an overflow:auto container — a little padding keeps the
           empty drop-zone's top dashed border fully visible. */
        padding: 2px;
      }

      .col__empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        font-size: var(--text-xs, 12px);
        border: 1.5px dashed var(--border-default);
        border-radius: var(--radius-card);
        min-height: 120px;
        padding: var(--space-4);
        text-align: center;
        pointer-events: none;
      }

      /* Card */
      .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        position: relative;
        background: var(--surface-1);
        border-radius: var(--radius-card);
        padding: var(--space-3);
        border: 1px solid var(--border-subtle);
        cursor: grab;
        user-select: none;
        transition:
          box-shadow 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;

        &:active {
          cursor: grabbing;
        }

        &:hover {
          border-color: var(--border-strong);
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        &:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
      }

      .card__top {
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }

      .card__mono {
        flex: 0 0 auto;
        width: 30px;
        height: 30px;
        border-radius: var(--radius-input);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
      }

      .card__id {
        flex: 1;
        min-width: 0;
      }

      .card__company {
        font-family: var(--font-mono);
        font-size: var(--text-sm, 13px);
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card__role {
        font-family: var(--font-sans);
        font-size: var(--text-xs, 12px);
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 1px;
      }

      .card__flag {
        flex: 0 0 auto;
        display: flex;
        color: var(--text-tertiary);

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

      .card__loc {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        color: var(--text-tertiary);
        min-width: 0;

        span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        lucide-icon {
          flex: 0 0 auto;
        }
      }

      /* Interview stage track */
      .card__track {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .card__track-head {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--text-secondary);
      }

      .card__track-dot {
        width: 5px;
        height: 5px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--warning);

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

      .card__track-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card__track-count {
        margin-left: auto;
        flex: 0 0 auto;
        color: var(--text-tertiary);
        font-size: 10px;
      }

      .card__segs {
        display: flex;
        gap: 3px;
      }

      .card__seg {
        flex: 1;
        height: 3px;
        border-radius: 999px;
        background: var(--surface-sunken);

        &.is-filled {
          background: var(--warning);
        }
      }

      /* Footer */
      .card__foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }

      .card__ats {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 22px;
        padding: 0 8px;
        border-radius: var(--radius-badge);
        background: var(--surface-sunken);
        color: var(--text-secondary);

        &.score--high {
          color: var(--success);
        }
        &.score--mid {
          color: var(--warning);
        }
        &.score--low {
          color: var(--danger);
        }
      }

      .card__ats-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
      }

      .card__ats-val {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        color: currentColor;
      }

      .card__ats-tag {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.08em;
        color: var(--text-tertiary);
      }

      .card__noscore {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.06em;
        color: var(--text-tertiary);
      }

      .card__due {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .card__due--over {
        height: 22px;
        padding: 0 8px;
        border-radius: var(--radius-badge);
        background: var(--warning-tint);
        color: var(--warning);
        font-size: 10px;
        font-weight: 600;
      }

      /* CDK states */
      .cdk-drag-preview {
        box-shadow: var(--shadow-lg);
        border-radius: var(--radius-card);
        opacity: 0.95;
      }

      .cdk-drag-placeholder,
      .card__placeholder {
        background: var(--surface-sunken);
        border: 1.5px dashed var(--border-strong);
        border-radius: var(--radius-card);
        min-height: 84px;
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
  private readonly toast = inject(ToastService);
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
  // Terminal columns (rejected/cancelled) collapse to rails independently —
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
    if (!company) return '–';
    const words = company.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '–';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  stageTotal(card: PipelineCard): number {
    return Math.max(card.currentStageTotal ?? 0, card.currentStageOrder ?? 0);
  }

  /** Booleans for the segmented progress track — one per logged stage, filled
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

  /** Mirror the DB row onto the in-memory card. `overdue` is not a column —
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

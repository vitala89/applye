import { Injectable, inject, signal } from '@angular/core';
import type { Application, ApplicationStatus, InterviewStage, PipelineCard } from '@applye/core';
import { InterviewGateway, JobsGateway } from '@applye/data';

/** Statuses that count towards the board's "active" total. `saved` lives in My
 * Jobs, and the two terminal columns are the archive. */
const ACTIVE_STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer'];

/**
 * The Kanban board: the cards per column, the search box, which terminal
 * columns are collapsed, and which card the quick-view modal is showing.
 *
 * **`cards` is a mutable record and not a signal, and that is deliberate**
 * (ADR-0005, amendment thirty). CDK's `transferArrayItem` and `moveItemInArray`
 * mutate the arrays they are handed, and the drop handler's revert-on-failure
 * undoes a move by calling `transferArrayItem` back the other way. Rebuilding
 * that around immutable updates is a real change to the board's core
 * interaction, with its own risk and its own verification; it is not something
 * to do while moving the state one layer down. So the shape moved unchanged.
 *
 * The template renders it through this store's methods, and `OnPush` marks the
 * component dirty on its own event handlers - which is what makes a mutable
 * model render at all. The page's comment claimed default change detection; it
 * has been `OnPush` since it was written, and the comment was wrong about why
 * it works.
 */
@Injectable()
export class PipelineStore {
  private readonly db = inject(JobsGateway);
  /** Stages come from `InterviewGateway`; `db` stays for the board's cards
   * and status writes. */
  private readonly interview = inject(InterviewGateway);

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
  /** Terminal columns collapse to rails independently, both closed by default. */
  readonly collapsedCols = signal<ReadonlySet<ApplicationStatus>>(
    new Set<ApplicationStatus>(['rejected', 'cancelled']),
  );

  isCollapsed(status: ApplicationStatus): boolean {
    return this.collapsedCols().has(status);
  }

  toggleCollapsed(status: ApplicationStatus): void {
    const next = new Set(this.collapsedCols());
    if (next.has(status)) next.delete(status);
    else next.add(status);
    this.collapsedCols.set(next);
  }

  /** Never rejects: a failed read leaves the board empty, sets `error`, and
   * returns `false` so the page can say what went wrong. */
  async load(statuses: readonly ApplicationStatus[]): Promise<boolean> {
    this.loading.set(true);
    this.error.set('');
    try {
      const all = await this.db.listPipelineCards();
      for (const status of statuses) {
        this.cards[status] = all.filter((c) => c.status === status);
      }
      this.totalCards.set(all.length);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  // --- Board-summary derivations. Plain methods rather than computeds,
  // because they read the mutable `cards` above and a computed would not track
  // the imperative splices the drop and modal handlers perform. ---

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

  allCards(): PipelineCard[] {
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

  /**
   * Persists a card's new column. The caller has already moved the card in the
   * arrays, because CDK does that as part of the drop; this returns `false` if
   * the write failed so the caller can move it back.
   *
   * The card is refreshed from the row the database actually wrote: entering
   * `applied` or `interview` recomputes `applied_at` and `follow_up_at` - and
   * therefore `overdue` - in SQL, so mutating only `status` would leave the
   * footer badge and the modal's follow-up gate stale until a reload.
   */
  async persistStatus(card: PipelineCard, toStatus: ApplicationStatus): Promise<boolean> {
    this.error.set('');
    try {
      this.applyStatusToCard(card, await this.db.setApplicationStatus(card.id, toStatus));
      this.recount();
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }

  /** Whether the application has no stages yet, which is what decides if the
   * board offers to log the first one. `false` if the check itself fails: a
   * failed read must not produce a prompt on an application that may already
   * have stages. */
  async hasNoStages(applicationId: number): Promise<boolean> {
    try {
      const stages: InterviewStage[] = await this.interview.listInterviewStages(applicationId);
      return stages.length === 0;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }

  openQuickView(card: PipelineCard): void {
    this.selectedCard.set(card);
  }

  closeQuickView(): void {
    this.selectedCard.set(null);
  }

  /** Moves a card to the column its new status names, keeping it selected so
   * the open modal keeps showing the card it was showing. */
  applyModalStatus(app: Application): void {
    for (const status of Object.keys(this.cards) as ApplicationStatus[]) {
      const idx = this.cards[status].findIndex((c) => c.id === app.id);
      if (idx === -1) continue;
      const [card] = this.cards[status].splice(idx, 1);
      this.applyStatusToCard(card, app);
      (this.cards[app.status] ??= []).unshift(card);
      this.selectedCard.set(card);
      return;
    }
  }

  applyModalPriority(id: number, priority: PipelineCard['priority']): void {
    const card = this.allCards().find((c) => c.id === id);
    if (!card) return;
    card.priority = priority;
    this.selectedCard.set(card);
  }

  applyModalStage(id: number, stage: InterviewStage): void {
    const card = this.allCards().find((c) => c.id === id);
    if (!card) return;
    card.currentStageOrder = stage.stageOrder;
    card.currentStageLabel = stage.stageLabel;
    card.currentStageStatus = stage.status;
    card.currentStageTotal = Math.max(card.currentStageTotal ?? 0, stage.stageOrder);
    this.selectedCard.set(card);
  }

  private recount(): void {
    this.totalCards.set(Object.values(this.cards).reduce((s, arr) => s + arr.length, 0));
  }

  /** Mirrors the database row onto the in-memory card. `overdue` is not a
   * column - `db_pipeline_cards` derives it as `follow_up_at < date('now')` in
   * UTC - so the same predicate is replicated here to stay in sync with what a
   * reload would show. */
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
}

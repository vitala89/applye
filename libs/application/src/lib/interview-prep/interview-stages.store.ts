import { Injectable, inject, signal } from '@angular/core';
import type { InterviewStage, InterviewStageStatus, PipelineCard } from '@applye/core';
import { InterviewGateway, JobsGateway } from '@applye/data';
import { type StageFormValue, emptyStageForm, stageGatewayFields } from './interview-stage-form';

/**
 * One application's interview stages: the timeline, the add/edit modal, the
 * per-stage status menu and the delete confirmation.
 *
 * **Refusal and failure are different answers.** Every mutation returns `null`
 * when there was nothing to do - a blank label, a status that did not change, a
 * reorder past the end, a save already running - and `false` only when the
 * gateway actually failed, with `error` filled. The page stays silent on a
 * refusal and speaks on a failure; it does not translate here, and neither does
 * this store.
 *
 * The stage list is replaced rather than reloaded after every write: the
 * gateway returns the saved row, so re-querying would cost a round trip to
 * learn what we were just told.
 */
@Injectable()
export class InterviewStagesStore {
  private readonly db = inject(JobsGateway);
  /** Every stage operation comes from `InterviewGateway`; `db` stays for the
   * cards this store reads to find the application. */
  private readonly interview = inject(InterviewGateway);

  /** Set by `load`, so `create` does not need it threaded through. Routing
   * stays on the page: it reads the route and hands the id over. */
  readonly applicationId = signal(0);
  readonly application = signal<PipelineCard | null>(null);
  readonly stages = signal<InterviewStage[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly modalOpen = signal(false);
  readonly modalMode = signal<'add' | 'edit'>('add');
  readonly editingId = signal<number | null>(null);
  readonly form = signal<StageFormValue>(emptyStageForm());
  readonly labelError = signal(false);
  readonly saving = signal(false);

  readonly statusMenuId = signal<number | null>(null);
  readonly confirmStage = signal<InterviewStage | null>(null);

  /** Never rejects. A failed load leaves the timeline empty, which renders the
   * honest empty state rather than a half-populated one. */
  async load(id: number): Promise<boolean> {
    this.applicationId.set(id);
    this.loading.set(true);
    this.error.set('');
    try {
      const [cards, stages] = await Promise.all([
        this.db.listPipelineCards(),
        this.interview.listInterviewStages(id),
      ]);
      this.application.set(cards.find((c) => c.id === id) ?? null);
      this.stages.set(stages);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  // --- The modal ----------------------------------------------------------

  openAdd(): void {
    this.modalMode.set('add');
    this.editingId.set(null);
    this.form.set(emptyStageForm());
    this.labelError.set(false);
    this.modalOpen.set(true);
  }

  openEdit(stage: InterviewStage): void {
    this.statusMenuId.set(null);
    this.modalMode.set('edit');
    this.editingId.set(stage.id);
    this.form.set({
      stageType: stage.stageType,
      stageLabel: stage.stageLabel,
      scheduledAt: stage.scheduledAt ?? '',
      stageLanguage: stage.stageLanguage ?? '',
      interviewerName: stage.interviewerName ?? '',
      interviewerRole: stage.interviewerRole ?? '',
      interviewerEmail: stage.interviewerEmail ?? '',
      notes: stage.notes ?? '',
    });
    this.labelError.set(false);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  updateForm<K extends keyof StageFormValue>(key: K, value: StageFormValue[K]): void {
    this.form.set({ ...this.form(), [key]: value });
    if (key === 'stageLabel' && value) this.labelError.set(false);
  }

  /**
   * Returns `null` when it refused - a blank label, or a save already running.
   * A blank label sets `labelError` instead, which is the modal's own way of
   * saying so and needs no toast.
   */
  async saveModal(): Promise<boolean | null> {
    // Cleared before the refusal checks, not after them: a refusal that leaves
    // an earlier failure's message standing is a store whose `error` no longer
    // describes its last answer.
    this.error.set('');
    if (this.saving()) return null;
    const form = this.form();
    const label = form.stageLabel.trim();
    if (!label) {
      this.labelError.set(true);
      return null;
    }
    this.saving.set(true);
    try {
      if (this.modalMode() === 'add') {
        const nextOrder = this.stages().reduce((max, s) => Math.max(max, s.stageOrder), 0) + 1;
        const stage = await this.interview.createInterviewStage({
          applicationId: this.applicationId(),
          stageOrder: nextOrder,
          ...stageGatewayFields(form, label),
        });
        this.stages.set([...this.stages(), stage]);
      } else {
        const id = this.editingId();
        if (id == null) return null;
        const updated = await this.interview.updateInterviewStage({
          stageId: id,
          ...stageGatewayFields(form, label),
        });
        this.stages.set(this.stages().map((s) => (s.id === id ? updated : s)));
      }
      this.modalOpen.set(false);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  // --- Status, delete, reorder --------------------------------------------

  toggleStatusMenu(stage: InterviewStage): void {
    this.statusMenuId.update((m) => (m === stage.id ? null : stage.id));
  }

  closeMenus(): void {
    this.statusMenuId.set(null);
  }

  /** `null` when the status did not change - not a write, so not a failure. */
  async setStatus(stage: InterviewStage, status: InterviewStageStatus): Promise<boolean | null> {
    this.statusMenuId.set(null);
    this.error.set('');
    if (status === stage.status) return null;
    try {
      const updated = await this.interview.updateInterviewStage({ stageId: stage.id, status });
      this.stages.set(this.stages().map((s) => (s.id === stage.id ? updated : s)));
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }

  askDelete(stage: InterviewStage): void {
    this.statusMenuId.set(null);
    this.confirmStage.set(stage);
  }

  cancelDelete(): void {
    this.confirmStage.set(null);
  }

  /** Closes the confirmation either way: a failed delete has been reported, and
   * leaving the dialog open over a row that is still there says nothing more. */
  async confirmDelete(): Promise<boolean | null> {
    this.error.set('');
    const stage = this.confirmStage();
    if (!stage) return null;
    try {
      await this.interview.deleteInterviewStage(stage.id);
      this.stages.set(this.stages().filter((s) => s.id !== stage.id));
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    } finally {
      this.confirmStage.set(null);
    }
  }

  /** `null` at the ends of the list, where there is nothing to swap with. */
  moveUp(index: number): Promise<boolean | null> {
    this.error.set('');
    return index <= 0 ? Promise.resolve(null) : this.swapOrder(index, index - 1);
  }

  moveDown(index: number): Promise<boolean | null> {
    this.error.set('');
    return index >= this.stages().length - 1
      ? Promise.resolve(null)
      : this.swapOrder(index, index + 1);
  }

  /**
   * Swaps two stages' `stageOrder`. Nothing moves on screen until both writes
   * come back, so a failure leaves the timeline exactly as it was rather than
   * showing an order the database does not have.
   */
  private async swapOrder(a: number, b: number): Promise<boolean> {
    const list = this.stages();
    const stageA = list[a];
    const stageB = list[b];
    this.error.set('');
    try {
      const [updatedA, updatedB] = await Promise.all([
        this.interview.updateInterviewStage({ stageId: stageA.id, stageOrder: stageB.stageOrder }),
        this.interview.updateInterviewStage({ stageId: stageB.id, stageOrder: stageA.stageOrder }),
      ]);
      const next = [...list];
      next[a] = updatedB;
      next[b] = updatedA;
      next.sort((x, y) => x.stageOrder - y.stageOrder);
      this.stages.set(next);
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Flag,
  LucideAngularModule,
  Mail,
  X,
} from 'lucide-angular';
import {
  QuickViewStore,
  companyInitials,
  scoreClass,
  stageDone,
  stageIsCurrent,
  stageReached,
} from '@applye/application';
import { ToastService } from '@applye/application';
import {
  Application,
  ApplicationStatus,
  InterviewStage,
  PipelineCard,
  Priority,
  SupportedLanguage,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { StageQuickAddComponent } from '../stage-quick-add/stage-quick-add.component';
import { FOLLOWUP_LANGUAGES, FollowupDraftService } from '@applye/application';

const STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'cancelled'];
const PRIORITIES: Exclude<Priority, null>[] = ['low', 'medium', 'high'];

// Fast triage surface for a Pipeline card - status, priority, comments, and a
// link out. Deliberately shallow: no score/JD/tailoring/portal-answers here,
// that depth stays on /jobs/:id. Status changes go through the SAME
// db_set_application_status command the kanban drag-and-drop uses (via
// DbService.setApplicationStatus) - there is no second status-update path.
@Component({
  selector: 'app-quick-view-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, FormsModule, LucideAngularModule, StageQuickAddComponent],
  templateUrl: './quick-view-modal.component.html',
  styleUrl: './quick-view-modal.component.scss',
  host: { '(document:keydown.escape)': 'close()' },
  // Component-scoped: a follow-up draft belongs to the card this modal shows
  // and must not outlive it, which is the lifetime it had as component fields.
  providers: [FollowupDraftService, QuickViewStore],
})
export class QuickViewModalComponent {
  private readonly router = inject(Router);
  private readonly followup = inject(FollowupDraftService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly quick = inject(QuickViewStore);

  readonly card = input.required<PipelineCard>();

  @Output() closed = new EventEmitter<void>();
  @Output() statusChanged = new EventEmitter<Application>();
  @Output() priorityChanged = new EventEmitter<{ id: number; priority: Priority }>();
  @Output() stageAdded = new EventEmitter<{ id: number; stage: InterviewStage }>();

  protected readonly icons = {
    close: X,
    openExternal: ExternalLink,
    flag: Flag,
    mail: Mail,
    copy: Copy,
    check: Check,
    calendar: Calendar,
  };
  protected readonly STATUSES = STATUSES;
  protected readonly PRIORITIES = PRIORITIES;
  protected readonly FOLLOWUP_LANGUAGES = FOLLOWUP_LANGUAGES;

  // `promptDismissed` and `showQuickAdd` stay here: the gate reads `card()`,
  // which is this component's input (ADR-0005, amendment thirty-one). See the
  // "one write path outside Interview Prep" exception - the mini form only
  // ever shows right after a transition INTO interview when the application
  // has 0 stages yet.
  protected readonly promptDismissed = signal(false);
  // `stagesError` is part of the gate, not decoration. The form's precondition
  // is "this application has 0 stages", and the only evidence for that is a
  // read that came back. A failed read also leaves `stageSummary` null, so
  // without this the panel invited the user to log the FIRST interview stage
  // for an application that may already have several - and accepting would
  // write a duplicate. An unknown is not a zero.
  protected readonly showQuickAdd = computed(
    () =>
      this.card().status === 'interview' &&
      !this.quick.stagesLoading() &&
      !this.quick.stagesError() &&
      this.quick.stageSummary() === null &&
      !this.promptDismissed(),
  );

  // Draft follow-up. Aliases onto `FollowupDraftService`; the template binds
  // these names and writes several of them back via ngModel, so they stay the
  // same writable signals rather than views of them.
  protected readonly followupLanguage = this.followup.language;
  protected readonly followupSubject = this.followup.subject;
  protected readonly followupBody = this.followup.body;
  protected readonly followupDrafting = this.followup.drafting;
  protected readonly followupFromCache = this.followup.fromCache;
  protected readonly followupError = this.followup.error;
  protected readonly followupCopied = this.followup.copied;
  protected readonly followupTo = this.followup.to;
  protected readonly followupCc = this.followup.cc;
  protected readonly followupHasDraft = this.followup.hasDraft;

  constructor() {
    effect(() => {
      const card = this.card();
      this.promptDismissed.set(false);
      void this.loadComments(card.id);
      void this.refreshStages(card.id, card.status);
      this.followup.resetFor(card);
    });
  }

  protected async draftFollowup(): Promise<void> {
    try {
      await this.followup.draft(this.card());
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  protected langName(language: SupportedLanguage): string {
    return this.followup.langName(language);
  }

  protected onFollowupLanguageChange(language: SupportedLanguage): void {
    this.followup.changeLanguage(language);
  }

  protected copyFollowup(): Promise<void> {
    return this.followup.copy();
  }

  protected openFollowupInMail(): Promise<void> {
    return this.followup.openInMail();
  }

  private async loadComments(applicationId: number): Promise<void> {
    if (!(await this.quick.loadComments(applicationId))) {
      this.toast.error(this.quick.commentsError());
    }
  }

  /** Same shape as `loadComments`: an empty stage list means "no stages yet" to
   * the stepper, so a failed read has to say it was a failed read. */
  private async refreshStages(applicationId: number, status: ApplicationStatus): Promise<void> {
    if (!(await this.quick.refreshStages(applicationId, status))) {
      this.toast.error(this.quick.stagesError());
    }
  }

  /** The same monogram and score band the board card draws - literally the
   * same functions now, rather than a second copy whose comment claimed they
   * matched (ADR-0005, amendment thirty-one). */
  protected initials(): string {
    return companyInitials(this.card().company);
  }

  protected scoreClass(): string {
    return scoreClass(this.card().score);
  }

  protected stageDone(stage: InterviewStage): boolean {
    return stageDone(stage);
  }

  protected stageCurrent(stage: InterviewStage): boolean {
    return stageIsCurrent(stage, this.quick.stageSummary());
  }

  protected stageReached(stage: InterviewStage): boolean {
    return stageReached(stage, this.quick.stageSummary());
  }

  protected formatStageDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  protected onStageAdded(stage: InterviewStage): void {
    this.quick.noteStageAdded(stage);
    this.stageAdded.emit({ id: this.card().id, stage });
  }

  protected skipStagePrompt(): void {
    this.promptDismissed.set(true);
  }

  protected close(): void {
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  protected async onStatusSelect(status: ApplicationStatus): Promise<void> {
    const card = this.card();
    const updated = await this.quick.setStatus(card.id, card.status, status);
    if (!updated) {
      // Empty when the store refused rather than failed - same status, or a
      // write already running. Nothing to tell the user in that case.
      const message = this.quick.error();
      if (message) this.toast.error(message);
      return;
    }
    // Emit the whole row so the board can refresh applied_at / follow_up_at /
    // overdue too - not just the status literal (those are recomputed in SQL
    // on the applied/interview transitions).
    this.statusChanged.emit(updated);
    this.promptDismissed.set(false);
    await this.refreshStages(card.id, updated.status);
  }

  protected async onPrioritySelect(priority: Priority): Promise<void> {
    const card = this.card();
    if (await this.quick.setPriority(card.id, card.priority ?? null, priority)) {
      this.priorityChanged.emit({ id: card.id, priority });
      return;
    }
    const message = this.quick.error();
    if (message) this.toast.error(message);
  }

  protected async addComment(): Promise<void> {
    if (await this.quick.addComment(this.card().id)) {
      this.toast.success(this.t()('pipeline.comment_added'));
      return;
    }
    const message = this.quick.commentsError();
    if (message) this.toast.error(message);
  }

  /**
   * `/jobs/:id` is keyed by JOB id, but a `PipelineCard` is an application row -
   * its `id` is the application's. Passing the application id here opened an
   * unrelated job (whichever one happened to share that number), which then
   * offered "Mark as Applied" for a job the user had never applied to.
   *
   * `jobId` is nullable in the schema, so a card with no job is a no-op rather
   * than a navigation to `/jobs/undefined`.
   */
  protected openFullDetails(): void {
    const jobId = this.card().jobId;
    if (jobId == null) return;
    this.close();
    void this.router.navigate(['/jobs', jobId]);
  }

  protected viewAllStages(): void {
    const id = this.card().id;
    this.close();
    void this.router.navigate(['/interview-prep', id]);
  }

  protected formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

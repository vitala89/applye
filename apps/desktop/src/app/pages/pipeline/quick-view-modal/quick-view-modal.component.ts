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
import { DbService } from '@applye/data';
import { ToastService } from '../../../core/toast/toast.service';
import {
  Application,
  ApplicationStatus,
  Comment,
  InterviewStage,
  PipelineCard,
  Priority,
  SupportedLanguage,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { StageQuickAddComponent } from '../stage-quick-add/stage-quick-add.component';
import { FOLLOWUP_LANGUAGES, FollowupDraftService } from './followup-draft.service';

const STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'cancelled'];
const PRIORITIES: Exclude<Priority, null>[] = ['low', 'medium', 'high'];

/** Highest stage_order that isn't rejected/cancelled, or the most recent one
 * if all are closed - mirrors the SQL in db_pipeline_cards exactly, so the
 * modal's summary always matches the card footer. */
function pickCurrentStage(stages: InterviewStage[]): InterviewStage | null {
  if (!stages.length) return null;
  const open = stages.filter((s) => s.status !== 'rejected' && s.status !== 'cancelled');
  const pool = open.length ? open : stages;
  return pool.reduce((max, s) => (s.stageOrder > max.stageOrder ? s : max), pool[0]);
}

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
  providers: [FollowupDraftService],
})
export class QuickViewModalComponent {
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly followup = inject(FollowupDraftService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

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

  protected readonly statusBusy = signal(false);
  protected readonly priorityBusy = signal(false);

  protected readonly comments = signal<Comment[]>([]);
  protected readonly commentsLoading = signal(true);
  protected readonly commentsError = signal('');
  protected readonly commentText = signal('');
  protected readonly commentBusy = signal(false);

  // Stage summary / quick-add - see the "one write path outside Interview
  // Prep" exception: the mini form only ever shows right after a
  // transition INTO interview when the application has 0 stages yet.
  protected readonly stageSummary = signal<InterviewStage | null>(null);
  // Full ordered stage list powers the modal's segmented stepper; the summary
  // above is the single "current" stage for the headline + card footer.
  protected readonly stages = signal<InterviewStage[]>([]);
  protected readonly stagesLoading = signal(true);
  protected readonly promptDismissed = signal(false);
  protected readonly showQuickAdd = computed(
    () =>
      this.card().status === 'interview' &&
      !this.stagesLoading() &&
      this.stageSummary() === null &&
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
      void this.refreshStageState(card.id, card.status);
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
    this.commentsLoading.set(true);
    this.commentsError.set('');
    try {
      this.comments.set(await this.db.listApplicationComments(applicationId));
    } catch (e) {
      this.commentsError.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.commentsLoading.set(false);
    }
  }

  private async refreshStageState(applicationId: number, status: ApplicationStatus): Promise<void> {
    if (status !== 'interview') {
      this.stageSummary.set(null);
      this.stages.set([]);
      this.stagesLoading.set(false);
      return;
    }
    this.stagesLoading.set(true);
    try {
      const stages = await this.db.listInterviewStages(applicationId);
      this.stages.set([...stages].sort((a, b) => a.stageOrder - b.stageOrder));
      this.stageSummary.set(pickCurrentStage(stages));
    } finally {
      this.stagesLoading.set(false);
    }
  }

  /** 1-2 letter monogram from the company name, matching the board card. */
  protected initials(): string {
    const company = this.card().company?.trim();
    if (!company) return '-';
    const words = company.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  protected scoreClass(): string {
    const score = this.card().score;
    if (score == null) return '';
    if (score >= 75) return 'score--high';
    if (score >= 50) return 'score--mid';
    return 'score--low';
  }

  /** A stage counts as done once it has passed; the current (summary) stage is
   * highlighted as active in the stepper. */
  protected stageDone(stage: InterviewStage): boolean {
    return stage.status === 'passed';
  }

  protected stageCurrent(stage: InterviewStage): boolean {
    return this.stageSummary()?.id === stage.id;
  }

  /** A step (and the connector into it) is "reached" once the funnel has
   * advanced to at least its position - fills the progress track up to the
   * current stage. */
  protected stageReached(stage: InterviewStage): boolean {
    return stage.stageOrder <= (this.stageSummary()?.stageOrder ?? 0);
  }

  protected formatStageDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  protected onStageAdded(stage: InterviewStage): void {
    this.stageSummary.set(stage);
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
    if (status === card.status || this.statusBusy()) return;
    this.statusBusy.set(true);
    try {
      const updated = await this.db.setApplicationStatus(card.id, status);
      // Emit the whole row so the board can refresh applied_at / follow_up_at
      // / overdue too - not just the status literal (those are recomputed in
      // SQL on the applied/interview transitions).
      this.statusChanged.emit(updated);
      this.promptDismissed.set(false);
      await this.refreshStageState(card.id, updated.status);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.statusBusy.set(false);
    }
  }

  protected async onPrioritySelect(priority: Priority): Promise<void> {
    const card = this.card();
    if (priority === (card.priority ?? null) || this.priorityBusy()) return;
    this.priorityBusy.set(true);
    try {
      await this.db.setApplicationPriority(card.id, priority);
      this.priorityChanged.emit({ id: card.id, priority });
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.priorityBusy.set(false);
    }
  }

  protected async addComment(): Promise<void> {
    const text = this.commentText().trim();
    if (!text || this.commentBusy()) return;
    this.commentBusy.set(true);
    this.commentsError.set('');
    try {
      const comment = await this.db.addApplicationComment(this.card().id, text);
      this.comments.set([...this.comments(), comment]);
      this.commentText.set('');
      this.toast.success(this.t()('pipeline.comment_added'));
    } catch (e) {
      this.commentsError.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.commentBusy.set(false);
    }
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

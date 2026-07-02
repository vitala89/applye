import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ExternalLink, Flag, LucideAngularModule, X } from 'lucide-angular';
import { DbService } from '@applye/data';
import { ApplicationStatus, Comment, PipelineCard, Priority } from '@applye/core';
import { TranslateService } from '@applye/i18n';

const STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected'];
const PRIORITIES: Exclude<Priority, null>[] = ['low', 'medium', 'high'];

// Fast triage surface for a Pipeline card — status, priority, comments, and a
// link out. Deliberately shallow: no score/JD/tailoring/portal-answers here,
// that depth stays on /jobs/:id. Status changes go through the SAME
// db_set_application_status command the kanban drag-and-drop uses (via
// DbService.setApplicationStatus) — there is no second status-update path.
@Component({
  selector: 'app-quick-view-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './quick-view-modal.component.html',
  styleUrl: './quick-view-modal.component.scss',
})
export class QuickViewModalComponent {
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly card = input.required<PipelineCard>();

  @Output() closed = new EventEmitter<void>();
  @Output() statusChanged = new EventEmitter<{ id: number; status: ApplicationStatus }>();
  @Output() priorityChanged = new EventEmitter<{ id: number; priority: Priority }>();

  protected readonly icons = { close: X, openExternal: ExternalLink, flag: Flag };
  protected readonly STATUSES = STATUSES;
  protected readonly PRIORITIES = PRIORITIES;

  protected readonly statusBusy = signal(false);
  protected readonly priorityBusy = signal(false);

  protected readonly comments = signal<Comment[]>([]);
  protected readonly commentsLoading = signal(true);
  protected readonly commentsError = signal('');
  protected readonly commentText = signal('');
  protected readonly commentBusy = signal(false);

  constructor() {
    effect(() => {
      const card = this.card();
      void this.loadComments(card.id);
    });
  }

  private async loadComments(applicationId: number): Promise<void> {
    this.commentsLoading.set(true);
    this.commentsError.set('');
    try {
      this.comments.set(await this.db.listApplicationComments(applicationId));
    } catch (e) {
      this.commentsError.set(String(e));
    } finally {
      this.commentsLoading.set(false);
    }
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
      await this.db.setApplicationStatus(card.id, status);
      this.statusChanged.emit({ id: card.id, status });
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
    } catch (e) {
      this.commentsError.set(String(e));
    } finally {
      this.commentBusy.set(false);
    }
  }

  protected openFullDetails(): void {
    const id = this.card().id;
    this.close();
    void this.router.navigate(['/jobs', id]);
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

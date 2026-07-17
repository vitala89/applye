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
import { openUrl } from '@tauri-apps/plugin-opener';
import { AiService, DbService } from '@applye/data';
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

const STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'cancelled'];
const PRIORITIES: Exclude<Priority, null>[] = ['low', 'medium', 'high'];
const FOLLOWUP_LANGUAGES: SupportedLanguage[] = ['en', 'de', 'ru', 'es', 'fr', 'uk'];
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Spelled out for the prompt: a bare 2-letter code (esp. "uk") is ambiguous
// enough that weaker/economy models sometimes ignore it and default to
// English. The cache key still stores the short code.
const FOLLOWUP_LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'German',
  ru: 'Russian',
  es: 'Spanish',
  fr: 'French',
  uk: 'Ukrainian',
};

/** Highest stage_order that isn't rejected/cancelled, or the most recent one
 * if all are closed — mirrors the SQL in db_pipeline_cards exactly, so the
 * modal's summary always matches the card footer. */
function pickCurrentStage(stages: InterviewStage[]): InterviewStage | null {
  if (!stages.length) return null;
  const open = stages.filter((s) => s.status !== 'rejected' && s.status !== 'cancelled');
  const pool = open.length ? open : stages;
  return pool.reduce((max, s) => (s.stageOrder > max.stageOrder ? s : max), pool[0]);
}

// Fast triage surface for a Pipeline card — status, priority, comments, and a
// link out. Deliberately shallow: no score/JD/tailoring/portal-answers here,
// that depth stays on /jobs/:id. Status changes go through the SAME
// db_set_application_status command the kanban drag-and-drop uses (via
// DbService.setApplicationStatus) — there is no second status-update path.
@Component({
  selector: 'app-quick-view-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, FormsModule, LucideAngularModule, StageQuickAddComponent],
  templateUrl: './quick-view-modal.component.html',
  styleUrl: './quick-view-modal.component.scss',
  host: { '(document:keydown.escape)': 'close()' },
})
export class QuickViewModalComponent {
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly router = inject(Router);
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

  // Stage summary / quick-add — see the "one write path outside Interview
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

  // Draft follow-up — one cached AI call per (application, input). Applye
  // never sends anything: "Open in mail" hands a pre-filled mailto: link to
  // the user's own mail client, which is the only thing that can send it.
  protected readonly followupLanguage = signal<SupportedLanguage>('en');
  protected readonly followupSubject = signal('');
  protected readonly followupBody = signal('');
  protected readonly followupDrafting = signal(false);
  protected readonly followupFromCache = signal(false);
  protected readonly followupError = signal('');
  protected readonly followupCopied = signal(false);
  protected readonly followupTo = signal('');
  protected readonly followupCc = signal('');
  protected readonly followupHasDraft = computed(
    () => !!this.followupSubject() || !!this.followupBody(),
  );

  constructor() {
    effect(() => {
      const card = this.card();
      this.promptDismissed.set(false);
      void this.loadComments(card.id);
      void this.refreshStageState(card.id, card.status);
      this.followupLanguage.set(card.docLanguage ?? 'en');
      this.followupSubject.set('');
      this.followupBody.set('');
      this.followupFromCache.set(false);
      this.followupError.set('');
      this.followupCopied.set(false);
      this.followupTo.set('');
      this.followupCc.set('');
    });
  }

  private daysSinceApplied(): number {
    const appliedAt = this.card().appliedAt;
    if (!appliedAt) return 0;
    const elapsed = Date.now() - new Date(appliedAt).getTime();
    return Math.max(0, Math.round(elapsed / MS_PER_DAY));
  }

  private followupInputHash(model: string): Promise<string> {
    const card = this.card();
    return this.db.hashText(
      JSON.stringify({
        company: card.company ?? '',
        role: card.title ?? '',
        appliedAt: card.appliedAt ?? '',
        lang: this.followupLanguage(),
        model,
      }),
    );
  }

  protected async draftFollowup(): Promise<void> {
    if (this.followupDrafting()) return;
    const card = this.card();
    const settings = await this.db.getSettings();

    this.followupDrafting.set(true);
    this.followupError.set('');
    try {
      const inputHash = await this.followupInputHash(settings.economyModel);
      const cached = await this.db.followupDraftGet(card.id, inputHash);
      if (cached) {
        this.followupSubject.set(cached.subject);
        this.followupBody.set(cached.body);
        this.followupFromCache.set(true);
        return;
      }

      const daysOverdue = this.daysSinceApplied();
      const languageName = FOLLOWUP_LANGUAGE_NAMES[this.followupLanguage()];
      const rendered = await this.ai.renderSkill('followup', {
        company: card.company ?? '',
        role: card.title ?? '',
        days_overdue: String(daysOverdue),
        language: languageName,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language: this.followupLanguage(),
      });
      const parsed = this.parseFollowupDraft(res.text);
      this.followupSubject.set(parsed.subject);
      this.followupBody.set(parsed.body);
      this.followupFromCache.set(false);
      await this.db.followupDraftSave({
        applicationId: card.id,
        inputHash,
        language: this.followupLanguage(),
        subject: parsed.subject,
        body: parsed.body,
        modelUsed: settings.economyModel,
        tokensInput: res.tokensInput,
        tokensOutput: res.tokensOutput,
      });
    } catch (e) {
      this.followupError.set(String(e));
      this.toast.error(String(e));
    } finally {
      this.followupDrafting.set(false);
    }
  }

  // Some models double-escape newlines inside the JSON string value (e.g.
  // emit `\\n` instead of `\n`), which JSON.parse then turns into a literal
  // two-character "\n" in the output instead of a real line break. Normalize
  // that away; a correctly-escaped response is untouched by this regex since
  // it no longer contains a literal backslash at that point.
  private parseFollowupDraft(text: string): { subject: string; body: string } {
    const parsed = JSON.parse(text) as { subject?: string; body?: string };
    const clean = (s?: string) => (s ?? '').replace(/\\n/g, '\n').trim();
    return { subject: clean(parsed.subject), body: clean(parsed.body) };
  }

  protected langName(language: SupportedLanguage): string {
    return FOLLOWUP_LANGUAGE_NAMES[language];
  }

  protected onFollowupLanguageChange(language: SupportedLanguage): void {
    this.followupLanguage.set(language);
    this.followupSubject.set('');
    this.followupBody.set('');
    this.followupFromCache.set(false);
  }

  protected async copyFollowup(): Promise<void> {
    const text = `${this.followupSubject()}\n\n${this.followupBody()}`;
    await navigator.clipboard.writeText(text);
    this.followupCopied.set(true);
    setTimeout(() => this.followupCopied.set(false), 1500);
  }

  /** Opens the user's own mail client via `mailto:` — Applye never sends this
   * itself, and there is no other code path that transmits it anywhere.
   * Built by hand (not URLSearchParams) because mailto: query values use
   * RFC 3986 percent-encoding, where a space is `%20` — URLSearchParams
   * encodes spaces as `+`, which most mail clients show literally instead of
   * decoding. */
  protected async openFollowupInMail(): Promise<void> {
    const to = encodeURIComponent(this.followupTo().trim());
    const params = [
      ['subject', this.followupSubject()],
      ['cc', this.followupCc().trim()],
      ['body', this.followupBody()],
    ]
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    await openUrl(`mailto:${to}?${params}`);
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
    if (!company) return '–';
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
   * advanced to at least its position — fills the progress track up to the
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
      // / overdue too — not just the status literal (those are recomputed in
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
      this.toast.error(String(e));
    } finally {
      this.commentBusy.set(false);
    }
  }

  protected openFullDetails(): void {
    const id = this.card().id;
    this.close();
    void this.router.navigate(['/jobs', id]);
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

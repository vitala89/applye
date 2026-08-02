import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlarmClock,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CircleCheckBig,
  ClipboardPaste,
  Clock,
  FileText,
  LucideAngularModule,
  type LucideIconData,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Send,
  SquarePen,
  Sparkles,
  Trophy,
  Upload,
  User,
} from 'lucide-angular';
import { TranslateService } from '@applye/i18n';
import { DbService } from '@applye/data';
import {
  missingFields,
  parseProfileMd,
  pitchState,
  profileCompleteness,
  type JobOverview,
  type PipelineCard,
  type Profile,
} from '@applye/core';
import { OnboardingBannerComponent } from '../../core/onboarding/onboarding-banner.component';
import { WizardProgressService } from '../../shared/wizard-progress.service';
import { PasteJobModalService } from '../../shared/paste-job-modal/paste-job-modal.service';
import {
  daysOverdue,
  daysSince,
  monogram,
  MS_HOUR,
  type RecentRow,
  recentClaimedJobs,
  scheduledMs,
  SOON_HOURS,
  whenLabel,
} from './dashboard.util';

type Tone = 'warning' | 'accent' | 'neutral';
type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** One row of the "Needs attention" action queue - a single next action the
 * user can take right now, derived entirely from already-loaded data. */
interface QueueItem {
  id: string;
  icon: LucideIconData;
  iconTone: Tone;
  /** Left accent stripe on the card; only the most urgent kinds set it. */
  accent?: Tone;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  context: string;
  actionLabel: string;
  actionVariant: ButtonVariant;
  actionIcon?: LucideIconData;
  run: () => void;
}

/** One row of the Upcoming interviews / Recent jobs side panels. */
interface InterviewRow {
  applicationId: number;
  monogram: string;
  role: string;
  company: string;
  stage: string;
  when: string;
  soon: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, OnboardingBannerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly i18n = inject(TranslateService);
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly wizard = inject(WizardProgressService);
  private readonly pasteModal = inject(PasteJobModalService);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    active: Send,
    interviews: CalendarCheck,
    overdue: AlarmClock,
    offers: Trophy,
    caughtUp: CircleCheckBig,
    noInterviews: Calendar,
    noJobs: FileText,
    // quick actions
    paste: ClipboardPaste,
    tailor: Sparkles,
    import: Upload,
    // card leading icons
    cOverdue: Clock,
    cResume: SquarePen,
    cInterview: CalendarClock,
    cStale: RefreshCw,
    cProfile: User,
    cAddJob: Plus,
    // card action icons
    aFollowup: Send,
    aResume: Play,
    aPrep: Mic,
  };

  protected readonly loading = signal(true);
  private readonly cards = signal<PipelineCard[]>([]);
  private readonly overview = signal<JobOverview[]>([]);
  private readonly profile = signal<Profile | null>(null);
  /** hashText is an IPC call, so freshness is resolved once at load, not in a computed. */
  private readonly savedMdHash = signal<string | null>(null);
  /**
   * Name of the job the unfinished tailoring session belongs to.
   *
   * Resolved at load for the same reason as `savedMdHash`: naming the job can
   * reach the database, and the `queue` computed must stay synchronous.
   */
  private readonly resumeJobLabel = signal('');
  private readonly now = signal(Date.now());

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [cards, overview, profile] = await Promise.all([
        this.db.listPipelineCards(),
        this.db.listJobsOverview(),
        this.db.getProfile(),
      ]);
      this.cards.set(cards);
      this.overview.set(overview);
      this.profile.set(profile);
      this.resumeJobLabel.set(await this.describeProgressJob(overview));
      const text = (profile?.fullMd ?? '').trim();
      this.savedMdHash.set(text ? await this.db.hashText(text) : null);
      this.now.set(Date.now());
    } catch (err) {
      // A failed load leaves the signals empty, which renders the honest
      // empty/new-user state rather than a half-populated dashboard.
      console.error('Dashboard load failed', err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Name the job whose tailoring session is unfinished, for the resume card.
   *
   * `listJobsOverview()` returns only the jobs the user claimed, so a session
   * started on an analysed-but-unsaved job has no row there - and the card used
   * to render its caption with an empty tail. Falls back to the job row itself,
   * the same two-step lookup `WizardNavService.crossJobLabel` makes, and to
   * `#id` when even that read fails, so the card always says which job it
   * reopens instead of naming nothing.
   */
  private async describeProgressJob(rows: JobOverview[]): Promise<string> {
    const jobId = this.wizard.progress()?.jobId;
    if (jobId == null) return '';
    const row = rows.find((j) => j.id === jobId);
    const fromRow = row?.company ?? row?.title ?? '';
    if (fromRow) return fromRow;
    const job = await this.db.getJob(jobId).catch((err) => {
      console.error('Dashboard could not name the job with unfinished tailoring', err);
      return null;
    });
    return job?.company ?? job?.title ?? `#${jobId}`;
  }

  // --- Greeting ---------------------------------------------------------

  protected readonly greetingTitle = computed(() => {
    const h = new Date(this.now()).getHours();
    const key = h < 12 ? 'greet_morning' : h < 18 ? 'greet_afternoon' : 'greet_evening';
    return this.t()(`dashboard.${key}`);
  });

  // --- New-user / empty detection --------------------------------------

  // `listJobsOverview` returns unclaimed rows too since ADR-0004, so that My
  // Jobs can offer them behind a filter. The dashboard is not that filter.
  private readonly claimedJobs = computed(() => this.overview().filter((j) => j.claimed));

  protected readonly isNewUser = computed(
    () => this.claimedJobs().length === 0 && !(this.profile()?.fullMd ?? '').trim(),
  );

  // --- KPIs -------------------------------------------------------------

  private readonly activeCards = computed(() =>
    this.cards().filter(
      (c) => c.status === 'applied' || c.status === 'interview' || c.status === 'offer',
    ),
  );

  protected readonly kActive = computed(() => this.activeCards().length);
  protected readonly kOffers = computed(
    () => this.cards().filter((c) => c.status === 'offer').length,
  );
  protected readonly kOverdue = computed(() => this.cards().filter((c) => c.overdue).length);

  /** Future scheduled interview stages, soonest first, across all applications. */
  private readonly upcoming = computed<InterviewRow[]>(() => {
    const now = this.now();
    return this.cards()
      .filter(
        (c) =>
          c.currentStageStatus === 'scheduled' &&
          !!c.currentStageScheduledAt &&
          new Date(c.currentStageScheduledAt).getTime() >= now,
      )
      .map((c) => {
        const at = new Date(c.currentStageScheduledAt as string).getTime();
        return {
          applicationId: c.id,
          monogram: monogram(c.company),
          role: c.title ?? '',
          company: c.company ?? '',
          stage: c.currentStageLabel ?? '',
          when: whenLabel(c.currentStageScheduledAt as string, now),
          soon: at - now <= SOON_HOURS * MS_HOUR,
        };
      })
      .sort(
        (a, b) =>
          scheduledMs(this.cards(), a.applicationId) - scheduledMs(this.cards(), b.applicationId),
      );
  });

  protected readonly kInterviews = computed(() => this.upcoming().length);
  protected readonly upcomingTop = computed(() => this.upcoming().slice(0, 5));

  // --- Recent jobs ------------------------------------------------------

  protected readonly recentJobs = computed<RecentRow[]>(() =>
    recentClaimedJobs(this.overview(), this.t()),
  );

  // --- Action queue -----------------------------------------------------

  protected readonly queue = computed<QueueItem[]>(() => {
    if (this.isNewUser()) return this.newUserQueue();
    const items: QueueItem[] = [];

    // 1. Overdue follow-ups (most urgent).
    for (const c of this.cards().filter((x) => x.overdue)) {
      const days = daysOverdue(c.followUpAt, this.now());
      items.push({
        id: `overdue-${c.id}`,
        icon: this.icons.cOverdue,
        iconTone: 'warning',
        accent: 'warning',
        title: `${this.t()('dashboard.card_followup')} ${c.company ?? ''}`.trim(),
        badge:
          days > 0
            ? `${days} ${this.t()(`dashboard.${days === 1 ? 'day_overdue' : 'days_overdue'}`)}`
            : undefined,
        badgeTone: 'warning',
        context: this.t()('dashboard.card_followup_ctx'),
        actionLabel: this.t()('dashboard.card_followup_action'),
        actionVariant: 'primary',
        actionIcon: this.icons.aFollowup,
        run: () => this.go(`/pipeline?openCard=${c.id}`),
      });
    }

    // 2. Unfinished tailoring session.
    const wp = this.wizard.progress();
    if (wp) {
      items.push({
        id: `resume-${wp.jobId}`,
        icon: this.icons.cResume,
        iconTone: 'neutral',
        title: `${this.t()('dashboard.card_resume')} ${this.resumeJobLabel()}`.trim(),
        context: this.t()('dashboard.card_resume_ctx'),
        actionLabel: this.t()('dashboard.card_resume_action'),
        actionVariant: 'secondary',
        actionIcon: this.icons.aResume,
        run: () => this.go(`/jobs/${wp.jobId}`),
      });
    }

    // 3. Interviews within 48h.
    for (const iv of this.upcoming().filter((x) => x.soon)) {
      items.push({
        id: `interview-${iv.applicationId}`,
        icon: this.icons.cInterview,
        iconTone: 'accent',
        title: `${this.t()('dashboard.card_interview')} ${iv.company} ${this.t()('dashboard.card_interview_in')} ${iv.when}`,
        badge: iv.stage || undefined,
        badgeTone: 'accent',
        context: this.t()('dashboard.card_interview_ctx'),
        actionLabel: this.t()('dashboard.card_interview_action'),
        actionVariant: 'secondary',
        actionIcon: this.icons.aPrep,
        run: () => this.go(`/interview-prep/${iv.applicationId}`),
      });
    }

    // 4a. Per-job score staleness: a cached ATS score computed against an older
    // scoring profile than the current one. Capped + highest-fit first so a
    // profile regeneration (which stales every score at once) can't flood the
    // queue.
    const p = this.profile();
    const currentHash = p?.scoringHash;
    if (currentHash) {
      const stale = this.activeCards()
        .filter(
          (c) =>
            c.jobId != null &&
            c.score != null &&
            !!c.scoreProfileHash &&
            c.scoreProfileHash !== currentHash,
        )
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 3);
      for (const c of stale) {
        const days = daysSince(c.scoreAt, this.now());
        items.push({
          id: `score-stale-${c.id}`,
          icon: this.icons.cStale,
          iconTone: 'neutral',
          title: `${this.t()('dashboard.card_score_stale')} ${c.company ?? ''}`.trim(),
          badge:
            days > 0
              ? `${days} ${this.t()(`dashboard.${days === 1 ? 'day_old' : 'days_old'}`)}`
              : undefined,
          badgeTone: 'neutral',
          context: this.t()('dashboard.card_stale_ctx'),
          actionLabel: this.t()('dashboard.card_stale_action'),
          actionVariant: 'ghost',
          run: () => this.go(`/jobs/${c.jobId}`),
        });
      }
    }

    // 4b. Stale elevator pitch (profile-level; the pitch is not per-job).
    if (p) {
      const md = (p.fullMd ?? '').trim();
      if (
        md &&
        pitchState({
          mdDirty: false,
          savedMdHash: this.savedMdHash(),
          hasPitch: !!p.pitchMd,
          pitchHash: p.pitchHash,
        }) === 'stale'
      ) {
        items.push(this.pitchStaleItem());
      }
    }

    // 5. Low profile completeness.
    if (p) {
      const form = parseProfileMd(p.fullMd ?? '');
      const pct = profileCompleteness(form);
      if (pct < 100) {
        const left = missingFields(form).length;
        items.push({
          id: 'profile-complete',
          icon: this.icons.cProfile,
          iconTone: 'neutral',
          title: `${this.t()('dashboard.card_profile_pre')} ${pct}% ${this.t()('dashboard.card_profile_post')}`,
          badge: `${left} ${this.t()('dashboard.fields_left')}`,
          badgeTone: 'neutral',
          context: this.t()('dashboard.card_profile_ctx'),
          actionLabel: this.t()('dashboard.card_profile_action'),
          actionVariant: 'ghost',
          run: () => this.go('/profile'),
        });
      }
    }

    return items;
  });

  protected readonly isCaughtUp = computed(
    () => !this.loading() && !this.isNewUser() && this.queue().length === 0,
  );

  private pitchStaleItem(): QueueItem {
    return {
      id: 'stale-pitch',
      icon: this.icons.cStale,
      iconTone: 'neutral',
      title: this.t()('dashboard.card_stale_pitch'),
      context: this.t()('dashboard.card_stale_ctx'),
      actionLabel: this.t()('dashboard.card_stale_action'),
      actionVariant: 'ghost',
      run: () => this.go('/profile'),
    };
  }

  private newUserQueue(): QueueItem[] {
    return [
      {
        id: 'new-profile',
        icon: this.icons.cProfile,
        iconTone: 'accent',
        accent: 'accent',
        title: this.t()('dashboard.new_profile_title'),
        context: this.t()('dashboard.new_profile_ctx'),
        actionLabel: this.t()('dashboard.new_profile_action'),
        actionVariant: 'primary',
        run: () => this.go('/profile'),
      },
      {
        id: 'new-job',
        icon: this.icons.cAddJob,
        iconTone: 'neutral',
        title: this.t()('dashboard.new_job_title'),
        context: this.t()('dashboard.new_job_ctx'),
        actionLabel: this.t()('dashboard.new_job_action'),
        actionVariant: 'secondary',
        run: () => this.pasteModal.open(),
      },
    ];
  }

  // --- Navigation targets ----------------------------------------------

  protected go(path: string): void {
    void this.router.navigateByUrl(path);
  }

  protected pasteJob(): void {
    this.pasteModal.open();
  }
}

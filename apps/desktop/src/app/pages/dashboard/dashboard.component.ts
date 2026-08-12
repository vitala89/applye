import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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

import { missingFields, parseProfileMd, pitchState, profileCompleteness } from '@applye/core';
import { OnboardingBannerComponent } from '../../core/onboarding/onboarding-banner.component';
import { WizardProgressService } from '@applye/application';
import { PasteJobModalService } from '../../shared/paste-job-modal/paste-job-modal.service';
import {
  DashboardStore,
  daysOverdue,
  daysSince,
  type RecentRow,
  recentClaimedJobs,
} from '@applye/application';

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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, OnboardingBannerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  providers: [DashboardStore],
})
export class DashboardComponent {
  private readonly i18n = inject(TranslateService);
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

  protected readonly board = inject(DashboardStore);

  constructor() {
    // The wizard's progress is the app's, so the store is told how to read it
    // rather than reaching for the service itself.
    void this.board.load(() => this.wizard.progress()?.jobId);
  }

  // --- Greeting ---------------------------------------------------------

  protected readonly greetingTitle = computed(() => {
    const h = new Date(this.board.now()).getHours();
    const key = h < 12 ? 'greet_morning' : h < 18 ? 'greet_afternoon' : 'greet_evening';
    return this.t()(`dashboard.${key}`);
  });

  // --- Recent jobs ------------------------------------------------------

  protected readonly recentJobs = computed<RecentRow[]>(() =>
    recentClaimedJobs(this.board.overview(), this.t()),
  );

  // --- Action queue -----------------------------------------------------

  protected readonly queue = computed<QueueItem[]>(() => {
    if (this.board.isNewUser()) return this.newUserQueue();
    const items: QueueItem[] = [];

    // 1. Overdue follow-ups (most urgent).
    for (const c of this.board.cards().filter((x) => x.overdue)) {
      const days = daysOverdue(c.followUpAt, this.board.now());
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
        title: `${this.t()('dashboard.card_resume')} ${this.board.resumeJobLabel()}`.trim(),
        context: this.t()('dashboard.card_resume_ctx'),
        actionLabel: this.t()('dashboard.card_resume_action'),
        actionVariant: 'secondary',
        actionIcon: this.icons.aResume,
        run: () => this.go(`/jobs/${wp.jobId}`),
      });
    }

    // 3. Interviews within 48h.
    for (const iv of this.board.upcoming().filter((x) => x.soon)) {
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
    const p = this.board.profile();
    const currentHash = p?.scoringHash;
    if (currentHash) {
      const stale = this.board
        .activeCards()
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
        const days = daysSince(c.scoreAt, this.board.now());
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
          savedMdHash: this.board.savedMdHash(),
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
    () => !this.board.loading() && !this.board.isNewUser() && this.queue().length === 0,
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

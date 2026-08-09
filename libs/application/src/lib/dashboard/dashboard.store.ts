import { Injectable, computed, inject, signal } from '@angular/core';
import type { JobOverview, PipelineCard, Profile } from '@applye/core';
import { DbService } from '@applye/data';
import { MS_HOUR, SOON_HOURS, monogram, scheduledMs, whenLabel } from './dashboard.util';

/** One upcoming interview, ready for the list to render. */
export interface UpcomingInterview {
  applicationId: number;
  monogram: string;
  role: string;
  company: string;
  stage: string;
  when: string;
  /** Inside the 48-hour window, which the list marks. */
  soon: boolean;
}

/** What the store needs from the wizard to name an unfinished session, passed
 * in because `WizardProgressService` is the app's (ADR-0005, amendment
 * thirty-two). */
export type ProgressJobId = () => number | null | undefined;

/**
 * What the dashboard is showing: the pipeline cards, the jobs overview, the
 * profile, and the two values that had to be resolved at load because they
 * reach the database.
 *
 * **The action queue is not here.** Its items carry lucide icons, translated
 * strings and `run` closures that navigate or open a modal - view, i18n and
 * routing, which this layer has refused every time it was asked. The store
 * supplies the facts the queue is built from; the page builds it.
 *
 * `greetingTitle` and the recent-jobs rows stay on the page for the same
 * reason: both are translations.
 */
@Injectable()
export class DashboardStore {
  private readonly db = inject(DbService);

  readonly loading = signal(true);
  readonly cards = signal<PipelineCard[]>([]);
  readonly overview = signal<JobOverview[]>([]);
  readonly profile = signal<Profile | null>(null);

  /** `hashText` is an IPC call, so freshness is resolved once at load rather
   * than inside a computed. */
  readonly savedMdHash = signal<string | null>(null);

  /**
   * Name of the job the unfinished tailoring session belongs to.
   *
   * Resolved at load for the same reason as `savedMdHash`: naming the job can
   * reach the database, and the queue that renders it must stay synchronous.
   */
  readonly resumeJobLabel = signal('');

  /** Stamped at load, so every relative label on one render agrees about what
   * "now" was. */
  readonly now = signal(Date.now());

  /**
   * Never rejects. A failed load leaves the signals empty, which renders the
   * honest empty state rather than a half-populated dashboard - the behaviour
   * the page had, and the reason this returns `false` rather than throwing.
   */
  async load(progressJobId: ProgressJobId): Promise<boolean> {
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
      this.resumeJobLabel.set(await this.describeProgressJob(overview, progressJobId()));
      const text = (profile?.fullMd ?? '').trim();
      this.savedMdHash.set(text ? await this.db.hashText(text) : null);
      this.now.set(Date.now());
      return true;
    } catch {
      return false;
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
   * and to `#id` when even that read fails, so the card always says which job
   * it reopens instead of naming nothing.
   */
  private async describeProgressJob(
    rows: JobOverview[],
    jobId: number | null | undefined,
  ): Promise<string> {
    if (jobId == null) return '';
    const row = rows.find((j) => j.id === jobId);
    const fromRow = row?.company ?? row?.title ?? '';
    if (fromRow) return fromRow;
    const job = await this.db.getJob(jobId).catch(() => null);
    return job?.company ?? job?.title ?? `#${jobId}`;
  }

  // --- Derivations, all translation-free -------------------------------

  /** `listJobsOverview` returns unclaimed rows too since ADR-0004, so that My
   * Jobs can offer them behind a filter. The dashboard is not that filter. */
  readonly claimedJobs = computed(() => this.overview().filter((j) => j.claimed));

  readonly isNewUser = computed(
    () => this.claimedJobs().length === 0 && !(this.profile()?.fullMd ?? '').trim(),
  );

  readonly activeCards = computed(() =>
    this.cards().filter(
      (c) => c.status === 'applied' || c.status === 'interview' || c.status === 'offer',
    ),
  );

  readonly kActive = computed(() => this.activeCards().length);
  readonly kOffers = computed(() => this.cards().filter((c) => c.status === 'offer').length);
  readonly kOverdue = computed(() => this.cards().filter((c) => c.overdue).length);

  /** Future scheduled interview stages, soonest first, across all applications. */
  readonly upcoming = computed<UpcomingInterview[]>(() => {
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

  readonly kInterviews = computed(() => this.upcoming().length);
  readonly upcomingTop = computed(() => this.upcoming().slice(0, 5));
}

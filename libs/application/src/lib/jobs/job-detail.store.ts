import { Injectable, inject, signal } from '@angular/core';
import type {
  Application,
  DocumentLibraryItem,
  Job,
  Profile,
  Settings,
  SupportedLanguage,
} from '@applye/core';
import { DocumentsGateway, JobsGateway, JobsStore, ProfileSettingsGateway } from '@applye/data';
import { baseCvChoices } from './job-document-defaults';
import { ToastService } from '../shell/toast.service';
import { TranslateService } from '@applye/i18n';

/**
 * Everything the job-detail screen loads: the job itself, the profile and
 * settings it is judged against, the application row if the job is on the
 * board, and the document-library rows the apply wizard picks from.
 *
 * This is the last screen to come out of `COMPONENTS_STILL_USING_THE_GATEWAY`
 * (ADR-0005). The page held all four reads and the one write directly against
 * the data gateway; they are here now, and the page renders and orchestrates.
 *
 * **It deliberately stops at the data.** The load path on the page interleaves
 * these reads with six `apps/desktop` services - the cached score, the review
 * targets, the linked documents, the portal answers, the tailoring restore -
 * and `libs/application` cannot import any of them. So `loadJob` fetches
 * everything and answers whether the row existed; the page sequences its own
 * work afterwards. The alternative, passing five callbacks in, would put page
 * orchestration behind an argument list and make this store's tests depend on
 * stubs for services it has no business knowing about.
 *
 * Every read is fail-soft. A detail screen that renders without its settings is
 * worth more than one that renders an error, because the user can still paste,
 * re-score and save from it.
 */
@Injectable()
export class JobDetailStore {
  private readonly db = inject(ProfileSettingsGateway);
  private readonly jobsDb = inject(JobsGateway);
  private readonly docs = inject(DocumentsGateway);
  private readonly jobs = inject(JobsStore);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService).t;

  readonly job = signal<Job | null>(null);
  /** The pasted job description, seeded from the row and then edited in place
   * by the page's textarea. */
  readonly jdText = signal('');
  readonly profile = signal<Profile | null>(null);
  readonly settings = signal<Settings | null>(null);
  readonly application = signal<Application | null>(null);

  readonly coverLetters = signal<DocumentLibraryItem[]>([]);
  /** The CVs offered as a tailoring base for *this* job, already narrowed by
   * `baseCvChoices` - never the raw library. */
  readonly matchingCvs = signal<DocumentLibraryItem[]>([]);
  readonly selectedBaseCvId = signal<number | null>(null);

  /**
   * Why a fail-soft read gave up, when it did.
   *
   * Fail-soft is the right posture here - see the class note - but it left the
   * screen indistinguishable from a genuinely empty one: a missing profile read
   * as "no profile yet", and a job whose reads failed as "nothing scored yet".
   * Raised as a toast as well as held here, because the page that renders this
   * store is over its size budget and cannot take another alias; the signal is
   * what the tests and any future panel read.
   */
  readonly loadError = signal<string | null>(null);

  /** The profile and settings the whole screen is judged against. Non-fatal:
   * without them the user can still paste a job description. */
  async loadContext(): Promise<void> {
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      this.profile.set(profile);
      this.settings.set(settings);
      this.loadError.set(null);
    } catch (e) {
      this.fail(`${this.t()('jobs.detail_context_load_failed')} ${String(e)}`);
    }
  }

  /**
   * Load a job and everything stored alongside it. Returns false when the row
   * does not exist or a read failed, which is the page's signal to skip the
   * follow-up work rather than sequence it against a null job.
   */
  async loadJob(id: number): Promise<boolean> {
    try {
      const job = await this.jobsDb.getJob(id);
      if (!job) return false;
      this.job.set(job);
      this.jdText.set(job.jdText ?? '');

      const applications = await this.jobsDb.listApplications();
      const application = applications.find((a) => a.jobId === id) ?? null;
      this.application.set(application);

      await this.refreshLibrary();
      this.loadError.set(null);
      return true;
    } catch (e) {
      // non-fatal - the detail still renders and the user can re-score, but the
      // half-loaded screen has to say so rather than pass for an empty one.
      this.fail(`${this.t()('jobs.detail_load_failed')} ${String(e)}`);
      return false;
    }
  }

  /** Records a fail-soft read failure and raises it once. */
  private fail(message: string): void {
    this.loadError.set(message);
    this.toast.error(message);
  }

  /**
   * Re-read the document library and re-narrow the base-CV choices against the
   * job currently loaded.
   *
   * The narrowing runs on **every** path in. It used to run only on the initial
   * load, so returning from the document editor replaced the offer with the
   * whole library and the picker started listing CVs written for other jobs in
   * other languages.
   */
  async refreshLibrary(): Promise<void> {
    const job = this.job();
    if (!job) return;
    const [cvs, coverLetters] = await Promise.all([
      this.docs.documentLibraryList('cv'),
      this.docs.documentLibraryList('cover_letter'),
    ]);
    this.coverLetters.set(coverLetters);
    const choices = baseCvChoices(
      cvs,
      job,
      this.settings(),
      this.application()?.cvDocumentId ?? null,
    );
    this.matchingCvs.set(choices.matches);
    this.selectedBaseCvId.set(choices.selectedId);
  }

  /**
   * The application row this job's documents hang off, created on first need.
   *
   * Returns null rather than throwing when there is no job to attach one to, so
   * a caller that can carry on without one is not forced into a `try`. Callers
   * that cannot use `ensureApplicationOrThrow` below. The overview row is
   * patched in the same breath so My Jobs and the pipeline do not have to be
   * re-fetched to show the new status.
   */
  async ensureApplication(docLanguage: SupportedLanguage): Promise<Application | null> {
    const existing = this.application();
    if (existing) return existing;

    const job = this.job();
    if (!job?.id) return null;

    const created = await this.jobsDb.upsertApplication({
      jobId: job.id,
      status: 'saved',
      docLanguage,
      sourceUrl: job.source,
    });
    this.application.set(created);
    this.jobs.patchOverviewRow(job.id, { status: 'saved' });
    return created;
  }

  /**
   * The throwing variant, for the document flows that have nothing to do
   * without an application to attach the document to.
   *
   * It lives here rather than in each caller because there are two of them -
   * `JobDocumentsStore` and `JobDocumentDraftsStore` - and one cannot call the
   * other without closing a cycle. A translated `throw` copied into both would
   * be two places for one message to drift.
   */
  async ensureApplicationOrThrow(docLanguage: SupportedLanguage): Promise<Application> {
    const app = await this.ensureApplication(docLanguage);
    if (!app) throw new Error(this.t()('jobs.not_found_label'));
    return app;
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { Job } from '@applye/core';
import { AiService, DbService, JobSourceService, KeysService } from '@applye/data';
import { JobIdentityPromptService } from './job-identity-prompt/job-identity-prompt.service';

/** How an identify call ended, for the dialog to report honestly. */
export type AiOutcome = 'answered' | 'no-provider' | 'failed';

/** What one `job-identify` call came back with. Either field may be null. */
interface IdentifiedJob {
  company: string | null;
  title: string | null;
}

/**
 * Bound on the identify call, client side.
 *
 * `ai_run` allows ten minutes, which is right for a tailoring pass and absurd
 * for two short strings. Left at that, a provider that accepts the connection
 * and then says nothing holds the phase for ten minutes. Timing out here costs
 * the user a dialog they were going to see anyway.
 */
const IDENTIFY_TIMEOUT_MS = 45_000;

/**
 * Naming a job the deterministic rules could not name.
 *
 * **This does not run inside the parse.** The parse is over when the row is
 * written - it is deterministic, costs no tokens, and returns in milliseconds.
 * Identification is a second phase: an AI round-trip bounded by a network, then
 * a dialog bounded by nothing at all except the user. Holding the Parse button
 * disabled across either of those reports a parse that is not happening, and
 * across both of them reports one that may never end.
 *
 * So the phase runs here, on the root singleton, and survives the page being
 * left - the same shape `WizardActivityService` uses for the wizard's long
 * steps, corner badge and all. Nothing is lost by walking away: the job row
 * exists before this starts, so there is no work to cancel and no warning owed.
 *
 * The dialog is deliberately NOT raised from here. This marks a job as needing
 * a name; whoever is rendering that job opens it. A user who moved on to
 * Pipeline does not get a modal about a job they stopped looking at.
 */
@Injectable({ providedIn: 'root' })
export class JobIdentityResolverService {
  private readonly ai = inject(AiService);
  private readonly keys = inject(KeysService);
  private readonly db = inject(DbService);
  private readonly source = inject(JobSourceService);
  private readonly prompt = inject(JobIdentityPromptService);

  private readonly identifying = signal<number | null>(null);
  private readonly needsName = signal<number | null>(null);
  private readonly latest = signal<Job | null>(null);
  /**
   * How the last identify call went, per job. Carried into the dialog, because
   * "the posting does not name an employer" and "nothing read the posting" look
   * identical on screen and mean opposite things - and swallowing the second
   * one silently is what makes a working feature look like a broken one.
   */
  private readonly outcomes = new Map<number, AiOutcome>();
  /** What the failure said, kept alongside the outcome for the same reason. */
  private readonly errors = new Map<number, string>();

  /** The job an identify call is in flight for, or null. Drives the badge. */
  readonly identifyingJobId = this.identifying.asReadonly();
  /** A job the chain could not name and has not yet asked about. */
  readonly needsNameJobId = this.needsName.asReadonly();
  /** The most recent job this service rewrote, for its page to adopt. */
  readonly resolved = this.latest.asReadonly();
  /** True while the corner badge has anything to say. */
  readonly busy = computed(() => this.identifying() !== null || this.needsName() !== null);

  /**
   * Start the identification phase for a freshly parsed job. Returns at once;
   * the work continues after the caller, and after the page, are gone.
   */
  start(job: Job): void {
    if (!this.isIncomplete(job) || job.identityPromptSkipped) return;
    void this.identify(job);
  }

  /**
   * Drop the published job once its page has taken it.
   *
   * Deliberately does NOT touch `needsNameJobId`. Both are set by the same
   * identify call - the AI names the title, publishes, and then flags the
   * company as still missing - so clearing the flag here would cancel the very
   * dialog the flag exists to raise.
   */
  consumeResolved(jobId: number): void {
    if (this.latest()?.id === jobId) this.latest.set(null);
  }

  /** Forget a job entirely - it was deleted, so the badge must stop offering
   * a page that no longer exists. */
  clear(jobId: number): void {
    if (this.needsName() === jobId) this.needsName.set(null);
    this.outcomes.delete(jobId);
    this.errors.delete(jobId);
    this.consumeResolved(jobId);
  }

  /**
   * Ask the user about `job` and write what they say. Called by whoever has the
   * job on screen, which is what keeps the dialog off every other page.
   */
  async ask(job: Job): Promise<Job> {
    this.needsName.set(null);
    const answer = await this.prompt.ask({
      missingCompany: !job.company,
      missingTitle: !job.title,
      company: job.company ?? '',
      title: job.title ?? '',
      aiOutcome: this.outcomes.get(job.id) ?? 'no-provider',
      aiError: this.errors.get(job.id),
    });

    if (!answer) {
      await this.source.jobSkipIdentityPrompt(job.id).catch(() => undefined);
      return this.publish({ ...job, identityPromptSkipped: true });
    }

    // Only a field the user actually filled becomes theirs. Leaving one blank
    // is not a claim about it, so whatever source it already had is kept.
    const named = await this.source.jobSetIdentity(
      job.id,
      answer.title || job.title,
      answer.company || job.company,
      answer.title ? 'user' : job.titleSource,
      answer.company ? 'user' : job.companySource,
    );
    return this.publish(named);
  }

  /**
   * The whole chain on demand, for the "Name it yourself" button: the AI gets
   * another turn, then the dialog opens whether or not a skip was recorded.
   */
  async askAgain(job: Job): Promise<Job> {
    const identified = await this.identify({ ...job, identityPromptSkipped: false }, false);
    return this.ask(identified);
  }

  private isIncomplete(job: Job): boolean {
    return !job.company || !job.title;
  }

  private publish(job: Job): Job {
    this.latest.set(job);
    return job;
  }

  /**
   * `flag` marks the job as needing a name when the call leaves it incomplete.
   * The on-demand path passes false, because it is about to ask regardless.
   */
  private async identify(job: Job, flag = true): Promise<Job> {
    this.identifying.set(job.id);
    try {
      const named = await this.callIdentify(job);
      if (flag && this.isIncomplete(named)) this.needsName.set(job.id);
      return named;
    } finally {
      if (this.identifying() === job.id) this.identifying.set(null);
    }
  }

  /**
   * One `job-identify` call, on the economy model. Skipped entirely when no
   * provider is configured, which is also the whole flow for a user who has
   * never set up AI: the dialog follows directly.
   */
  private async callIdentify(job: Job): Promise<Job> {
    this.outcomes.set(job.id, 'no-provider');
    this.errors.delete(job.id);
    if (!job.jdText) return job;
    try {
      // Read from the database rather than from `SettingsService`, whose
      // `current()` is only populated by a `load()` nothing in the app calls -
      // so it was null on every run and the AI step silently never happened.
      // A read per identification also means a provider configured a minute ago
      // is picked up without a reload.
      const s = await this.db.getSettings();
      if (!s) return job;
      // In CLI mode the bridge binary is the credential, and probing it costs a
      // process spawn per parse; in API mode the keychain answers instantly.
      if (s.aiMode === 'api' && !(await this.keys.hasProviderKey(s.provider))) return job;
      this.outcomes.set(job.id, 'failed');

      const rendered = await this.ai.renderSkill('job-identify', {
        job_description: job.jdText,
      });
      const res = await this.withTimeout(
        this.ai.run({
          mode: s.aiMode,
          provider: s.provider,
          model: s.economyModel,
          systemPrompt: rendered.systemPrompt,
          userPrompt: rendered.userPrompt,
        }),
      );
      const identified = this.parse(res.text);
      this.outcomes.set(job.id, 'answered');
      const company = job.company || identified.company || undefined;
      const title = job.title || identified.title || undefined;
      if (company === job.company && title === job.title) return job;

      // Both values are stored as `inferred`, so neither is ever presented as a
      // quotation from the posting, and neither outranks a later real
      // extraction. A field the AI did not name keeps the source it had.
      return this.publish(
        await this.source.jobSetIdentity(
          job.id,
          title,
          company,
          title && title !== job.title ? 'inferred' : job.titleSource,
          company && company !== job.company ? 'inferred' : job.companySource,
        ),
      );
    } catch (e) {
      // An offline provider, a refusal, a timeout, malformed JSON: none of them
      // are worth more than the dialog that follows. But the reason is kept and
      // shown there, because a step that fails invisibly looks like a step that
      // was never written.
      this.errors.set(job.id, String(e));
      return job;
    }
  }

  private withTimeout<T>(work: Promise<T>): Promise<T> {
    return Promise.race([
      work,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('job-identify timed out')), IDENTIFY_TIMEOUT_MS),
      ),
    ]);
  }

  private parse(text: string): IdentifiedJob {
    const raw = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(raw) as Partial<IdentifiedJob>;
    return {
      company: this.clean(parsed.company),
      title: this.clean(parsed.title),
    };
  }

  /** A model that cannot name a field is expected to return null - but "null",
   * "unknown" and an empty string all mean the same thing and all arrive. */
  private clean(value: string | null | undefined): string | null {
    const v = (value ?? '').trim();
    if (!v) return null;
    return ['null', 'unknown', 'n/a', 'none'].includes(v.toLowerCase()) ? null : v;
  }
}

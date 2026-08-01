import { Injectable, inject } from '@angular/core';
import { Job } from '@applye/core';
import { AiService, JobSourceService, KeysService, SettingsService } from '@applye/data';
import { JobIdentityPromptService } from './job-identity-prompt/job-identity-prompt.service';

/** What one `job-identify` call came back with. Either field may be null. */
interface IdentifiedJob {
  company: string | null;
  title: string | null;
}

/**
 * Naming a job the deterministic rules could not name.
 *
 * One press of Parse & filter carries the whole chain: the rules run first and
 * cost nothing, a single `job-identify` call runs only if they missed, and the
 * dialog follows only if that missed too. The AI step is deliberately not
 * behind its own button - it runs exactly when a button would have been worth
 * pressing, and three presses on every badly formatted posting is worse than
 * one.
 *
 * Everything here is best effort. A job with no company is a job with a
 * placeholder where the company goes, which is what part A already renders; a
 * failure to improve on that must never fail the parse.
 */
@Injectable({ providedIn: 'root' })
export class JobIdentityResolverService {
  private readonly ai = inject(AiService);
  private readonly keys = inject(KeysService);
  private readonly settings = inject(SettingsService);
  private readonly source = inject(JobSourceService);
  private readonly prompt = inject(JobIdentityPromptService);

  /**
   * Fill in whatever the parse left missing, and return the job as it now
   * stands. Returns the job untouched when nothing is missing.
   */
  async resolve(job: Job): Promise<Job> {
    if (!this.isIncomplete(job)) return job;

    let current = await this.identifyWithAi(job);
    if (!this.isIncomplete(current)) return current;
    if (current.identityPromptSkipped) return current;

    const answer = await this.prompt.ask({
      missingCompany: !current.company,
      missingTitle: !current.title,
      company: current.company ?? '',
      title: current.title ?? '',
    });

    if (!answer) {
      await this.source.jobSkipIdentityPrompt(current.id).catch(() => undefined);
      return { ...current, identityPromptSkipped: true };
    }

    // Only a field the user actually filled becomes theirs. Leaving one blank
    // is not a claim about it, so whatever source it already had is kept.
    current = await this.source.jobSetIdentity(
      current.id,
      answer.title || current.title,
      answer.company || current.company,
      answer.title ? 'user' : current.titleSource,
      answer.company ? 'user' : current.companySource,
    );
    return current;
  }

  /** Opens the dialog for a job on demand, after a Skip or from the card. */
  askAgain(job: Job): Promise<Job> {
    return this.resolve({ ...job, identityPromptSkipped: false });
  }

  private isIncomplete(job: Job): boolean {
    return !job.company || !job.title;
  }

  /**
   * One `job-identify` call, on the economy model. Skipped entirely when no
   * provider is configured, which is also the whole flow for a user who has
   * never set up AI: the dialog follows directly.
   */
  private async identifyWithAi(job: Job): Promise<Job> {
    const s = this.settings.current();
    if (!s || !job.jdText) return job;
    try {
      // In CLI mode the bridge binary is the credential, and probing it costs a
      // process spawn per parse; in API mode the keychain answers instantly.
      if (s.aiMode === 'api' && !(await this.keys.hasProviderKey(s.provider))) return job;

      const rendered = await this.ai.renderSkill('job-identify', {
        job_description: job.jdText,
      });
      const res = await this.ai.run({
        mode: s.aiMode,
        provider: s.provider,
        model: s.economyModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
      });
      const identified = this.parse(res.text);
      const company = job.company || identified.company || undefined;
      const title = job.title || identified.title || undefined;
      if (company === job.company && title === job.title) return job;

      // Both values are stored as `inferred`, so neither is ever presented as a
      // quotation from the posting, and neither outranks a later real
      // extraction. A field the AI did not name keeps the source it had.
      return await this.source.jobSetIdentity(
        job.id,
        title,
        company,
        title && title !== job.title ? 'inferred' : job.titleSource,
        company && company !== job.company ? 'inferred' : job.companySource,
      );
    } catch {
      // A missing key, an offline provider, a refusal, malformed JSON: none of
      // them are worth failing a parse over. The dialog is the fallback.
      return job;
    }
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

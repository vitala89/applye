import { Injectable } from '@angular/core';
import {
  FetchedJob,
  IdentityPrecedence,
  IdentitySource,
  Job,
  UrlClassification,
} from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Getting a job into the system: from raw pasted text, or from a link.
 *
 * Split out of `DbService`, the flat wrapper over every `db_*` command that was
 * then well past its size budget and has since been cut into eight gateways. These three belong together for a reason
 * beyond arithmetic - they are the one path where a job's identity is decided
 * rather than read back, which is what makes `precedence` below meaningful.
 */
@Injectable({ providedIn: 'root' })
export class JobSourceService {
  /**
   * Parse a pasted job description into a job row.
   *
   * `precedence` says what `title`/`company` are worth against what the text
   * says; see `IdentityPrecedence`. It defaults to `authoritative`, which is
   * what a caller holding structured fields from a job board needs.
   *
   * `jobId` names the job being re-parsed, and passing it is what keeps an
   * edited description on the job the user is looking at. Without it the text's
   * hash is the identity, so an edit matches no existing job and starts a new
   * one - correct for a first paste, wrong for every re-parse.
   */
  jobPaste(
    jdText: string,
    title?: string,
    company?: string,
    precedence: IdentityPrecedence = 'authoritative',
    jobId?: number,
  ): Promise<Job> {
    return tauriInvoke<Job>('job_paste', { jdText, title, company, precedence, jobId });
  }

  /**
   * Write a job's company and title, and where each came from.
   *
   * Used by the AI identification step (`inferred`) and by the dialog that asks
   * the user (`user`). It updates the job row's identity columns only - the JD
   * text and its hash are untouched, so naming a company cannot fork the job or
   * invalidate the score cached against its description.
   */
  jobSetIdentity(
    jobId: number,
    title: string | undefined,
    company: string | undefined,
    titleSource: IdentitySource | undefined,
    companySource: IdentitySource | undefined,
  ): Promise<Job> {
    return tauriInvoke<Job>('job_set_identity', {
      jobId,
      title,
      company,
      titleSource,
      companySource,
    });
  }

  /** Records that the user declined to name this job, so the dialog does not
   * come back on the next parse. */
  jobSkipIdentityPrompt(jobId: number): Promise<void> {
    return tauriInvoke<void>('job_skip_identity_prompt', { jobId });
  }

  /** 0-token allowlist check: is this URL an open/ATS source, or a closed board? */
  classifyJobUrl(url: string): Promise<UrlClassification> {
    return tauriInvoke<UrlClassification>('classify_job_url', { url });
  }

  /** Fetches title/company/JD text from an Allowed-classified URL only. */
  fetchJobFromUrl(url: string): Promise<FetchedJob> {
    return tauriInvoke<FetchedJob>('fetch_job_from_url', { url });
  }
}

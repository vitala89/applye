import { Injectable } from '@angular/core';
import { FetchedJob, IdentityPrecedence, Job, UrlClassification } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Getting a job into the system: from raw pasted text, or from a link.
 *
 * Split out of `DbService`, which is a flat wrapper over every `db_*` command
 * and is well past its size budget. These three belong together for a reason
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
   */
  jobPaste(
    jdText: string,
    title?: string,
    company?: string,
    precedence: IdentityPrecedence = 'authoritative',
  ): Promise<Job> {
    return tauriInvoke<Job>('job_paste', { jdText, title, company, precedence });
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

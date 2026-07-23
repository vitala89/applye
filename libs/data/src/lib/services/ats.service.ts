import { Injectable } from '@angular/core';
import { AtsReport } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Deterministic ATS check. Pure and local: no database row, no network, no
 * tokens, and the same answer every time for the same inputs - which is the
 * point, since the previous ATS verdict was a model opinion that varied run to
 * run. Safe to re-run on every CV edit.
 */
@Injectable({ providedIn: 'root' })
export class AtsService {
  /**
   * @param cvText  the tailored CV as markdown - structural signals (tables,
   *                images, links, headings) are read from the text itself.
   * @param region  CV region tag ("de", "us", ...). Decides whether a photo is
   *                expected or a liability.
   */
  check(cvText: string, jobDescription: string, region?: string | null): Promise<AtsReport> {
    return tauriInvoke<AtsReport>('ats_check_run', {
      cvText,
      jobDescription,
      region: region ?? null,
    });
  }
}

import { Injectable, inject } from '@angular/core';
import { Job, Profile, Settings, SupportedLanguage } from '@applye/core';
import { DbService } from '@applye/data';
import { CvGapDialogService } from './cv-gap-dialog.service';
import { GapFillHooks } from './gap-fill';

/**
 * Library label for a generated artifact, naming the company and role it was
 * tailored for so the Documents list is unambiguous, e.g.
 * "Acme - Senior Frontend Engineer - Tailored CV".
 */
export function jobDocLabel(job: Job, suffix: string): string {
  const base = [job.company, job.title].filter(Boolean).join(' - ') || 'Job';
  return `${base} - ${suffix}`;
}

/** What a document flow knows when it asks for the gap-fill bundle. */
export interface JobGapFillContext {
  job: Job;
  settings: Settings | null;
  language: SupportedLanguage;
  profile: Profile | null;
  /** Receives the profile as saved, so the page holds what the database holds. */
  applyProfile: (profile: Profile) => void;
}

/**
 * The gap-fill hooks the CV and cover letter flows both hand to their draft
 * service, and the profile write behind one of them.
 *
 * Both flows assembled the same four callbacks inline, which is one bundle of
 * knowledge written twice. The profile write in particular is worth owning in
 * one place: `upsertProfile` replaces the whole row, so a payload that names
 * only `fullMd` silently discards the scoring cache, the pitch and the
 * archetypes - the bug this repository knows as #97.
 */
@Injectable()
export class JobGapFillService {
  private readonly db = inject(DbService);
  private readonly gapSvc = inject(CvGapDialogService);

  /**
   * Appends an answered gap block to the profile. Whole-row-replace safe: every
   * other field is carried forward explicitly.
   *
   * A failed write is not swallowed here. The caller decides - `gap-fill`'s
   * `saveBlockBestEffort` treats it as best-effort, because by the time it runs
   * the answers are already in the text being generated from.
   */
  async appendToProfile(
    profile: Profile | null,
    block: string,
    applyProfile: (profile: Profile) => void,
  ): Promise<void> {
    if (!profile || !block) return;
    const updated = await this.db.upsertProfile({
      fullMd: `${profile.fullMd}\n\n${block}`,
      scoringJson: profile.scoringJson,
      scoringHash: profile.scoringHash,
      pitchMd: profile.pitchMd,
      pitchHash: profile.pitchHash,
      targetArchetypes: profile.targetArchetypes,
    });
    applyProfile(updated);
  }

  /** The bundle a draft service expects, bound to one job and one language. */
  hooks(ctx: JobGapFillContext): GapFillHooks {
    return {
      // Fail-open: the dialog service reports its own failure and returns
      // `ok: false`, so a bad analysis never blocks generation - and never
      // passes for "no gaps found" either.
      analyzeGaps: (text) => this.gapSvc.analyze(text, ctx.job, ctx.settings, ctx.language),
      askGaps: (questions) => this.gapSvc.ask(questions),
      saveToProfile: (block) => this.appendToProfile(ctx.profile, block, ctx.applyProfile),
    };
  }
}

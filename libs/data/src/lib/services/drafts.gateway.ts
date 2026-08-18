import { Injectable } from '@angular/core';
import {
  FollowupDraft,
  PortalAnswer,
  SaveFollowupDraftInput,
  SavePortalAnswersInput,
  SaveTailoringInput,
  TailoringCache,
} from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The three AI draft caches: a tailoring pass, a set of portal answers, and a
 * follow-up message.
 *
 * **The first of the per-domain gateways `db.service.ts` is being cut into.**
 * `CODE_QUALITY.md` used to record that the cut happens "when the ratchet
 * refuses the next method added to it, not before"; the maintainer superseded
 * that on 2026-08-19 and the file now says so. `DbService` keeps everything not
 * yet migrated, and shrinks by one domain per pull request until it is gone -
 * so a method being here rather than there is a statement about what has moved,
 * not about what belongs where.
 *
 * These three are one domain because they are one shape: each is keyed on a
 * hash of everything that went into the generation, each returns `null` on a
 * miss rather than throwing, and each is read by exactly one service. **Nothing
 * else in the application reads any of them** - which is what made this the
 * smallest safe domain to prove the pattern on.
 *
 * The hash itself is not here. `hashText` has a dozen callers across profile,
 * documents, dashboard and jobs, so it is genuinely cross-cutting and goes to
 * the system gateway later rather than being duplicated into each domain that
 * happens to key a cache.
 */
@Injectable({ providedIn: 'root' })
export class DraftsGateway {
  async tailoringCacheGet(
    jobId: number,
    pass: number,
    inputHash: string,
  ): Promise<TailoringCache | null> {
    return tauriInvoke<TailoringCache | null>('tailoring_cache_get', { jobId, pass, inputHash });
  }

  async tailoringCacheSave(input: SaveTailoringInput): Promise<TailoringCache> {
    return tauriInvoke<TailoringCache>('tailoring_cache_save', { input });
  }

  async portalAnswersGet(
    jobId: number,
    profileHash: string,
    inputHash: string,
  ): Promise<PortalAnswer | null> {
    return tauriInvoke<PortalAnswer | null>('portal_answers_get', {
      jobId,
      profileHash,
      inputHash,
    });
  }

  async portalAnswersSave(input: SavePortalAnswersInput): Promise<PortalAnswer> {
    return tauriInvoke<PortalAnswer>('portal_answers_save', { input });
  }

  async followupDraftGet(applicationId: number, inputHash: string): Promise<FollowupDraft | null> {
    return tauriInvoke<FollowupDraft | null>('followup_draft_get', { applicationId, inputHash });
  }

  async followupDraftSave(input: SaveFollowupDraftInput): Promise<FollowupDraft> {
    return tauriInvoke<FollowupDraft>('followup_draft_save', { input });
  }
}

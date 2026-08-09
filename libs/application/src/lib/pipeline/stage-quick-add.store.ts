import { Injectable, inject, signal } from '@angular/core';
import type { InterviewStage, StageType } from '@applye/core';
import { DbService } from '@applye/data';

/** The stage types the quick-add form offers, in the order it offers them. */
export const STAGE_TYPES: StageType[] = [
  'hr_screen',
  'technical',
  'system_design',
  'behavioral',
  'final',
  'other',
];

/**
 * The one interview-stage write allowed outside Interview Prep: right after an
 * application's status changes to interview, the pipeline offers to log the
 * first stage. Always skippable, and the caller only renders the form when the
 * application has no stages yet - so `stageOrder` is 1 by construction.
 *
 * **The draft fields live here and not on the component** because `busy` and
 * `error` are what ADR-0005 calls "what is in flight", and splitting a form's
 * three fields from the two signals describing its submission is the shape this
 * ADR was written against (amendment twenty-six).
 *
 * **It does not toast.** `submit` returns the created stage or `null` and
 * leaves `error` set; the component decides what the user is told, the same
 * boundary `OnboardingBannerStore` keeps against `OnboardingService`
 * (amendment three).
 */
@Injectable()
export class StageQuickAddStore {
  private readonly db = inject(DbService);

  readonly stageType = signal<StageType>('hr_screen');
  readonly stageLabel = signal('');
  readonly scheduledAt = signal('');
  readonly busy = signal(false);
  readonly error = signal('');

  /**
   * Returns `null` without touching the gateway when there is nothing to save
   * or a save is already running - the guard the component's submit handler
   * carried, kept next to the state it guards.
   */
  async submit(applicationId: number): Promise<InterviewStage | null> {
    const stageLabel = this.stageLabel().trim();
    if (!stageLabel || this.busy()) return null;
    this.busy.set(true);
    this.error.set('');
    try {
      return await this.db.createInterviewStage({
        applicationId,
        stageOrder: 1,
        stageType: this.stageType(),
        stageLabel,
        scheduledAt: this.scheduledAt() || undefined,
      });
    } catch (e) {
      this.error.set(String(e));
      return null;
    } finally {
      this.busy.set(false);
    }
  }
}

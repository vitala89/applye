import { Injectable } from '@angular/core';
import {
  CreateInterviewStageInput,
  InterviewPrep,
  InterviewStage,
  SaveInterviewPrepBatchInput,
  UpdateInterviewStageInput,
} from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Interview rounds and the prep written against them: the stages of an
 * application, and the question/answer batches attached to a stage.
 *
 * **The third per-domain gateway** - see `CODE_QUALITY.md` for the migration
 * and `DraftsGateway` for the pattern.
 *
 * **`deleteJob` was sitting in this section** with no banner of its own, the
 * same mis-filing `DiscoverGateway` found six application methods under. It did
 * not travel here; it went back to the Jobs section, because deleting a job is
 * not an interview operation even though deleting one cascades to its stages.
 *
 * The two halves are one domain because prep is addressed **by stage**:
 * `listInterviewPrep` and `saveInterviewPrepBatch` take a stage id, so a
 * gateway holding one without the other would split a single foreign key across
 * two tokens.
 */
@Injectable({ providedIn: 'root' })
export class InterviewGateway {
  async createInterviewStage(input: CreateInterviewStageInput): Promise<InterviewStage> {
    return tauriInvoke<InterviewStage>('create_interview_stage', { input });
  }

  /** Partial patch - only stageId is required; other fields keep their current value. */
  async updateInterviewStage(input: UpdateInterviewStageInput): Promise<InterviewStage> {
    return tauriInvoke<InterviewStage>('update_interview_stage', { input });
  }

  async deleteInterviewStage(stageId: number): Promise<void> {
    return tauriInvoke<void>('delete_interview_stage', { stageId });
  }

  /** Ordered by id ascending - insertion order across every generated batch. */
  async listInterviewPrep(stageId: number): Promise<InterviewPrep[]> {
    return tauriInvoke<InterviewPrep[]>('list_interview_prep', { stageId });
  }

  /** Inserts one row per card, all sharing inputHash. The caller checks
   *  listInterviewPrep for an existing hash before calling AI at all - this
   *  command never dedupes, so it must not be called on a cache hit. */
  async saveInterviewPrepBatch(input: SaveInterviewPrepBatchInput): Promise<InterviewPrep[]> {
    return tauriInvoke<InterviewPrep[]>('save_interview_prep_batch', { input });
  }

  /** Ordered by stageOrder ascending. */
  async listInterviewStages(applicationId: number): Promise<InterviewStage[]> {
    return tauriInvoke<InterviewStage[]>('list_interview_stages', { applicationId });
  }
}

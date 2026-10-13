import { Injectable } from '@angular/core';
import {
  AnalyticsFacts,
  Application,
  ApplicationStatus,
  Comment,
  PipelineCard,
  Priority,
} from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * Application tracking: the application row, pipeline cards, status, priority,
 * comments, and the per-application facts the analytics screen aggregates.
 *
 * Tracker field edits are not here. `updateApplicationTrackerFields` lives on
 * `TrackerGateway`. A status change stays here even when the tracker screen
 * triggers it, because status is application lifecycle, not a tracker column.
 *
 * `getAnalyticsFacts` stays here because the facts are per-application signals.
 * The analytics screen is the only caller, and a one-method analytics gateway
 * would not be a real boundary.
 *
 * Two naming traps, both pinned by the spec: `set_application_priority`,
 * `add_application_comment`, and `list_application_comments` carry no `db_`
 * prefix, and the two sibling setters disagree about their first argument.
 * `db_set_application_status` sends `id`. `set_application_priority` sends
 * `applicationId`. `listPipelineCards` invokes `db_pipeline_cards` and
 * `getAnalyticsFacts` invokes `db_analytics_facts`.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationsGateway {
  async listApplications(): Promise<Application[]> {
    return tauriInvoke<Application[]>('db_list_applications');
  }

  async listPipelineCards(): Promise<PipelineCard[]> {
    return tauriInvoke<PipelineCard[]>('db_pipeline_cards');
  }

  /** Raw per-application signals + follow-up timestamps for the Analytics
   *  screen; all aggregation happens client-side via `computeAnalytics`. */
  async getAnalyticsFacts(): Promise<AnalyticsFacts> {
    return tauriInvoke<AnalyticsFacts>('db_analytics_facts');
  }

  async upsertApplication(
    application: Partial<Application> & Pick<Application, 'jobId' | 'status'>,
  ): Promise<Application> {
    return tauriInvoke<Application>('db_upsert_application', { application });
  }

  async setApplicationStatus(id: number, status: ApplicationStatus): Promise<Application> {
    return tauriInvoke<Application>('db_set_application_status', { id, status });
  }

  /** Pipeline quick-view priority flag - distinct from the legitimacy tier. */
  async setApplicationPriority(applicationId: number, priority: Priority): Promise<Application> {
    return tauriInvoke<Application>('set_application_priority', { applicationId, priority });
  }

  async addApplicationComment(applicationId: number, commentText: string): Promise<Comment> {
    return tauriInvoke<Comment>('add_application_comment', { applicationId, commentText });
  }

  /** Oldest → newest, for the quick-view comment feed. */
  async listApplicationComments(applicationId: number): Promise<Comment[]> {
    return tauriInvoke<Comment[]>('list_application_comments', { applicationId });
  }
}

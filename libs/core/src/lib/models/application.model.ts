import { SupportedLanguage } from '../types/common.types';
import { InterviewStageStatus } from './interview.model';

export type ApplicationStatus =
  'saved' | 'applied' | 'interview' | 'offer' | 'rejected' | 'cancelled';

/**
 * All application statuses in funnel order. Single source for the status
 * option lists that were previously hardcoded per-view (job detail dropdown,
 * My Jobs filter, pipeline columns).
 */
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'saved',
  'applied',
  'interview',
  'offer',
  'rejected',
  'cancelled',
] as const;

export type ApplicationMethod = 'online_form' | 'email' | 'portal';

export type Priority = 'low' | 'medium' | 'high' | null;

export interface Application {
  id: number;
  jobId: number;
  status: ApplicationStatus;
  applicationMethod?: ApplicationMethod;
  appliedAt?: string;
  followUpAt?: string;
  cvPath?: string;
  coverLetterPath?: string;
  /** Which `document_library` doc was used - the frozen `cvPath` /
   * `coverLetterPath` snapshot above is never rewritten when the library doc
   * is later edited (Agentur report accuracy). */
  cvDocumentId?: number;
  coverLetterDocumentId?: number;
  contractType?: string;
  eorProvider?: string;
  docLanguage: SupportedLanguage;
  notes?: string;
  sourceUrl?: string;
  contactName?: string;
  contactRole?: string;
  contactChannel?: string;
  nextAction?: string;
  nextActionAt?: string;
  salaryRange?: string;
  priority?: Priority;
  updatedAt: string;
}

/** Job Tracker inline-edit payload - only the fields the screen lets the
 * user edit directly. Narrower than `Application` on purpose (see the Rust
 * command doc comment): a full upsert would clobber cv/cover-letter paths. */
export interface ApplicationTrackerFieldsInput {
  id: number;
  contactName?: string;
  contactRole?: string;
  contactChannel?: string;
  nextAction?: string;
  nextActionAt?: string;
  salaryRange?: string;
  notes?: string;
  /** JSON blob of custom-column values; omit to leave existing values intact. */
  customFields?: string;
}

export interface StatusHistory {
  id: number;
  applicationId: number;
  status: ApplicationStatus;
  changedAt: string;
}

export interface PipelineCard {
  id: number;
  jobId?: number;
  status: ApplicationStatus;
  appliedAt?: string;
  followUpAt?: string;
  overdue: boolean;
  updatedAt?: string;
  company?: string;
  title?: string;
  location?: string;
  docLanguage?: SupportedLanguage;
  score?: number;
  /** The scoring_cache.profile_hash the `score` was computed against (equals the
   * profile.scoringHash at scoring time). A score is stale once this no longer
   * matches the current profile's scoringHash. */
  scoreProfileHash?: string;
  /** ISO timestamp the cached score was created - powers the "N days old" badge. */
  scoreAt?: string;
  priority?: Priority;
  currentStageOrder?: number;
  currentStageLabel?: string;
  currentStageStatus?: InterviewStageStatus;
  currentStageScheduledAt?: string;
  /** Total interview stages logged - the "M" in the card's "stage N of M"
   * progress track. */
  currentStageTotal?: number;
}

export interface Comment {
  id: number;
  applicationId: number;
  commentText: string;
  createdAt: string;
}

/** AI-drafted follow-up email for an overdue application, cached by
 * (applicationId, inputHash). Applye never sends this - the frontend opens
 * it via `mailto:` so the user's own mail client sends it. */
export interface FollowupDraft {
  id: number;
  applicationId: number;
  inputHash: string;
  language: SupportedLanguage;
  subject: string;
  body: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
  createdAt?: string;
}

export interface SaveFollowupDraftInput {
  applicationId: number;
  inputHash: string;
  language: SupportedLanguage;
  subject: string;
  body: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
}

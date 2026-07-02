import { SupportedLanguage } from '../types/common.types';
import { InterviewStageStatus } from './interview.model';

export type ApplicationStatus = 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';

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

/** Job Tracker inline-edit payload — only the fields the screen lets the
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
  score?: number;
  priority?: Priority;
  currentStageOrder?: number;
  currentStageLabel?: string;
  currentStageStatus?: InterviewStageStatus;
}

export interface Comment {
  id: number;
  applicationId: number;
  commentText: string;
  createdAt: string;
}

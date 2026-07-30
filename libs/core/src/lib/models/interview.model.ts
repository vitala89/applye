import { SupportedLanguage } from '../types/common.types';

export type StageType =
  'hr_screen' | 'technical' | 'system_design' | 'behavioral' | 'final' | 'other';

/**
 * scheduled - has a confirmed scheduledAt.
 * awaitingScheduling - passed the previous stage, this one not yet booked.
 * awaitingResponse - interview happened, waiting to hear back.
 * passed - cleared this stage.
 * rejected - ends the process (syncs the parent application's kanban status).
 * cancelled - ended without a rejection verdict (no sync).
 */
export type InterviewStageStatus =
  'scheduled' | 'awaiting_scheduling' | 'awaiting_response' | 'passed' | 'rejected' | 'cancelled';

export type PrepFormat = 'qa' | 'star';

export interface InterviewStage {
  id: number;
  applicationId: number;
  stageOrder: number;
  stageType: StageType;
  /** Free-text name the user sees everywhere - the primary field, not stageType. */
  stageLabel: string;
  scheduledAt?: string;
  status: InterviewStageStatus;
  stageLanguage?: SupportedLanguage;
  interviewerName?: string;
  interviewerRole?: string;
  interviewerEmail?: string;
  notes?: string;
}

export interface CreateInterviewStageInput {
  applicationId: number;
  stageOrder: number;
  stageType: StageType;
  stageLabel: string;
  scheduledAt?: string;
  stageLanguage?: SupportedLanguage;
  interviewerName?: string;
  interviewerRole?: string;
  interviewerEmail?: string;
  notes?: string;
}

export interface UpdateInterviewStageInput {
  stageId: number;
  stageOrder?: number;
  stageType?: StageType;
  stageLabel?: string;
  scheduledAt?: string;
  status?: InterviewStageStatus;
  stageLanguage?: SupportedLanguage;
  interviewerName?: string;
  interviewerRole?: string;
  interviewerEmail?: string;
  notes?: string;
}

export interface InterviewPrep {
  id: number;
  stageId: number;
  format: PrepFormat;
  language: SupportedLanguage;
  question: string;
  answer: string;
  starSituation?: string;
  starTask?: string;
  starAction?: string;
  starResult?: string;
  starReflection?: string;
  inputHash: string;
  modelUsed: string;
  createdAt: string;
}

export interface NewPrepCardInput {
  question?: string;
  answer?: string;
  starSituation?: string;
  starTask?: string;
  starAction?: string;
  starResult?: string;
  starReflection?: string;
}

export interface SaveInterviewPrepBatchInput {
  stageId: number;
  format: PrepFormat;
  language: SupportedLanguage;
  inputHash: string;
  modelUsed: string;
  cards: NewPrepCardInput[];
}

export interface Pitch {
  id: number;
  scope: 'default' | 'application';
  applicationId?: number;
  language: SupportedLanguage;
  pitchText: string;
  durationHint: '30s' | '60s' | '2min';
  inputHash: string;
  isUserEdited: boolean;
  modelUsed: string;
  createdAt: string;
  updatedAt: string;
}

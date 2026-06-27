import { SupportedLanguage } from '../types/common.types';

export type StageType =
  | 'hr_screen'
  | 'technical'
  | 'system_design'
  | 'behavioral'
  | 'final';

export type PrepFormat = 'qa' | 'star';

export interface InterviewStage {
  id: number;
  applicationId: number;
  stageOrder: number;
  stageType: StageType;
  stageLabel: string;
  scheduledAt?: string;
  status: 'upcoming' | 'done';
  stageLanguage: SupportedLanguage;
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

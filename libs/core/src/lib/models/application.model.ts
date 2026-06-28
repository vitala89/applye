import { SupportedLanguage } from '../types/common.types';

export type ApplicationStatus = 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';

export type ApplicationMethod = 'online_form' | 'email' | 'portal';

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
  updatedAt: string;
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
  updatedAt?: string;
  company?: string;
  title?: string;
  score?: number;
}

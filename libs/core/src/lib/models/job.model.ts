export interface Job {
  id: number;
  company?: string;
  title?: string;
  jdText?: string;
  jdHash?: string;
  source?: string;
  location?: string;
  language?: string;
  salaryMin?: number;
  blueCardEligible?: boolean;
  hardFilterPassed?: boolean;
  createdAt?: string;
}

export interface ScoringCache {
  id: number;
  jobId: number;
  profileHash: string;
  jdHash: string;
  language?: string;
  score: number;
  dimensionsJson?: string;
  missingKeywordsJson?: string;
  redFlagsJson?: string;
  atsPass?: boolean;
  atsNotes?: string;
  summary?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
  createdAt?: string;
}

export interface ScoreDimension {
  name: string;
  score: number;
  comment: string;
}

export interface ScoringResult {
  score: number;
  dimensions: ScoreDimension[];
  missingKeywords: string[];
  redFlags: string[];
  atsPass: boolean;
  atsNotes: string;
  summary: string;
}

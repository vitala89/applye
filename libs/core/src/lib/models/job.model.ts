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
  legitimacyTier?: string;
  legitimacyNotes?: string;
  importedFrom?: string;
  discoverDismissed?: boolean;
  discoverShownAt?: string;
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
  beforeYouSubmitJson?: string;
  atsPass?: boolean;
  atsNotes?: string;
  summary?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
  errorMessage?: string;
  createdAt?: string;
}

/** One row in the My Jobs table: job columns + latest score + current status. */
export interface JobOverview {
  id: number;
  company?: string;
  title?: string;
  source?: string;
  location?: string;
  legitimacyTier?: string;
  createdAt?: string;
  score?: number;
  status?: string;
}

/** AI-drafted answers to a portal's open-ended questions (cached per job). */
export interface PortalAnswer {
  id: number;
  jobId?: number;
  profileHash?: string;
  questionsJson?: string;
  answersJson?: string;
  inputHash?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
  createdAt?: string;
}

/** Cached rejection-pattern analysis over aggregated application data. */
export interface PatternAnalysis {
  id: number;
  inputHash?: string;
  analysisJson?: string;
  recommendationsJson?: string;
  sampleSize?: number;
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

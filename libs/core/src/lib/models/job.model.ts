export interface Job {
  id: number;
  company: string;
  title: string;
  jdText: string;
  jdHash: string;
  source: string;
  location: string;
  language: string;
  salaryMin?: number;
  blueCardEligible?: boolean;
  hardFilterPassed?: boolean;
  createdAt: string;
}

export interface ScoringCache {
  id: number;
  jobId: number;
  profileHash: string;
  jdHash: string;
  score: number;
  dimensionsJson: string;
  missingKeywordsJson: string;
  redFlagsJson: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
  createdAt: string;
}

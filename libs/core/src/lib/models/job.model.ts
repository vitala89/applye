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

/** One row of the Job Tracker (applications + jobs + last status change). */
export interface TrackerRow {
  id: number;
  appliedAt?: string;
  company?: string;
  title?: string;
  location?: string;
  method?: string;
  status?: string;
  notes?: string;
  lastUpdate?: string;
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

/** One row extracted by the import-tracklist skill (Phase 6.4). `status` is
 * raw text — normalization happens deterministically in Rust. */
export interface ImportRawRow {
  company?: string | null;
  role?: string | null;
  status?: string | null;
  appliedAt?: string | null;
  notes?: string | null;
}

/** A raw row after deterministic status normalization + dedupe check, shown
 * to the user for confirmation before anything is written. */
export interface ImportPreviewRow extends ImportRawRow {
  company: string;
  role: string;
  status: string;
  isDuplicate: boolean;
}

export interface ImportSkipped {
  row: number;
  reason: string;
}

export interface ImportResult {
  inserted: number;
  skippedDuplicate: number;
}

/** Result of classify_job_url — legal-first host allowlist check (0 tokens).
 * `Closed` covers both known closed boards and unrecognized domains (the
 * app never scrapes either); `boardName` names the board when known. */
export type UrlClassification =
  | { kind: 'allowed'; source: string }
  | { kind: 'closed'; boardName: string }
  | { kind: 'unknown' };

/** Parsed job fetched from an allowed open/ATS source's public API. */
export interface FetchedJob {
  title: string;
  company: string;
  jdText: string;
}

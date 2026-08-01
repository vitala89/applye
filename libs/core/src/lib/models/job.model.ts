/**
 * What a caller's title/company are worth against what the job description text
 * says, when pasting a job.
 *
 * `authoritative` - the passed values win. Used when they were read as
 * structured fields from a job board, which beats parsing prose.
 *
 * `fallback` - extraction wins and the passed values only fill a gap it left.
 * Used when the caller is handing back what was stored earlier, so a value
 * captured wrongly by a previous parse does not outlive the text it came from.
 */
export type IdentityPrecedence = 'authoritative' | 'fallback';

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
  techStack?: string;
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

/** One row of the Job Tracker: applications + jobs + last status change +
 * interview_stages #1/#2 dates. Mirrors the user's real xlsx tracker 1:1
 * (19 fields) - see ROADMAP §9 + §12. */
export interface TrackerRow {
  id: number;
  jobId?: number;
  appliedAt?: string;
  company?: string;
  title?: string;
  techStack?: string;
  location?: string;
  sourceUrl?: string;
  contactName?: string;
  contactRole?: string;
  contactChannel?: string;
  method?: string;
  interview1At?: string;
  followUp2At?: string;
  status?: string;
  nextAction?: string;
  nextActionAt?: string;
  salaryRange?: string;
  contractType?: string;
  blueCardEligible?: boolean;
  eorProvider?: string;
  notes?: string;
  lastUpdate?: string;
  /** Soonest still-upcoming interview stage (from the Pipeline). */
  nextStageLabel?: string;
  nextStageAt?: string;
  archived?: boolean;
  /** JSON blob of custom-column values ({ "<colId>": "<value>" }). */
  customFields?: string;
}

/** A user-defined Job Tracker column (definition only; values are stored per
 * application in TrackerRow.customFields). `type` drives the input widget. */
export interface TrackerCustomColumn {
  id: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'yesno' | 'select';
  sort: number;
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
 * raw text - normalization happens deterministically in Rust. */
export interface ImportRawRow {
  company?: string | null;
  role?: string | null;
  status?: string | null;
  appliedAt?: string | null;
  notes?: string | null;
  techStack?: string | null;
  sourceUrl?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
  contactChannel?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  salaryRange?: string | null;
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

/** Result of classify_job_url - legal-first host allowlist check (0 tokens).
 * `Closed` covers both known closed boards and unrecognized domains (the
 * app never scrapes either); `boardName` names the board when known. */
export type UrlClassification =
  { kind: 'allowed'; source: string } | { kind: 'closed'; boardName: string } | { kind: 'unknown' };

/** Parsed job fetched from an allowed open/ATS source's public API. */
export interface FetchedJob {
  title: string;
  company: string;
  jdText: string;
}

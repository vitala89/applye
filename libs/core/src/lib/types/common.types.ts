export type AiMode = 'api' | 'cli';
export type AiProvider = 'claude' | 'deepseek' | 'openai' | 'gemini' | 'codex';
export type ExportFormat = 'pdf' | 'docx' | 'md' | 'xlsx';
export type DocType = 'cv' | 'cover_letter' | 'pitch' | 'interview_prep' | 'arbeitsagentur_report';

export type SupportedLanguage = 'en' | 'de' | 'ru' | 'es' | 'fr' | 'uk';
export type GeoScope = 'worldwide' | 'europe' | 'eu' | 'usa' | 'custom';

export interface GeneratedDoc {
  id: number;
  jobId: number;
  docType: DocType;
  exportFormat: ExportFormat;
  inputHash: string;
  filePath: string;
  createdAt: string;
}

export interface TailoringCache {
  id: number;
  jobId: number;
  pass: number;
  inputHash: string;
  resultMd: string;
  changesJson?: string;
  gapsJson?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
  createdAt?: string;
}

export interface SaveTailoringInput {
  jobId: number;
  pass: number;
  inputHash: string;
  resultMd: string;
  changesJson: string;
  gapsJson: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
}

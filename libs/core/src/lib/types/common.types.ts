export type AiMode = 'api' | 'cli';
export type AiProvider = 'claude' | 'deepseek' | 'openai' | 'gemini' | 'codex';
export type ExportFormat = 'pdf' | 'docx' | 'md' | 'xlsx';
export type DocType = 'cv' | 'cover_letter' | 'pitch' | 'interview_prep' | 'arbeitsagentur_report';

export type SupportedLanguage = 'en' | 'de' | 'ru' | 'es' | 'fr' | 'uk';
export type GeoScope = 'worldwide' | 'europe' | 'eu' | 'usa' | 'asia' | 'custom';

/**
 * Endonyms (each language's own name) for language pickers. A user who lands in
 * the wrong UI language must still recognise their own language in the list, so
 * the label is written in the language it selects — not translated into the
 * current locale. Distinct from the AI-prompt names (spelled-out English) used
 * when instructing a model which language to write in.
 */
export const LANGUAGE_NATIVE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  uk: 'Українська',
};

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

export interface SavePortalAnswersInput {
  jobId: number;
  profileHash: string;
  questionsJson: string;
  answersJson: string;
  inputHash: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
}

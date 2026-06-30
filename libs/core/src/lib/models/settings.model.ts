import {
  AiMode,
  AiProvider,
  ExportFormat,
  SupportedLanguage,
  GeoScope,
} from '../types/common.types';

export interface Settings {
  id: 1;
  aiMode: AiMode;
  provider: AiProvider;
  defaultModel: string;
  economyModel: string;
  autoExportOnApply: boolean;
  autoExportFormat: ExportFormat;
  exportDir: string;
  uiLanguage: SupportedLanguage;
  defaultDocLanguage: SupportedLanguage;
  geoScope: GeoScope;
  followupDaysAfterApply?: number;
  followupDaysAfterInterview?: number;
  minScoreNotify?: number;
}

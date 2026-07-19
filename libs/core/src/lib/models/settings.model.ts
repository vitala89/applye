import { AiMode, AiProvider, ExportFormat, SupportedLanguage } from '../types/common.types';

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
  /** Opaque - a JSON-encoded GeoScopeKey[]. Use parseGeoScopes/encodeGeoScopes. */
  geoScope: string;
  followupDaysAfterApply?: number;
  followupDaysAfterInterview?: number;
  minScoreNotify?: number;
  healthCheckSeen: boolean;
  onboardingSeen: boolean;
}

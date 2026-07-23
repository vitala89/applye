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
  /** ISO 3166-1 alpha-2, lowercase, or null for no local market (wide geoScope only). */
  market: string | null;
  followupDaysAfterApply?: number;
  followupDaysAfterInterview?: number;
  minScoreNotify?: number;
  healthCheckSeen: boolean;
  onboardingSeen: boolean;
}

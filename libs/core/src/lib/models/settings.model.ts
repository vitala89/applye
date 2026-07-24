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
  /**
   * Opaque - a JSON-encoded GeoScopeKey[]. Use parseGeoScopes/encodeGeoScopes.
   * Empty while `market` is set: the two are mutually exclusive geo modes.
   */
  geoScope: string;
  /**
   * Opaque - a JSON-encoded LocalMarket[]. Use parseLocalMarkets/encodeLocalMarkets.
   * Empty means "no local market", so `geoScope` applies instead.
   */
  market: string | null;
  /**
   * The raw `market` value the most recent Discover scan ran under, or null
   * before the first scan. Set only by a scan. The Discover feed compares it
   * against `market` to know when to prompt a refresh.
   */
  lastScanMarket: string | null;
  followupDaysAfterApply?: number;
  followupDaysAfterInterview?: number;
  minScoreNotify?: number;
  healthCheckSeen: boolean;
  onboardingSeen: boolean;
}

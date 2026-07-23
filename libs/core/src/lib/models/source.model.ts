export type SourceType =
  | 'rss'
  | 'api'
  | 'ats_greenhouse'
  | 'ats_lever'
  | 'ats_ashby'
  | 'ats_personio'
  | 'manual';

export interface JobSource {
  id: number;
  name: string;
  type: SourceType;
  url: string;
  slug?: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  geoTagsJson: string;
  legalityNote?: string;
  titleFilterPositiveJson?: string;
  titleFilterNegativeJson?: string;
  minScoreNotify?: number;
  createdAt: string;
}

export interface GeoFilter {
  id: number;
  countryCode: string;
  isActive: boolean;
}

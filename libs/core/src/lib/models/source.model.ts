export type SourceType =
  | 'rss'
  | 'api'
  | 'ats_greenhouse'
  | 'ats_lever'
  | 'ats_ashby'
  | 'manual';

export interface JobSource {
  id: number;
  name: string;
  type: SourceType;
  url: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  geoTagsJson: string;
  legalityNote?: string;
  createdAt: string;
}

export interface GeoFilter {
  id: number;
  countryCode: string;
  isActive: boolean;
}

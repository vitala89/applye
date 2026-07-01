export type HealthStatus = 'ok' | 'warn' | 'fail';

/** One deterministic, 0-token diagnostic check (Phase 6.7). */
export interface HealthCheckItem {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface HealthReport {
  items: HealthCheckItem[];
  overall: HealthStatus;
}

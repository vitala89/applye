import type { JobOverview, PipelineCard } from '@applye/core';

/**
 * Pure presentation helpers for the dashboard: monograms, day counts and the
 * compact interview label.
 *
 * Extracted from `dashboard.component.ts`, which is over its 400-line budget
 * and may not grow. Nothing here reads a signal, a service or the clock - `now`
 * is always passed in - so each rule is testable without building a component.
 */

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
/** An interview inside this window is labelled in hours rather than by weekday. */
export const SOON_HOURS = 48;
export { MS_HOUR };

/**
 * Two-letter uppercase monogram from a company name; `?` when unknown.
 *
 * **Deliberately not `companyInitials` from `pipeline-card-view`**, and not
 * folded onto it (ADR-0005, amendment thirty-two). The two agree on every real
 * company name and differ only on the empty one: the board draws `-`, the
 * dashboard draws `?`. Folding them would change what the dashboard renders for
 * a card with no company, with nothing behind the change but tidiness. They are
 * two rules that look alike, not one rule written twice.
 */
export function monogram(name?: string): string {
  const s = (name ?? '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

/** Whole days a follow-up is past due, clamped at 0. */
export function daysOverdue(followUpAt: string | undefined, now: number): number {
  if (!followUpAt) return 0;
  const due = new Date(followUpAt).getTime();
  if (Number.isNaN(due) || due >= now) return 0;
  return Math.floor((now - due) / MS_DAY);
}

/** Whole days since an ISO timestamp, clamped at 0. */
export function daysSince(iso: string | undefined, now: number): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then) || then >= now) return 0;
  return Math.floor((now - then) / MS_DAY);
}

/** Compact relative label for an interview: "3h" / "41h" / "Thu 3:00pm". */
export function whenLabel(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  const diff = at - now;
  if (diff <= SOON_HOURS * MS_HOUR && diff >= 0) {
    const hours = Math.max(1, Math.round(diff / MS_HOUR));
    return `${hours}h`;
  }
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

/** When the current stage of `applicationId` is scheduled; `Infinity` when never. */
export function scheduledMs(cards: PipelineCard[], applicationId: number): number {
  const c = cards.find((x) => x.id === applicationId);
  return c?.currentStageScheduledAt ? new Date(c.currentStageScheduledAt).getTime() : Infinity;
}

/** One row of the dashboard's Recent jobs list. */
export interface RecentRow {
  jobId: number;
  monogram: string;
  role: string;
  company: string;
  status: string;
  statusLabel: string;
  applied: boolean;
}

/**
 * The five most recent jobs the user claimed, newest first.
 *
 * `listJobsOverview` returns unclaimed rows too since ADR-0004, so that My Jobs
 * can offer them behind a filter. The dashboard is not that filter: an
 * unclaimed row here would appear labelled "Saved", which is the ambiguity that
 * ADR exists to remove. Claimed-only is enforced here rather than at the call
 * site, so the rule is in one place and testable without a component.
 */
export function recentClaimedJobs(
  overview: JobOverview[],
  label: (key: string) => string,
  limit = 5,
): RecentRow[] {
  return overview
    .filter((j) => j.claimed)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, limit)
    .map((j) => {
      const status = j.status ?? 'saved';
      return {
        jobId: j.id,
        monogram: monogram(j.company),
        role: j.title ?? '',
        company: j.company ?? '',
        status,
        statusLabel: label(`status.${status}`),
        applied: status === 'applied',
      };
    });
}

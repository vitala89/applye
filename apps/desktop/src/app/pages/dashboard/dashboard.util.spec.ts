import type { PipelineCard } from '@applye/core';
import { daysOverdue, daysSince, monogram, scheduledMs, whenLabel } from './dashboard.util';

/** These rules were unreachable by any test while they lived inside the component. */
describe('dashboard helpers', () => {
  const NOW = new Date('2026-08-02T12:00:00Z').getTime();

  describe('monogram', () => {
    it('takes the first letter of the first two words', () => {
      expect(monogram('Acme Corporation')).toBe('AC');
    });

    it('takes the first two letters of a single word', () => {
      expect(monogram('globex')).toBe('GL');
    });

    it('reports the unknown case rather than an empty box', () => {
      expect(monogram('')).toBe('?');
      expect(monogram(undefined)).toBe('?');
      expect(monogram('   ')).toBe('?');
    });
  });

  describe('daysOverdue', () => {
    it('counts whole days past the due date', () => {
      expect(daysOverdue('2026-07-30T12:00:00Z', NOW)).toBe(3);
    });

    it('is 0 for a future date, a missing date and unparseable text', () => {
      expect(daysOverdue('2026-08-05T12:00:00Z', NOW)).toBe(0);
      expect(daysOverdue(undefined, NOW)).toBe(0);
      expect(daysOverdue('not a date', NOW)).toBe(0);
    });
  });

  describe('daysSince', () => {
    it('counts whole days, clamped at 0', () => {
      expect(daysSince('2026-07-26T12:00:00Z', NOW)).toBe(7);
      expect(daysSince('2026-08-09T12:00:00Z', NOW)).toBe(0);
      expect(daysSince(undefined, NOW)).toBe(0);
    });
  });

  describe('whenLabel', () => {
    it('uses hours inside the 48-hour window', () => {
      expect(whenLabel('2026-08-02T15:00:00Z', NOW)).toBe('3h');
      expect(whenLabel('2026-08-04T11:00:00Z', NOW)).toBe('47h');
    });

    it('rounds a sub-hour gap up to one hour rather than to zero', () => {
      expect(whenLabel('2026-08-02T12:10:00Z', NOW)).toBe('1h');
    });

    it('falls back to weekday and time beyond the window', () => {
      expect(whenLabel('2026-08-06T15:00:00Z', NOW)).toMatch(/^Thu /);
    });
  });

  describe('scheduledMs', () => {
    const cards = [
      { id: 1, currentStageScheduledAt: '2026-08-03T09:00:00Z' },
      { id: 2 },
    ] as unknown as PipelineCard[];

    it('returns the scheduled time of the matching card', () => {
      expect(scheduledMs(cards, 1)).toBe(new Date('2026-08-03T09:00:00Z').getTime());
    });

    // Infinity, not 0: an unscheduled card must sort last, not first.
    it('returns Infinity for an unscheduled card and for an unknown id', () => {
      expect(scheduledMs(cards, 2)).toBe(Infinity);
      expect(scheduledMs(cards, 99)).toBe(Infinity);
    });
  });
});

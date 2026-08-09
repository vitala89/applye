import { areaPoints, polylinePoints } from './analytics-view';

describe('polylinePoints', () => {
  it('spreads values evenly across the full width', () => {
    expect(polylinePoints([0, 0, 0], 10).split(' ').map(x)).toEqual([0, 50, 100]);
  });

  /** Dividing by `n - 1` would be a division by zero on one bucket. */
  it('pins a single value to the left edge', () => {
    expect(polylinePoints([4], 10)).toBe('0.00,24.60');
  });

  it('puts yMax at the top inset and zero on the baseline', () => {
    const [top, bottom] = polylinePoints([10, 0], 10).split(' ');

    expect(top).toBe('0.00,3.00');
    expect(bottom).toBe('100.00,39.00');
  });

  /**
   * Two series share one `yMax` so they stay comparable on the same chart -
   * the followups line must not rescale itself against its own maximum.
   */
  it('scales against the yMax it is given, not its own maximum', () => {
    expect(polylinePoints([5], 10)).toBe('0.00,21.00');
    expect(polylinePoints([5], 5)).toBe('0.00,3.00');
  });

  /**
   * Unreachable from `computeAnalytics`, which floors `yMax` at 1 - but the
   * alternative to the guard is `NaN` in a `points` attribute, which renders
   * as nothing at all rather than as an error.
   */
  it('flattens to the baseline instead of producing NaN when yMax is zero', () => {
    expect(polylinePoints([0, 0], 0)).toBe('0.00,39.00 100.00,39.00');
  });

  it('is empty for no values', () => {
    expect(polylinePoints([], 10)).toBe('');
  });
});

describe('areaPoints', () => {
  it('closes the line along the baseline', () => {
    expect(areaPoints('0.00,3.00 100.00,39.00')).toBe(
      '0.00,3.00 100.00,39.00 100.00,39.00 0.00,39.00',
    );
  });
});

/** x coordinate of one `x,y` pair. */
function x(pair: string): number {
  return Number(pair.split(',')[0]);
}

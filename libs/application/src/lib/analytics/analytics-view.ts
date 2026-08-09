/**
 * Geometry for the trend sparkline, kept apart from the page because it is the
 * one piece of arithmetic on the Analytics screen that is neither domain math
 * (that is `computeAnalytics`, in `libs/core`) nor translation.
 *
 * The viewBox the template draws into is 100 wide and 39 tall with a 3-unit top
 * inset, so a value of `yMax` sits at y=3 and a value of 0 sits at y=39.
 */

/** Top inset, so the highest point is not clipped by the stroke. */
const TOP_INSET = 3;

/** Drawable height below the inset. */
const PLOT_HEIGHT = 36;

/** Width of the viewBox the points are spread across. */
const PLOT_WIDTH = 100;

/**
 * One `points` attribute for a `<polyline>`: values spread evenly across the
 * width, scaled against a shared `yMax` so two series drawn on one chart stay
 * comparable.
 *
 * A single value is pinned to x=0 rather than divided by zero, which a
 * one-bucket dataset reaches. The `yMax === 0` branch is a guard rather than a
 * fix: `computeAnalytics` floors `yMax` at 1, so it is unreachable from the
 * caller this module has - but the function is now callable without that
 * guarantee, and the alternative to the guard is `NaN` in a `points`
 * attribute, which renders as nothing at all.
 */
export function polylinePoints(values: number[], yMax: number): string {
  const n = values.length;
  return values
    .map((value, i) => {
      const x = n > 1 ? (i / (n - 1)) * PLOT_WIDTH : 0;
      const y = yMax > 0 ? TOP_INSET + (1 - value / yMax) * PLOT_HEIGHT : TOP_INSET + PLOT_HEIGHT;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * The filled area under a line: the line itself, closed along the baseline.
 * Kept here rather than in the template so the two agree about where the
 * baseline is.
 */
export function areaPoints(linePoints: string): string {
  return `${linePoints} ${PLOT_WIDTH.toFixed(2)},${(TOP_INSET + PLOT_HEIGHT).toFixed(2)} 0.00,${(TOP_INSET + PLOT_HEIGHT).toFixed(2)}`;
}

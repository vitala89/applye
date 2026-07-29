import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

export type ScoreBand = 'low' | 'mid' | 'high';
export type ScoreGaugeSize = 'lg' | 'sm';

const SIZES: Record<ScoreGaugeSize, { diameter: number; radius: number; strokeWidth: number }> = {
  lg: { diameter: 132, radius: 59, strokeWidth: 10 },
  sm: { diameter: 76, radius: 33, strokeWidth: 7 },
};

/** Matches --dur-slow / --ease-out design tokens (dialogs/panels/count-ups). */
const COUNT_UP_MS = 700;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const clampScore = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

@Component({
  selector: 'lib-score-gauge',
  standalone: true,
  imports: [],
  templateUrl: './score-gauge.html',
  styleUrl: './score-gauge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreGauge {
  readonly score = input.required<number>();
  readonly size = input<ScoreGaugeSize>('lg');
  /** Optional start value. When set, the gauge counts up from `from` to
   * `score` on first paint (e.g. a before→after rescore reveal) instead of
   * snapping. Null = snap on mount, tween only on later score changes. */
  readonly from = input<number | null>(null);

  /** Tweened display value driving BOTH the number and the ring arc, so the
   * whole gauge counts up/down together via rAF (no CSS transition needed). */
  private readonly displayScore = signal(0);
  protected readonly animatedScore = this.displayScore.asReadonly();

  private rafId: number | null = null;
  private firstRun = true;

  constructor() {
    effect((onCleanup) => {
      const target = clampScore(this.score());

      let start: number;
      if (this.firstRun) {
        this.firstRun = false;
        const seed = this.from();
        if (seed == null) {
          // Snap on mount - no reveal animation requested.
          this.displayScore.set(target);
          return;
        }
        start = clampScore(seed);
        this.displayScore.set(start);
      } else {
        start = this.displayScore();
      }

      if (start === target) return;

      const startTime = performance.now();
      const tick = (now: number): void => {
        const t = Math.min(1, (now - startTime) / COUNT_UP_MS);
        this.displayScore.set(Math.round(start + (target - start) * easeOutCubic(t)));
        if (t < 1) {
          this.rafId = requestAnimationFrame(tick);
        }
      };
      this.rafId = requestAnimationFrame(tick);

      onCleanup(() => {
        if (this.rafId != null) cancelAnimationFrame(this.rafId);
      });
    });
  }

  /** Band follows the animated value so ring colour shifts as it counts up. */
  protected readonly band = computed<ScoreBand>(() => {
    const s = this.animatedScore();
    if (s >= 75) return 'high';
    if (s >= 50) return 'mid';
    return 'low';
  });

  protected readonly dims = computed(() => SIZES[this.size()]);

  protected readonly circumference = computed(() => 2 * Math.PI * this.dims().radius);

  protected readonly dashOffset = computed(() => {
    const pct = this.animatedScore() / 100;
    return this.circumference() * (1 - pct);
  });
}

import { Component, computed, effect, input, signal } from '@angular/core';

export type ScoreBand = 'low' | 'mid' | 'high';
export type ScoreGaugeSize = 'lg' | 'sm';

const SIZES: Record<ScoreGaugeSize, { diameter: number; radius: number; strokeWidth: number }> = {
  lg: { diameter: 132, radius: 59, strokeWidth: 10 },
  sm: { diameter: 76, radius: 33, strokeWidth: 7 },
};

/** Matches --dur-slow / --ease-out design tokens (dialogs/panels/count-ups). */
const COUNT_UP_MS = 360;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

@Component({
  selector: 'lib-score-gauge',
  standalone: true,
  imports: [],
  templateUrl: './score-gauge.html',
  styleUrl: './score-gauge.scss',
})
export class ScoreGauge {
  readonly score = input.required<number>();
  readonly size = input<ScoreGaugeSize>('lg');

  /** Tweened display value — the ring's stroke-dashoffset already animates
   * via CSS, but text content can't transition, so the number is tweened
   * in JS on every `score()` change ("counts up/down" from old to new). */
  private readonly displayScore = signal(0);
  protected readonly animatedScore = this.displayScore.asReadonly();

  private rafId: number | null = null;
  private firstRun = true;

  constructor() {
    effect((onCleanup) => {
      const target = Math.max(0, Math.min(100, Math.round(this.score())));

      // Snap on initial mount — only tween when the score actually changes
      // later (e.g. a post-tailor rescore), not on first paint.
      if (this.firstRun) {
        this.firstRun = false;
        this.displayScore.set(target);
        return;
      }

      const start = this.displayScore();
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

  protected readonly band = computed<ScoreBand>(() => {
    const s = this.score();
    if (s >= 75) return 'high';
    if (s >= 50) return 'mid';
    return 'low';
  });

  protected readonly dims = computed(() => SIZES[this.size()]);

  protected readonly circumference = computed(() => 2 * Math.PI * this.dims().radius);

  protected readonly dashOffset = computed(() => {
    const pct = Math.max(0, Math.min(100, this.score())) / 100;
    return this.circumference() * (1 - pct);
  });
}

import { Component, computed, input } from '@angular/core';

export type ScoreBand = 'low' | 'mid' | 'high';
export type ScoreGaugeSize = 'lg' | 'sm';

const SIZES: Record<ScoreGaugeSize, { diameter: number; radius: number; strokeWidth: number }> = {
  lg: { diameter: 132, radius: 59, strokeWidth: 10 },
  sm: { diameter: 76, radius: 33, strokeWidth: 7 },
};

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

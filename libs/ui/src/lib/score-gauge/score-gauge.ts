import { Component, computed, input } from '@angular/core';

export type ScoreBand = 'low' | 'mid' | 'high';

@Component({
  selector: 'lib-score-gauge',
  standalone: true,
  imports: [],
  templateUrl: './score-gauge.html',
  styleUrl: './score-gauge.scss',
})
export class ScoreGauge {
  readonly score = input.required<number>();
  readonly verdict = input<string>('');
  readonly cached = input<boolean>(false);
  readonly cachedLabel = input<string>('cached · 0 tokens');

  protected readonly band = computed<ScoreBand>(() => {
    const s = this.score();
    if (s >= 75) return 'high';
    if (s >= 50) return 'mid';
    return 'low';
  });

  protected readonly circumference = 2 * Math.PI * 40;

  protected readonly dashOffset = computed(() => {
    const pct = Math.max(0, Math.min(100, this.score())) / 100;
    return this.circumference * (1 - pct);
  });
}

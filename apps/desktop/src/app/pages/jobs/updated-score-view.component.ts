import { Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ScoreGauge } from '@applye/ui';
import {
  JobDetailIcons,
  dimensionBand,
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
  scoreVerdictKey,
  scoreVerdictLabelKey,
} from './scoring.utils';

/**
 * UpdatedScoreView — the wizard's step-4 "Updated score" payoff. Shows the
 * honest before→after of the rescore: overall gauges counting up, every
 * scoring dimension animating from its old to new value, and how the
 * tailoring moved missing keywords, the ATS verdict, and red flags. Purely
 * presentational — the parent owns the before/after ScoringCache pair.
 */
@Component({
  selector: 'app-updated-score-view',
  standalone: true,
  imports: [LucideAngularModule, ScoreGauge],
  templateUrl: './updated-score-view.component.html',
  styleUrl: './updated-score-view.component.scss',
})
export class UpdatedScoreView {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly before = input<ScoringCache | null>(null);
  readonly after = input<ScoringCache | null>(null);
  readonly jobTitle = input<string>('');
  readonly icons = input.required<JobDetailIcons>();

  /** Flipped after first paint so bar widths transition from before→after
   * rather than rendering already-filled. */
  protected readonly revealed = signal(false);

  constructor() {
    afterNextRender(() => {
      // Next frame, so the initial (before) widths are painted first.
      requestAnimationFrame(() => this.revealed.set(true));
    });
  }

  protected readonly verdictKey = scoreVerdictKey;
  protected readonly verdictLabelKey = scoreVerdictLabelKey;
  protected readonly band = dimensionBand;

  protected readonly beforeScore = computed(() => this.before()?.score ?? 0);
  protected readonly afterScore = computed(() => this.after()?.score ?? 0);
  protected readonly scoreDelta = computed(() => this.afterScore() - this.beforeScore());

  /** Every after-dimension paired with its before value (matched by name). */
  protected readonly dimPairs = computed(() => {
    const before = this.before();
    const after = this.after();
    if (!after) return [];
    const beforeDims = before ? parseDimensions(before) : [];
    return parseDimensions(after).map((a) => {
      const b = beforeDims.find((x) => x.name === a.name);
      return { name: a.name, before: b?.score ?? 0, after: a.score, comment: a.comment };
    });
  });

  protected readonly missingBefore = computed(() =>
    this.before() ? parseMissingKeywords(this.before() as ScoringCache) : [],
  );
  protected readonly missingAfter = computed(() =>
    this.after() ? parseMissingKeywords(this.after() as ScoringCache) : [],
  );
  /** Keywords that were missing before and are now covered. */
  protected readonly resolvedKeywords = computed(() => {
    const after = new Set(this.missingAfter());
    return this.missingBefore().filter((k) => !after.has(k));
  });

  protected readonly redFlagsBefore = computed(() =>
    this.before() ? parseRedFlags(this.before() as ScoringCache).length : 0,
  );
  protected readonly redFlagsAfter = computed(() =>
    this.after() ? parseRedFlags(this.after() as ScoringCache).length : 0,
  );

  protected readonly beforeYouSubmit = computed(() =>
    this.after() ? parseBeforeYouSubmit(this.after() as ScoringCache) : [],
  );

  /** Bar fill width for a dimension — before value until revealed, then the
   * after value, so CSS transitions the growth. */
  protected barWidth(pair: { before: number; after: number }): number {
    return (this.revealed() ? pair.after : pair.before) * 10;
  }
}

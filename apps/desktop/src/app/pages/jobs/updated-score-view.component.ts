import { Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AtsReport, ScoringCache } from '@applye/core';
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
  /** Deterministic ATS report for the tailored CV. Null means the local check
   * did not run or failed, and the card falls back to the AI's advisory
   * verdict - which is what this view showed exclusively before. */
  readonly ats = input<AtsReport | null>(null);
  readonly icons = input.required<JobDetailIcons>();

  /** Colour band for the ATS score, on the same 0-100 scale as the gauge. */
  protected readonly atsBand = computed(() => this.ats()?.verdict ?? null);

  /** Findings worst-first, so the expensive problems are read first. */
  protected readonly atsFindings = computed(() => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    return [...(this.ats()?.findings ?? [])].sort((a, b) => order[a.severity] - order[b.severity]);
  });

  /** Sections fade in one after another (score → breakdown → keywords →
   * ATS/flags → notes). `revealStep` gates each: a section shows once the
   * step reaches its index. Bar widths also animate from before→after only
   * once the breakdown step is revealed. */
  protected readonly STEP = { OVERALL: 1, DIMS: 2, KEYWORDS: 3, META: 4, NOTES: 5 } as const;
  private static readonly LAST_STEP = 5;
  private static readonly STAGGER_MS = 320;
  protected readonly revealStep = signal(0);

  constructor() {
    afterNextRender(() => {
      // First paint renders everything hidden (and bars at their before
      // width); then step through the sections on a gentle stagger.
      requestAnimationFrame(() => this.advanceReveal());
    });
  }

  private advanceReveal(): void {
    const next = this.revealStep() + 1;
    this.revealStep.set(next);
    if (next < UpdatedScoreView.LAST_STEP) {
      setTimeout(() => this.advanceReveal(), UpdatedScoreView.STAGGER_MS);
    }
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

  protected readonly redFlagsBeforeList = computed(() =>
    this.before() ? parseRedFlags(this.before() as ScoringCache) : [],
  );
  protected readonly redFlagsAfterList = computed(() =>
    this.after() ? parseRedFlags(this.after() as ScoringCache) : [],
  );
  protected readonly redFlagsBefore = computed(() => this.redFlagsBeforeList().length);
  protected readonly redFlagsAfter = computed(() => this.redFlagsAfterList().length);
  /** Red flags present before that are gone after the rescore. */
  protected readonly resolvedRedFlags = computed(() => {
    const after = new Set(this.redFlagsAfterList());
    return this.redFlagsBeforeList().filter((f) => !after.has(f));
  });

  protected readonly beforeYouSubmit = computed(() =>
    this.after() ? parseBeforeYouSubmit(this.after() as ScoringCache) : [],
  );

  /** Bar fill width for a dimension — before value until the breakdown step
   * reveals, then the after value, so CSS transitions the growth. */
  protected barWidth(pair: { before: number; after: number }): number {
    return (this.revealStep() >= this.STEP.DIMS ? pair.after : pair.before) * 10;
  }
}

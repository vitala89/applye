import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Check, LucideAngularModule, ShieldCheck, Sparkles } from 'lucide-angular';
import { CompensationVerdict } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/** The keyword-fit verdict shown beside the raw score; null while unscored. */
export type DetailVerdict = 'strong' | 'good' | 'partial' | null;

/**
 * The sidebar of Discover's job-detail screen: the raw-score ring, the salary
 * comparison, the job facts and the local-only note.
 *
 * It renders and computes nothing that outlives it. Every value it shows is
 * derived on the page - `detailScore` and `detailVerdict` are also read by the
 * detail hero, `tipText` needs the page's matched keywords, and the facts are
 * fields of the open row - so they arrive as inputs and the one thing the user
 * can do here leaves as an output.
 *
 * Two pure helpers came with it, because nothing else names them: the ring's
 * `stroke-dasharray`, and the label for a compensation verdict.
 */
@Component({
  selector: 'app-discover-detail-score',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './discover-detail-score.component.html',
  styleUrl: './discover-detail-score.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverDetailScoreComponent {
  protected readonly t = inject(TranslateService).t;

  readonly score = input.required<number | null>();
  readonly verdict = input.required<DetailVerdict>();
  /** Already resolved on the page: it reads the profile's keywords. */
  readonly tip = input.required<string>();

  readonly hasCompTarget = input.required<boolean>();
  readonly compVerdict = input.required<CompensationVerdict>();

  readonly sourceLabel = input.required<string>();
  readonly location = input.required<string | null | undefined>();
  readonly posted = input.required<string>();
  readonly skills = input.required<string[]>();

  readonly rescoreRequested = output<MouseEvent>();

  protected readonly icons = {
    sparkles: Sparkles,
    check: Check,
    shield: ShieldCheck,
  };

  /** stroke-dasharray for the raw-score ring (r=40 -> C~251.3). */
  protected ringDash(score: number): string {
    const circumference = 2 * Math.PI * 40;
    return `${(score / 100) * circumference} ${circumference}`;
  }

  /** i18n label for the current comp verdict; 'unknown' -> "not stated". */
  protected compBadgeLabel(): string {
    const v = this.compVerdict();
    if (v === 'above') return this.t()('comp.badge_above');
    if (v === 'within') return this.t()('comp.badge_within');
    if (v === 'below') return this.t()('comp.badge_below');
    return this.t()('comp.not_stated');
  }
}

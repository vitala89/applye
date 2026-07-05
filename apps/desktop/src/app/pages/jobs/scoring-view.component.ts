import { Component, computed, inject, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Job, ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ScoreGauge } from '@applye/ui';
import {
  JobDetailIcons,
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
  scoreVerdictKey,
  scoreVerdictLabelKey,
  starRating,
} from './scoring.utils';

@Component({
  selector: 'app-scoring-view',
  standalone: true,
  imports: [LucideAngularModule, ScoreGauge],
  template: `
    @if (cache(); as c) {
      <section class="scoring-view">
        <div class="scoring-view__header card">
          <div class="scoring-view__header-info">
            <span class="eyebrow">{{ t()('jobs.fit_scoring_eyebrow') }}</span>
            @if (job()?.title) {
              <span class="scoring-view__job-title">{{ job()?.title }}</span>
            }
            @if (jobMetaLine()) {
              <span class="scoring-view__job-meta">{{ jobMetaLine() }}</span>
            }
          </div>
          <span class="verdict-badge" [class]="'verdict-badge--' + verdictKey(c.score)">
            <span class="verdict-badge__dot"></span>
            {{ t()(verdictLabelKey(c.score)) }}
          </span>
        </div>

        <div class="scoring-view__summary card">
          <div class="scoring-view__summary-gauge">
            <lib-score-gauge [score]="c.score" size="lg" />
            <div class="scoring-view__stars">
              <lucide-icon
                [img]="icons().star"
                [size]="15"
                class="scoring-view__star-icon"
                aria-hidden="true"
              />
              <span class="scoring-view__stars-num">{{ stars(c.score) }}</span>
              <span class="scoring-view__stars-max">/ 5</span>
            </div>
            <span class="cache-chip">
              <lucide-icon [img]="icons().db" [size]="11" aria-hidden="true" />
              {{ t()('jobs.cached_badge') }}
            </span>
          </div>
          <div class="scoring-view__verdict-text">
            <span class="eyebrow">{{ t()('jobs.recruiter_verdict_eyebrow') }}</span>
            @if (c.summary) {
              <p class="scoring-view__verdict-quote">{{ c.summary }}</p>
            }
          </div>
        </div>

        @if (parseDimensions(c).length) {
          <div class="scoring-view__section">
            <span class="eyebrow">{{ t()('jobs.score_breakdown_eyebrow') }}</span>
            <div class="scoring-view__dims-grid">
              @for (d of parseDimensions(c); track d.name) {
                <div class="card scoring-view__dim-card">
                  <div class="scoring-view__dim-head">
                    <span class="scoring-view__dim-name">{{ d.name }}</span>
                    <span class="scoring-view__dim-score" [class]="'score-' + dimBand(d.score)"
                      >{{ d.score }}/10</span
                    >
                  </div>
                  <div class="scoring-view__dim-bar-track">
                    <div
                      class="scoring-view__dim-bar-fill"
                      [class]="'score-' + dimBand(d.score)"
                      [style.width.%]="d.score * 10"
                    ></div>
                  </div>
                  @if (d.comment) {
                    <p class="scoring-view__dim-rationale">{{ d.comment }}</p>
                  }
                </div>
              }
            </div>
          </div>
        }

        <div class="scoring-view__support-grid">
          <div class="scoring-view__support-col">
            @if (parseMissingKeywords(c).length) {
              <div class="card scoring-view__support-card">
                <div class="scoring-view__support-head">
                  <lucide-icon [img]="icons().tag" [size]="14" aria-hidden="true" />
                  <span class="eyebrow">{{ t()('jobs.missing_keywords_title') }}</span>
                  <span class="scoring-view__support-count"
                    >{{ parseMissingKeywords(c).length }} {{ t()('jobs.not_found_label') }}</span
                  >
                </div>
                <div class="scoring-view__chips">
                  @for (kw of parseMissingKeywords(c); track kw) {
                    <span class="scoring-view__chip">{{ kw }}</span>
                  }
                </div>
              </div>
            }

            <div class="card scoring-view__support-card">
              <div class="scoring-view__support-head">
                <lucide-icon [img]="icons().scan" [size]="14" aria-hidden="true" />
                <span class="eyebrow">{{ t()('jobs.ats_check_title') }}</span>
                <span
                  class="ats-badge"
                  [class.ats-badge--ok]="c.atsPass"
                  [class.ats-badge--warn]="!c.atsPass"
                >
                  <lucide-icon
                    [img]="c.atsPass ? icons().atsPass : icons().atsFail"
                    [size]="11"
                    aria-hidden="true"
                  />
                  {{ c.atsPass ? t()('jobs.ats_pass_msg') : t()('jobs.ats_fail_msg') }}
                </span>
              </div>
              @if (c.atsNotes) {
                <p class="scoring-view__support-note">{{ c.atsNotes }}</p>
              }
            </div>
          </div>

          <div class="scoring-view__support-col">
            @if (parseRedFlags(c).length) {
              <div class="card scoring-view__support-card">
                <div class="scoring-view__support-head">
                  <lucide-icon
                    [img]="icons().flag"
                    [size]="14"
                    class="scoring-view__danger-icon"
                    aria-hidden="true"
                  />
                  <span class="eyebrow">{{ t()('jobs.red_flags_title') }}</span>
                  <span class="scoring-view__support-count">{{ parseRedFlags(c).length }}</span>
                </div>
                <div class="scoring-view__list">
                  @for (flag of parseRedFlags(c); track flag) {
                    <div class="scoring-view__list-row">
                      <span class="scoring-view__dot scoring-view__dot--danger"></span>
                      <span>{{ flag }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            @if (parseBeforeYouSubmit(c).length) {
              <div class="card scoring-view__support-card">
                <div class="scoring-view__support-head">
                  <lucide-icon
                    [img]="icons().checklist"
                    [size]="14"
                    class="scoring-view__accent-icon"
                    aria-hidden="true"
                  />
                  <span class="eyebrow">{{ t()('jobs.before_you_submit') }}</span>
                </div>
                <div class="scoring-view__list">
                  @for (note of parseBeforeYouSubmit(c); track note) {
                    <div class="scoring-view__list-row">
                      <span class="scoring-view__step-icon">
                        <lucide-icon [img]="icons().next" [size]="12" aria-hidden="true" />
                      </span>
                      <span>{{ note }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <div class="scoring-view__cta card">
          <div class="scoring-view__cta-text">
            <span class="scoring-view__cta-title">{{ t()('jobs.tailor_cta_title') }}</span>
            <span class="scoring-view__cta-subtitle">{{ t()('jobs.tailor_cta_subtitle') }}</span>
          </div>
          <span class="scoring-view__cta-spacer"></span>
          <button class="btn btn--primary btn--md" type="button" (click)="tailorApply.emit()">
            <lucide-icon [img]="icons().wand" [size]="15" aria-hidden="true" />
            {{ t()('jobs.tailor_apply_btn') }}
          </button>
        </div>
      </section>
    }
  `,
  styleUrl: './scoring-view.component.scss',
})
export class ScoringView {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  readonly job = input<Job | null>(null);
  readonly icons = input.required<JobDetailIcons>();

  readonly tailorApply = output<void>();

  protected readonly parseDimensions = parseDimensions;
  protected readonly parseMissingKeywords = parseMissingKeywords;
  protected readonly parseRedFlags = parseRedFlags;
  protected readonly parseBeforeYouSubmit = parseBeforeYouSubmit;
  protected readonly verdictKey = scoreVerdictKey;
  protected readonly verdictLabelKey = scoreVerdictLabelKey;
  protected readonly stars = starRating;

  protected dimBand(score: number): 'low' | 'mid' | 'high' {
    if (score >= 7) return 'high';
    if (score >= 4) return 'mid';
    return 'low';
  }

  protected readonly jobMetaLine = computed(() => {
    const j = this.job();
    return [j?.company, j?.location].filter(Boolean).join(' · ');
  });
}

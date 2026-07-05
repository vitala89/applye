import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ScoringCache } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ScoreGauge } from '@applye/ui';
import { inject } from '@angular/core';
import {
  parseBeforeYouSubmit,
  parseDimensions,
  parseMissingKeywords,
  parseRedFlags,
} from './scoring.utils';

@Component({
  selector: 'app-scoring-view',
  standalone: true,
  imports: [LucideAngularModule, ScoreGauge],
  template: `
    @if (cache(); as c) {
      <section class="section">
        <div class="card">
          <lib-score-gauge
            [score]="c.score"
            [cached]="fromCache()"
            [cachedLabel]="t()('jobs.cached_badge')"
          />
          @if (c.summary) {
            <p class="summary">{{ c.summary }}</p>
          }
        </div>

        @if (parseBeforeYouSubmit(c).length) {
          <details class="card before-submit" open>
            <summary class="eyebrow">{{ t()('jobs.before_you_submit') }}</summary>
            <ul class="before-submit__list">
              @for (note of parseBeforeYouSubmit(c); track note) {
                <li>{{ note }}</li>
              }
            </ul>
          </details>
        }

        @if (parseDimensions(c).length) {
          <div class="card">
            <h4 class="eyebrow">{{ t()('jobs.dimensions_title') }}</h4>
            <div class="dim-table">
              @for (d of parseDimensions(c); track d.name) {
                <div class="dim-row">
                  <span class="dim-name">{{ d.name }}</span>
                  <span class="dim-score">{{ d.score }}/10</span>
                  <div class="dim-bar-wrap">
                    <div class="dim-bar" [style.width.%]="d.score * 10"></div>
                  </div>
                  @if (d.comment) {
                    <span class="dim-comment">{{ d.comment }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (parseMissingKeywords(c).length) {
          <div class="card">
            <h4 class="eyebrow">{{ t()('jobs.missing_keywords_title') }}</h4>
            <div class="chips">
              @for (kw of parseMissingKeywords(c); track kw) {
                <span class="chip">{{ kw }}</span>
              }
            </div>
          </div>
        }

        @if (parseRedFlags(c).length) {
          <div class="card">
            <h4 class="eyebrow">{{ t()('jobs.red_flags_title') }}</h4>
            <ul class="red-flags">
              @for (flag of parseRedFlags(c); track flag) {
                <li class="red-flag">{{ flag }}</li>
              }
            </ul>
          </div>
        }

        <div class="card">
          <h4 class="eyebrow">{{ t()('jobs.ats_check_title') }}</h4>
          <div
            class="ats-pass"
            [class.ats-pass--ok]="c.atsPass"
            [class.ats-pass--warn]="!c.atsPass"
          >
            <lucide-icon
              [img]="c.atsPass ? atsPassIcon() : atsFailIcon()"
              [size]="16"
              aria-hidden="true"
            />
            {{ c.atsPass ? t()('jobs.ats_pass_msg') : t()('jobs.ats_fail_msg') }}
          </div>
          @if (c.atsNotes) {
            <p class="muted" style="margin-top: var(--space-2)">{{ c.atsNotes }}</p>
          }
        </div>
      </section>
    }
  `,
})
export class ScoringView {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly cache = input<ScoringCache | null>(null);
  readonly fromCache = input<boolean>(false);
  readonly atsPassIcon = input.required<unknown>();
  readonly atsFailIcon = input.required<unknown>();

  protected readonly parseDimensions = parseDimensions;
  protected readonly parseMissingKeywords = parseMissingKeywords;
  protected readonly parseRedFlags = parseRedFlags;
  protected readonly parseBeforeYouSubmit = parseBeforeYouSubmit;
}

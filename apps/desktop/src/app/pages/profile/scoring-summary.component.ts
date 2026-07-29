import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { parseScoringJson } from '@applye/core';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-scoring-summary',
  standalone: true,
  template: `
    <div class="summary">
      <div class="summary__head">
        <span class="summary__name">{{ scoring()?.name }}</span>
        <span class="summary__meta">{{ metaLine() }}</span>
      </div>

      @if (strengths().length) {
        <p class="summary__label">{{ t()('profile.strengths') }}</p>
        <div class="summary__chips">
          @for (s of strengths(); track $index) {
            <span class="summary__chip">{{ s }}</span>
          }
        </div>
      }

      @if (aiNotes().length) {
        <p class="summary__label">{{ t()('profile.ai_notes') }}</p>
        <ul class="summary__notes">
          @for (n of aiNotes(); track $index) {
            <li>{{ n }}</li>
          }
        </ul>
      }

      <button type="button" class="summary__toggle" (click)="showJson.set(!showJson())">
        {{ showJson() ? '▾' : '▸' }} {{ t()('profile.show_json') }}
      </button>
      @if (showJson()) {
        <pre class="summary__json">{{ prettyJson() }}</pre>
      }
    </div>
  `,
  styles: [
    `
      .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-4);
        background: var(--surface-sunken);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
      }
      .summary__name {
        font-size: var(--text-body);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .summary__meta {
        display: block;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .summary__label {
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
        margin: var(--space-3) 0 var(--space-1);
      }
      .summary__chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .summary__chip {
        padding: var(--space-1) var(--space-3);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-badge);
      }
      .summary__notes {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .summary__notes li {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .summary__toggle {
        align-self: flex-start;
        margin-top: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        color: var(--text-tertiary);
        background: none;
        border: none;
        cursor: pointer;
      }
      .summary__json {
        margin: 0;
        padding: var(--space-3);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        line-height: 1.6;
        color: var(--text-secondary);
        background: var(--surface-2);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoringSummaryComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly scoringJson = input<string | null>(null);

  readonly showJson = signal(false);

  readonly scoring = computed(() => parseScoringJson(this.scoringJson()));

  readonly strengths = computed(() => {
    const s = this.scoring();
    if (!s) return [];
    const out: string[] = [];
    if (s.seniority) out.push(s.seniority);
    out.push(...(s.skills ?? []), ...(s.domains ?? []));
    return out;
  });

  readonly aiNotes = computed(() => this.scoring()?.red_flags ?? []);

  readonly metaLine = computed(() => {
    const s = this.scoring();
    return [s?.seniority, s?.location, ...(s?.domains ?? [])].filter(Boolean).join(' · ');
  });

  readonly prettyJson = computed(() => {
    const raw = this.scoringJson();
    if (!raw) return '';
    const parsed = this.scoring();
    return parsed ? JSON.stringify(parsed, null, 2) : raw;
  });
}

import { Component, EventEmitter, Output, computed, inject, input, signal } from '@angular/core';
import {
  ProfileFieldKey,
  ProfileForm,
  parseScoringJson,
  profileCompleteness,
  missingFields,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';

@Component({
  selector: 'app-scoring-summary',
  standalone: true,
  template: `
    <div class="summary">
      <div class="summary__head">
        <span class="summary__name">{{ scoring()?.name || form().name }}</span>
        <span class="summary__meta">{{ metaLine() }}</span>
      </div>

      <div class="summary__bar-row">
        <span>{{ t()('profile.completeness') }}</span>
        <b>{{ completeness() }}%</b>
      </div>
      <div class="summary__bar"><i [style.width.%]="completeness()"></i></div>

      @if (strengths().length) {
        <p class="summary__label">{{ t()('profile.strengths') }}</p>
        <div class="summary__chips">
          @for (s of strengths(); track $index) {
            <span class="summary__chip">{{ s }}</span>
          }
        </div>
      }

      @if (gaps().length) {
        <p class="summary__label">{{ t()('profile.improve') }}</p>
        <ul class="summary__gaps">
          @for (g of gaps(); track g) {
            <li class="summary__gap">
              <span class="summary__gap-icon" aria-hidden="true">⚠</span>
              <span>
                @switch (g) {
                  @case ('experience') {
                    {{ t()('profile.field_experience_short') }}
                  }
                  @case ('education') {
                    {{ t()('profile.field_education_short') }}
                  }
                  @case ('languages') {
                    {{ t()('profile.field_languages_short') }}
                  }
                  @case ('title') {
                    {{ t()('profile.field_title_short') }}
                  }
                  @case ('location') {
                    {{ t()('profile.field_location_short') }}
                  }
                  @case ('skills') {
                    {{ t()('profile.field_skills_short') }}
                  }
                }
              </span>
              <button type="button" class="summary__add" (click)="onAdd(g)">
                {{ t()('profile.add_field') }}
              </button>
            </li>
          }
        </ul>
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
      .summary__bar-row {
        display: flex;
        justify-content: space-between;
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin-top: var(--space-3);
      }
      .summary__bar {
        height: 7px;
        background: var(--surface-2);
        border-radius: var(--radius-full);
        overflow: hidden;
      }
      .summary__bar > i {
        display: block;
        height: 100%;
        background: var(--accent);
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
      .summary__gaps,
      .summary__notes {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .summary__gap {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--warning);
      }
      .summary__notes li {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .summary__add {
        margin-left: auto;
        font-size: var(--text-xs);
        color: var(--accent);
        background: none;
        border: none;
        cursor: pointer;
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
})
export class ScoringSummaryComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly scoringJson = input<string | null>(null);
  readonly form = input.required<ProfileForm>();
  @Output() readonly addField = new EventEmitter<ProfileFieldKey>();

  readonly showJson = signal(false);

  readonly scoring = computed(() => parseScoringJson(this.scoringJson()));
  readonly completeness = computed(() => profileCompleteness(this.form()));
  readonly gaps = computed(() => missingFields(this.form()));

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
    const f = this.form();
    return [s?.seniority, s?.location || f.location, ...(s?.domains ?? [])]
      .filter(Boolean)
      .join(' · ');
  });

  readonly prettyJson = computed(() => {
    const raw = this.scoringJson();
    if (!raw) return '';
    const parsed = this.scoring();
    return parsed ? JSON.stringify(parsed, null, 2) : raw;
  });

  onAdd(key: ProfileFieldKey): void {
    this.addField.emit(key);
  }
}

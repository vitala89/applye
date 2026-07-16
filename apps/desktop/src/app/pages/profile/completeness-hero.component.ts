import { Component, EventEmitter, Output, computed, inject, input } from '@angular/core';
import { ProfileFieldKey } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { LucideAngularModule, Plus, BadgeCheck } from 'lucide-angular';

const RADIUS = 44;
const CIRC = 2 * Math.PI * RADIUS;

@Component({
  selector: 'app-completeness-hero',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="hero">
      <div class="hero__ring">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <circle
            cx="48"
            cy="48"
            r="44"
            fill="none"
            stroke="var(--surface-sunken)"
            stroke-width="8"
          />
          <circle
            cx="48"
            cy="48"
            r="44"
            fill="none"
            stroke="var(--accent)"
            stroke-width="8"
            stroke-linecap="round"
            [attr.stroke-dasharray]="ringDash()"
            transform="rotate(-90 48 48)"
          />
        </svg>
        <span class="hero__pct">{{ completeness() }}<span class="hero__pct-sign">%</span></span>
      </div>

      <div class="hero__body">
        <div class="hero__name">{{ name() }}</div>
        <div class="hero__sub">{{ subtitle() }}</div>

        @if (gaps().length > 0) {
          <div class="hero__improve">
            <span class="hero__improve-label">
              {{ t()('profile.hero_improve') }} ·
              {{ t()('profile.hero_left').replace('{n}', String(gaps().length)) }}
            </span>
            <div class="hero__gaps">
              @for (g of gaps(); track g) {
                <button type="button" class="hero__gap" (click)="onAdd(g)">
                  <lucide-icon [img]="plusIcon" [size]="14" aria-hidden="true" />
                  {{ t()('profile.field_' + g + '_short') }}
                </button>
              }
            </div>
          </div>
        } @else {
          <div class="hero__done">
            <lucide-icon [img]="doneIcon" [size]="16" aria-hidden="true" />
            {{ t()('profile.hero_complete') }}
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .hero {
        display: flex;
        align-items: center;
        gap: var(--space-5);
        padding: var(--space-5);
        background: var(--surface-1);
        border: 1px solid var(--border-accent);
        border-radius: var(--radius-card);
        box-shadow: var(--glow-accent);
      }
      .hero__ring {
        position: relative;
        flex-shrink: 0;
        width: 96px;
        height: 96px;
      }
      .hero__pct {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--text-body);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .hero__pct-sign {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .hero__body {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
      }
      .hero__name {
        font-size: var(--text-body);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
      }
      .hero__sub {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .hero__improve {
        margin-top: var(--space-2);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .hero__improve-label {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .hero__gaps {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .hero__gap {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        height: 30px;
        padding: 0 var(--space-4);
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        background: transparent;
        border: 1px dashed var(--border-strong);
        border-radius: var(--radius-badge);
        cursor: pointer;
      }
      .hero__gap:hover {
        color: var(--text-accent);
        background: var(--accent-tint);
        border-color: var(--accent);
        border-style: solid;
      }
      .hero__done {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        margin-top: var(--space-2);
        font-size: var(--text-sm);
        color: var(--ok, var(--accent));
      }
    `,
  ],
})
export class CompletenessHeroComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly String = String;
  protected readonly plusIcon = Plus;
  protected readonly doneIcon = BadgeCheck;

  readonly completeness = input(0);
  readonly gaps = input<ProfileFieldKey[]>([]);
  readonly name = input('');
  readonly subtitle = input('');

  @Output() readonly addField = new EventEmitter<ProfileFieldKey>();

  readonly ringDash = computed(() => {
    const filled = (this.completeness() / 100) * CIRC;
    return `${filled} ${CIRC}`;
  });

  onAdd(key: ProfileFieldKey): void {
    this.addField.emit(key);
  }
}

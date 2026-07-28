import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../analytics/analytics.service';
import { I18nService } from '../i18n/i18n.service';
import { LocaleCode, localePath } from '../i18n/locales';

/**
 * Switches between the localised landing pages.
 *
 * It is a list of real links, not a select that rewrites the URL in place, so
 * each language is crawlable and shareable. The `<details>` around them is
 * presentation only: every locale is in the prerendered HTML whether or not the
 * panel is open, which is what a crawler reads. Every language stays listed even
 * when you are already on it - a switcher that hides the current option makes
 * people wonder which one they are reading - and the one you are on is named on
 * the button itself.
 */
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <details class="langs" #panel>
      <summary class="langs__current" [attr.aria-label]="i18n.ui().nav.language">
        <span class="langs__code">{{ current().code.toUpperCase() }}</span>
        <span class="langs__name">{{ current().label }}</span>
        <svg
          class="langs__caret"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 15 6-6 6 6" />
        </svg>
      </summary>
      <ul class="langs__list">
        @for (l of i18n.locales; track l.code) {
          <li>
            <a
              [routerLink]="path(l.code)"
              [class.is-active]="i18n.uiLocale() === l.code"
              [attr.hreflang]="l.code"
              [attr.aria-current]="i18n.uiLocale() === l.code ? 'true' : null"
              (click)="switched(l.code); panel.open = false"
              >{{ l.label }}<span class="langs__tag">{{ l.code.toUpperCase() }}</span></a
            >
          </li>
        }
      </ul>
    </details>
  `,
})
export class LanguageSwitcher {
  readonly i18n = inject(I18nService);
  readonly path = localePath;

  /** The locale being read, for the closed state of the panel. */
  readonly current = computed(
    () => this.i18n.locales.find((l) => l.code === this.i18n.uiLocale()) ?? this.i18n.locales[0],
  );
  private readonly analytics = inject(AnalyticsService);

  /**
   * Records the switch. Clicking the language you are already reading is not a
   * switch, and counting it would inflate the one number this event exists to
   * answer: which translations people actually reach for.
   */
  switched(to: LocaleCode): void {
    const from = this.i18n.uiLocale();
    if (from === to) return;
    this.analytics.localeSwitch(from, to);
  }
}

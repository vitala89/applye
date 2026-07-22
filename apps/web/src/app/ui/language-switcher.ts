import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../i18n/i18n.service';
import { localePath } from '../i18n/locales';

/**
 * Switches between the localised landing pages.
 *
 * It is a list of real links, not a select that rewrites the URL in place, so
 * each language is crawlable and shareable. Every language stays visible even
 * when you are already on it - a switcher that hides the current option makes
 * people wonder which one they are reading.
 */
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="langs">
      <span class="langs__label">{{ i18n.ui().nav.language }}</span>
      <ul class="langs__list">
        @for (l of i18n.locales; track l.code) {
          <li>
            <a
              [routerLink]="path(l.code)"
              [class.is-active]="i18n.uiLocale() === l.code"
              [attr.hreflang]="l.code"
              [attr.aria-current]="i18n.uiLocale() === l.code ? 'true' : null"
              >{{ l.label }}</a
            >
          </li>
        }
      </ul>
    </div>
  `,
})
export class LanguageSwitcher {
  readonly i18n = inject(I18nService);
  readonly path = localePath;
}

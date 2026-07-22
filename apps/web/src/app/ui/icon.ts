import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The site's icon set.
 *
 * One vocabulary, one visual language: 24x24 viewBox, 1.7 stroke, round caps
 * and joins, `currentColor`, no fills. That matches the Lucide set the desktop
 * app uses, without pulling the whole package into a marketing bundle.
 *
 * The shapes are inlined in a switch rather than bound through innerHTML,
 * because Angular's HTML sanitiser strips SVG child elements.
 *
 * Brand marks (GitHub, Discord, LinkedIn, X) are deliberately NOT here: they
 * are filled logos with fixed shapes, not part of this stroke system, and they
 * live where they are used.
 */
export type IconName =
  | 'hard-drive'
  | 'shield-check'
  | 'file-text'
  | 'key'
  | 'sparkles'
  | 'sun'
  | 'moon'
  | 'chevron-down';

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('hard-drive') {
          <path d="M22 12H2" />
          <path
            d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
          />
          <path d="M6 16h.01" />
          <path d="M10 16h.01" />
        }
        @case ('shield-check') {
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        }
        @case ('file-text') {
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        }
        @case ('key') {
          <path
            d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z"
          />
          <circle cx="16.5" cy="7.5" r=".5" />
        }
        @case ('sparkles') {
          <path d="m12 3-1.9 5.8L4.3 10.7l5.8 1.9L12 18.4l1.9-5.8 5.8-1.9-5.8-1.9z" />
          <path d="M18 3v4" />
          <path d="M20 5h-4" />
          <path d="M5 17v3" />
          <path d="M6.5 18.5h-3" />
        }
        @case ('sun') {
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        }
        @case ('moon') {
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  /** Slightly heavier strokes read better at small sizes. */
  readonly strokeWidth = input(1.7);
}

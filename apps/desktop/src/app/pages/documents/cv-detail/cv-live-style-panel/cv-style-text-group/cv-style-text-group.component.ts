import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { CV_ATS_SAFE_FONTS } from '@applye/core';
import type { CvFontWeight } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * The live-style panel's collapsible TEXT group: font, size, weight, colour and
 * - for a body selection only - line height.
 *
 * **It is a view and nothing else.** Every value it renders arrives as an input
 * already resolved for the active scope, and every edit leaves as an output; it
 * reads no `CvStyle`, resolves no cascade and knows nothing about scopes. That
 * is what lets one component serve both call sites: a body selection and a
 * title selection differ only in the size range, the placeholder, and whether
 * the line-height row exists - the *rules* behind those differences stay in
 * `CvLiveStylePanelComponent`, where `cv-style-panel-cascade.ts` and its specs
 * already own them.
 */
@Component({
  selector: 'app-cv-style-text-group',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-style-text-group.component.html',
  styleUrl: './cv-style-text-group.component.scss',
})
export class CvStyleTextGroupComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly atsSafeFonts = CV_ATS_SAFE_FONTS;
  protected readonly icons = { chevron: ChevronDown };

  /** Curated body leading choices (unitless). `1.45` is the existing
   * `--leading-normal`; unset (Inherit) preserves each element's baseline. */
  protected readonly lineHeightOptions: { value: number; labelKey: string }[] = [
    { value: 1.2, labelKey: 'documents.cv_style_line_height_compact' },
    { value: 1.35, labelKey: 'documents.cv_style_line_height_tight' },
    { value: 1.45, labelKey: 'documents.cv_style_line_height_normal' },
    { value: 1.6, labelKey: 'documents.cv_style_line_height_relaxed' },
  ];

  readonly open = input<boolean>(false);

  /** Empty string means Inherit - the panel passes `override.fontFamily ?? ''`. */
  readonly fontFamily = input<string>('');
  readonly fontSizePt = input<number | null>(null);
  /** The size the selection renders at when no override is set, shown as the
   * number input's placeholder so Inherit is legible rather than blank. */
  readonly sizePlaceholder = input.required<number>();
  readonly sizeMin = input.required<number>();
  readonly sizeMax = input.required<number>();
  readonly fontWeight = input<CvFontWeight | null>(null);
  readonly colorHex = input<string>('');

  /** Line height is body-only: a title uses `CvTextStyle`, which has no
   * `lineHeight`. The row's presence is also what `entry-rule.spec.ts` asserts
   * on, through `.cvlive__line-height`. */
  readonly showLineHeight = input<boolean>(false);
  readonly lineHeight = input<number | null>(null);

  readonly toggled = output<void>();
  readonly fontChange = output<string>();
  readonly sizeChange = output<string | number | null>();
  readonly weightChange = output<CvFontWeight | null>();
  readonly colorChange = output<string>();
  readonly lineHeightChange = output<number | null>();
}

import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import type { PageMargins, PageSize } from '@applye/core';
import { TranslateService } from '@applye/i18n';

/**
 * The CV editor's collapsible "Style" card: the theme picker, the page size and
 * the four margins, plus whatever ATS safety notes the current style produced.
 *
 * **It is a view.** Every value arrives resolved - the margins are already
 * clamped by `resolvePageSettings`, and the notes arrive as finished sentences
 * rather than as `StyleNote` objects, so the card never learns how a note is
 * worded. The page keeps `setPageSize` and `setMarginSide`, which is where the
 * clamping and the whole-`PageSettings` write belong.
 *
 * It declares no classes of its own: the card, the collapse and the field grid
 * are `.docedit-*`, emitted globally from `styles.scss` for the CV and
 * cover-letter editors alike.
 */
@Component({
  selector: 'app-cv-page-style-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cv-page-style-card.component.html',
  styleUrl: './cv-page-style-card.component.scss',
})
export class CvPageStyleCardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly icons = { chevron: ChevronDown };

  /** The four sides, in the order the grid renders them. */
  protected readonly marginSides: { key: keyof PageMargins; label: string }[] = [
    { key: 'top', label: 'documents.cv_style_margin_top' },
    { key: 'right', label: 'documents.cv_style_margin_right' },
    { key: 'bottom', label: 'documents.cv_style_margin_bottom' },
    { key: 'left', label: 'documents.cv_style_margin_left' },
  ];

  readonly open = input<boolean>(true);
  readonly themeId = input.required<number>();
  readonly pageSize = input.required<PageSize>();
  /** Already clamped to 0-50mm by the page's resolver. */
  readonly margins = input.required<PageMargins>();
  /** Finished sentences, not `StyleNote`s - the wording is the page's. */
  readonly noteMessages = input<readonly string[]>([]);

  readonly toggled = output<void>();
  readonly themeSelected = output<number>();
  readonly pageSizeChange = output<PageSize>();
  readonly marginChange = output<{ side: keyof PageMargins; value: number }>();
}

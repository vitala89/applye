import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import type { PageMargins, PageSettings, PageSize, StyleNote } from '@applye/core';
import { PAGE_SETTINGS_DEFAULT, resolvePageSettings } from '@applye/core';
import { CvStyleStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';

/**
 * The CV editor's collapsible "Style" card: the theme picker, the page size and
 * the four margins, plus whatever ATS safety notes the current style produced.
 *
 * **It reads and writes `CvStyleStore` directly**, which the page provides, so
 * the injection resolves up the component tree to the page's instance. That is
 * what `CoverLetterStyleCardComponent` does on the other editor, and the two
 * cards are now the same shape (ADR-0005, amendment sixty-four): the card was
 * previously input-driven, with the page computing its margins and wording its
 * notes and four bindings restating that wiring without changing it.
 *
 * **Page geometry deliberately does not live in the store.** `resolvePageSettings`
 * is app-local and `libs/application` cannot import it - the reason
 * `CoverLetterStyleStore`'s own header gives - so the clamping and the whole-
 * `PageSettings` write belong to whichever component owns this card, and that is
 * this one rather than the page above it.
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
  private readonly styles = inject(CvStyleStore);
  protected readonly t = this.i18n.t;

  protected readonly icons = { chevron: ChevronDown };

  /** The four sides, in the order the grid renders them. */
  protected readonly marginSides: { key: keyof PageMargins; label: string }[] = [
    { key: 'top', label: 'documents.cv_style_margin_top' },
    { key: 'right', label: 'documents.cv_style_margin_right' },
    { key: 'bottom', label: 'documents.cv_style_margin_bottom' },
    { key: 'left', label: 'documents.cv_style_margin_left' },
  ];

  private static readonly STYLE_NOTE_KEYS: Record<StyleNote['kind'], string> = {
    font_ats_risk: 'documents.cv_style_note_font',
    size_out_of_range: 'documents.cv_style_note_size',
    color_readability_risk: 'documents.cv_style_note_color',
    weight_unavailable_risk: 'documents.cv_style_note_weight',
  };

  readonly open = input<boolean>(true);
  readonly toggled = output<void>();

  protected readonly themeId = this.styles.themeId;

  /** Current 4-side margins in mm, already clamped by the resolver. */
  protected readonly margins = computed<PageMargins>(
    () => resolvePageSettings(this.styles.style().page).margin,
  );

  protected readonly pageSize = computed<PageSize>(
    () => this.styles.style().page?.size ?? PAGE_SETTINGS_DEFAULT.size,
  );

  /** The style notes as finished sentences. Each note carries a `{value}` to
   * substitute, so the wording happens here rather than in the template. */
  protected readonly noteMessages = computed<string[]>(() =>
    this.styles
      .styleNotes()
      .map((note) =>
        this.t()(CvPageStyleCardComponent.STYLE_NOTE_KEYS[note.kind]).replace(
          '{value}',
          note.detail,
        ),
      ),
  );

  selectTheme(id: number): void {
    this.styles.selectTheme(id);
  }

  setPageSize(size: PageSize): void {
    this.updatePage({ size, margin: this.margins() });
  }

  setMarginSide(side: keyof PageMargins, value: number): void {
    const clamped = Math.min(50, Math.max(0, Math.round(Number(value) || 0)));
    this.updatePage({ size: this.pageSize(), margin: { ...this.margins(), [side]: clamped } });
  }

  private updatePage(page: PageSettings): void {
    this.styles.updateStyle({ page });
  }
}

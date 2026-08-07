import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, LucideAngularModule, RefreshCw } from 'lucide-angular';
import type { PageMargins, PageSettings, PageSize, StyleNote } from '@applye/core';
import { CV_ATS_SAFE_FONTS, PAGE_SETTINGS_DEFAULT } from '@applye/core';
import { CoverLetterStyleStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { resolvePageSettings } from '../../cv-content.util';

/**
 * The document-wide Style card: font, size, weight, accent colour, page size
 * and margins, the ATS-safety warnings, and the reset that clears every
 * override at once.
 *
 * It injects `CoverLetterStyleStore` - provided on the page, so this resolves
 * the same instance through the element injector - and owns the page geometry
 * itself, because that clamps through the app-local `resolvePageSettings`
 * which `libs/application` may not import (ADR-0005, amendment five).
 *
 * **The collapse state lives here** because nothing else reads it. The open
 * *popover* key does not: it is one-at-a-time across the whole editor, so the
 * page owns it, which is why `resetAll` is an output rather than a plain call.
 */
@Component({
  selector: 'app-cover-letter-style-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './cover-letter-style-card.component.html',
})
export class CoverLetterStyleCardComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  protected readonly styles = inject(CoverLetterStyleStore);

  /** Emitted after every override is cleared, so the page can close whichever
   * per-block popover was open - the style it was editing no longer exists. */
  readonly allReset = output<void>();

  protected readonly icons = { chevron: ChevronDown, regenerate: RefreshCw };
  protected readonly fontOptions = CV_ATS_SAFE_FONTS;
  protected readonly style = this.styles.style;
  protected readonly styleNotes = this.styles.styleNotes;
  protected readonly hasAnyCustomStyle = this.styles.hasAnyCustomStyle;

  /** Collapse state for the card - open by default. */
  readonly styleOpen = signal(true);

  toggleStyleOpen(): void {
    this.styleOpen.set(!this.styleOpen());
  }

  updateStyle(patch: Parameters<CoverLetterStyleStore['updateStyle']>[0]): void {
    this.styles.updateStyle(patch);
  }

  resetAllStyles(): void {
    this.styles.resetAllStyles();
    this.allReset.emit();
  }

  private static readonly STYLE_NOTE_KEYS: Record<StyleNote['kind'], string> = {
    font_ats_risk: 'documents.cv_style_note_font',
    size_out_of_range: 'documents.cv_style_note_size',
    color_readability_risk: 'documents.cv_style_note_color',
    weight_unavailable_risk: 'documents.cv_style_note_weight',
  };

  styleNoteMessage(note: StyleNote): string {
    return this.t()(CoverLetterStyleCardComponent.STYLE_NOTE_KEYS[note.kind]).replace(
      '{value}',
      note.detail,
    );
  }

  readonly marginSides: { key: keyof PageMargins; label: string }[] = [
    { key: 'top', label: 'documents.cv_style_margin_top' },
    { key: 'right', label: 'documents.cv_style_margin_right' },
    { key: 'bottom', label: 'documents.cv_style_margin_bottom' },
    { key: 'left', label: 'documents.cv_style_margin_left' },
  ];

  /** Current 4-side margins in mm, already clamped by the resolver. */
  readonly currentMargin = computed<PageMargins>(
    () => resolvePageSettings(this.style().page).margin,
  );

  private updatePage(page: PageSettings): void {
    this.updateStyle({ page });
  }

  setMarginSide(side: keyof PageMargins, value: number): void {
    const clamped = Math.min(50, Math.max(0, Math.round(Number(value) || 0)));
    const cur = this.currentMargin();
    const size = this.style().page?.size ?? PAGE_SETTINGS_DEFAULT.size;
    this.updatePage({ size, margin: { ...cur, [side]: clamped } });
  }

  setPageSize(size: PageSize): void {
    this.updatePage({ size, margin: this.currentMargin() });
  }
}

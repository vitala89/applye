import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  CvBorderStyle,
  CvFontWeight,
  CvSectionKey,
  CvSectionStyle,
  CvStyle,
  CvTextStyle,
} from '@applye/core';
import { CV_ATS_SAFE_FONTS } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import type { CvPreviewSelection } from '../../cv-content.util';

/**
 * Contextual live-style panel shown beside the paper in Preview mode. Receives
 * the selected section/part and the current document style, and emits semantic
 * body/title patches (or a whole-section reset). It never owns persistence or
 * the override-cleaning merge — the parent applies each patch through the
 * Task 1 reducers (`patchCvSectionStyle` / `resetCvSectionStyle`) and keeps its
 * own safety-check debounce. Line height is offered for the body scope only;
 * the title scope uses `CvTextStyle` plus the section title border.
 */
@Component({
  selector: 'app-cv-live-style-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './cv-live-style-panel.component.html',
  styleUrl: './cv-live-style-panel.component.scss',
})
export class CvLiveStylePanelComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly selection = input<CvPreviewSelection | null>(null);
  readonly style = input.required<CvStyle>();

  /** Body-scope (section-level) patch — also carries the title border, which
   * lives on `CvSectionStyle`, not `CvTextStyle`. */
  readonly styleChange = output<{ key: CvSectionKey; patch: Partial<CvSectionStyle> }>();
  /** Title-scope patch (font/size/weight/colour) — deep-merged by the parent. */
  readonly titleStyleChange = output<{ key: CvSectionKey; patch: Partial<CvTextStyle> }>();
  /** Delete the whole selected-section override (body, title, and border). */
  readonly resetSection = output<CvSectionKey>();

  protected readonly atsSafeFonts = CV_ATS_SAFE_FONTS;

  /** Curated body leading choices (unitless). `1.45` is the existing
   * `--leading-normal`; unset (Inherit) preserves each element's baseline. */
  protected readonly lineHeightOptions: { value: number; labelKey: string }[] = [
    { value: 1.2, labelKey: 'documents.cv_style_line_height_compact' },
    { value: 1.35, labelKey: 'documents.cv_style_line_height_tight' },
    { value: 1.45, labelKey: 'documents.cv_style_line_height_normal' },
    { value: 1.6, labelKey: 'documents.cv_style_line_height_relaxed' },
  ];

  /** The selected section's current override, if any — feeds the control
   * models so they reflect what's already applied. */
  readonly override = computed<CvSectionStyle | undefined>(() => {
    const sel = this.selection();
    return sel ? this.style().sectionStyles?.[sel.sectionKey] : undefined;
  });

  private emitStyle(patch: Partial<CvSectionStyle>): void {
    const sel = this.selection();
    if (sel) this.styleChange.emit({ key: sel.sectionKey, patch });
  }

  private emitTitle(patch: Partial<CvTextStyle>): void {
    const sel = this.selection();
    if (sel) this.titleStyleChange.emit({ key: sel.sectionKey, patch });
  }

  setBodyFont(value: string): void {
    this.emitStyle({ fontFamily: value || undefined });
  }
  setBodySize(value: string | number | null): void {
    this.emitStyle({ fontSizePt: value ? +value : undefined });
  }
  setBodyWeight(value: CvFontWeight | null): void {
    this.emitStyle({ fontWeight: value ?? undefined });
  }
  setBodyColor(value: string): void {
    this.emitStyle({ colorHex: value });
  }
  setLineHeight(value: number | null): void {
    this.emitStyle({ lineHeight: value ?? undefined });
  }

  setTitleFont(value: string): void {
    this.emitTitle({ fontFamily: value || undefined });
  }
  setTitleSize(value: string | number | null): void {
    this.emitTitle({ fontSizePt: value ? +value : undefined });
  }
  setTitleWeight(value: CvFontWeight | null): void {
    this.emitTitle({ fontWeight: value ?? undefined });
  }
  setTitleColor(value: string): void {
    this.emitTitle({ colorHex: value });
  }
  setTitleBorder(value: string): void {
    this.emitStyle({ titleBorder: (value || undefined) as CvBorderStyle | undefined });
  }

  reset(): void {
    const sel = this.selection();
    if (sel) this.resetSection.emit(sel.sectionKey);
  }
}

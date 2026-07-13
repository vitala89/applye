import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  CvBorderStyle,
  CvElementStyle,
  CvFontWeight,
  CvStyle,
  CvTextStyle,
} from '@applye/core';
import { CV_ATS_SAFE_FONTS } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import type { CvPreviewSelection, CvStyleScope, CvStylePanelChange } from '../../cv-content.util';

/**
 * Contextual live-style panel shown beside the paper in Preview mode. Receives
 * the selected section/part/element and the current document style, exposes a
 * SCOPE selector, and emits a single scope-tagged `CvStylePanelChange`. It
 * never owns persistence or the override-cleaning merge — the parent maps each
 * `(part, scope)` to the correct reducer/target (`patchCvElementStyle` /
 * `patchCvSectionStyle` / `patchCvDocumentBody` / `setSectionTitleStyle` /
 * `updateTitleStyle`) and keeps its own safety-check debounce.
 *
 * A body selection offers three scopes (element / section / document, default
 * element); a title selection offers two (this title = `section`, all titles =
 * `document`, default `section`). Line height is body-only; the title scope
 * uses `CvTextStyle` plus the section-title border. Each control reflects the
 * current value for the ACTIVE scope so editing is predictable, and the colour
 * control shows a set value rather than forcing the accent (no-accent-leak).
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

  /** Single scope-tagged change — the parent picks the write target from the
   * current `selection` (part / sectionKey / elementPath) plus `scope`. */
  readonly panelChange = output<CvStylePanelChange>();

  protected readonly atsSafeFonts = CV_ATS_SAFE_FONTS;

  /** Curated body leading choices (unitless). `1.45` is the existing
   * `--leading-normal`; unset (Inherit) preserves each element's baseline. */
  protected readonly lineHeightOptions: { value: number; labelKey: string }[] = [
    { value: 1.2, labelKey: 'documents.cv_style_line_height_compact' },
    { value: 1.35, labelKey: 'documents.cv_style_line_height_tight' },
    { value: 1.45, labelKey: 'documents.cv_style_line_height_normal' },
    { value: 1.6, labelKey: 'documents.cv_style_line_height_relaxed' },
  ];

  /** Active scope. Resets to the default whenever the selection changes; a
   * manual switch survives subsequent edits (which mutate `style`, not
   * `selection`). Default is `section` for a title (= this title), `element`
   * for a body leaf with an `elementPath`, and `section` for a pathless body
   * selection (a section-body wrapper with no single leaf singled out) — the
   * latter matters because `element` scope on a pathless selection would land
   * on nothing (the parent's element-scope branch requires a path) and
   * silently drop the edit. */
  readonly scope = linkedSignal<CvStyleScope>(() => {
    const sel = this.selection();
    if (!sel) return 'element';
    if (sel.part === 'title') return 'section';
    return sel.elementPath ? 'element' : 'section';
  });

  setScope(value: CvStyleScope): void {
    this.scope.set(value);
  }

  /** Raw body override for the active scope — feeds the control models so each
   * shows the value for the target the edit will land on (Inherit when unset;
   * document scope shows the always-present root values). */
  readonly activeBodyOverride = computed<Partial<CvElementStyle>>(() => {
    const sel = this.selection();
    if (!sel) return {};
    const s = this.style();
    switch (this.scope()) {
      case 'section': {
        const o = s.sectionStyles?.[sel.sectionKey] ?? {};
        return {
          fontFamily: o.fontFamily,
          fontSizePt: o.fontSizePt,
          fontWeight: o.fontWeight,
          colorHex: o.colorHex,
          lineHeight: o.lineHeight,
        };
      }
      case 'document':
        return {
          fontFamily: s.fontFamily,
          fontSizePt: s.fontSizePt,
          fontWeight: s.fontWeight,
          colorHex: s.accentColorHex,
        };
      case 'element':
      default:
        return (sel.elementPath ? s.elementStyles?.[sel.elementPath] : undefined) ?? {};
    }
  });

  /** Raw title text override for the active title scope (this title vs. all
   * titles) — feeds the title control models. */
  readonly activeTitleOverride = computed<CvTextStyle>(() => {
    const sel = this.selection();
    if (!sel) return {};
    const s = this.style();
    return this.scope() === 'document'
      ? (s.titleStyle ?? {})
      : (s.sectionStyles?.[sel.sectionKey]?.title ?? {});
  });

  /** Raw title-underline value for the active title scope ('' = Inherit). */
  readonly activeTitleBorder = computed<string>(() => {
    const sel = this.selection();
    if (!sel) return '';
    const s = this.style();
    return this.scope() === 'document'
      ? (s.titleBorder ?? '')
      : (s.sectionStyles?.[sel.sectionKey]?.titleBorder ?? '');
  });

  private emit(patch: Partial<CvElementStyle>): void {
    if (this.selection()) this.panelChange.emit({ scope: this.scope(), patch });
  }

  setBodyFont(value: string): void {
    this.emit({ fontFamily: value || undefined });
  }
  setBodySize(value: string | number | null): void {
    this.emit({ fontSizePt: value ? +value : undefined });
  }
  setBodyWeight(value: CvFontWeight | null): void {
    this.emit({ fontWeight: value ?? undefined });
  }
  setBodyColor(value: string): void {
    this.emit({ colorHex: value });
  }
  setLineHeight(value: number | null): void {
    this.emit({ lineHeight: value ?? undefined });
  }

  setTitleFont(value: string): void {
    this.emit({ fontFamily: value || undefined });
  }
  setTitleSize(value: string | number | null): void {
    this.emit({ fontSizePt: value ? +value : undefined });
  }
  setTitleWeight(value: CvFontWeight | null): void {
    this.emit({ fontWeight: value ?? undefined });
  }
  setTitleColor(value: string): void {
    this.emit({ colorHex: value });
  }
  setTitleBorder(value: string): void {
    if (this.selection()) {
      this.panelChange.emit({
        scope: this.scope(),
        titleBorder: (value || null) as CvBorderStyle | null,
      });
    }
  }

  reset(): void {
    if (this.selection()) this.panelChange.emit({ scope: this.scope(), reset: true });
  }
}

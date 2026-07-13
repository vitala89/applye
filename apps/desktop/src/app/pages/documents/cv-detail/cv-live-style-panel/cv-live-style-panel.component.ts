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
import { NgStyle } from '@angular/common';
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
  imports: [FormsModule, NgStyle],
  templateUrl: './cv-live-style-panel.component.html',
  styleUrl: './cv-live-style-panel.component.scss',
})
export class CvLiveStylePanelComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly selection = input<CvPreviewSelection | null>(null);
  readonly style = input.required<CvStyle>();
  /** Whether the document has ANY style override (element/section/title/
   * document) relative to the active theme's baseline — drives the "reset all
   * styling" footer button's enabled state. Computed by the parent
   * (`hasAnyCustomStyle`); the panel has no view of the whole style tree. */
  readonly hasCustomStyle = input<boolean>(false);

  /** Single scope-tagged change — the parent picks the write target from the
   * current `selection` (part / sectionKey / elementPath) plus `scope`. */
  readonly panelChange = output<CvStylePanelChange>();
  /** Reset EVERY style override (element + section + title + document) back
   * to the active theme's baseline — the "reset all styling" action, relocated
   * here from Edit mode (Task 5). The parent wires this straight to
   * `resetAllStyles()`; unlike `panelChange`, it doesn't depend on a live
   * selection. */
  readonly resetAll = output<void>();

  /** Fired when the user clicks the panel's Bold control. The parent routes it
   * to `CvPreviewComponent.applyActiveBold()`, which toggles `**bold**` around
   * the current selection of whichever inline editor is focused. The button
   * uses `(mousedown)` + `preventDefault` (see `onBoldMousedown`) so the focused
   * editor keeps focus and its text selection while the click is handled. */
  readonly boldSelection = output<void>();

  protected readonly atsSafeFonts = CV_ATS_SAFE_FONTS;

  /** The Bold word-formatting control only applies to editors backed by the
   * `**markdown**` inline-emphasis model — the summary body and experience
   * bullets. Other body leaves (skills, languages, education, contact) have no
   * inline-bold representation, so the control is hidden for them. */
  readonly showBold = computed<boolean>(() => {
    const sel = this.selection();
    return (
      !!sel &&
      sel.part === 'body' &&
      (sel.sectionKey === 'summary' || sel.sectionKey === 'experience')
    );
  });

  /** Inline style for the "Ag" preview swatch — reflects the font/weight/colour
   * of the ACTIVE scope's override so the user previews the edit target before
   * committing. Unset properties fall through to the paper's Georgia default. */
  readonly sampleStyle = computed<Record<string, string>>(() => {
    const sel = this.selection();
    if (!sel) return {};
    const o = sel.part === 'title' ? this.activeTitleOverride() : this.activeBodyOverride();
    const css: Record<string, string> = {
      'font-family': o.fontFamily || 'Georgia, "Times New Roman", serif',
    };
    if (o.fontWeight != null) css['font-weight'] = String(o.fontWeight);
    if (o.colorHex) css['color'] = o.colorHex;
    return css;
  });

  onBoldMousedown(event: Event): void {
    event.preventDefault();
    this.boldSelection.emit();
  }

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
          // Document-scope BODY colour reads `bodyColorHex` — distinct from
          // `accentColorHex` (the title scope's document colour, read
          // separately by `activeTitleOverride`/`setTitleColor`). Unset →
          // Inherit (no forced body colour), per the no-accent-leak rule.
          colorHex: s.bodyColorHex,
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

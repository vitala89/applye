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
  /** The plain text of the currently-selected element — shown in the "Ag"
   * sample swatch so it previews the real content (not lorem). Resolved by the
   * parent from the selection + sections; empty for pathless selections. */
  readonly sampleText = input<string>('');

  /** Single scope-tagged change — the parent picks the write target from the
   * current `selection` (part / sectionKey / elementPath) plus `scope`. */
  readonly panelChange = output<CvStylePanelChange>();
  /** Reset EVERY style override (element + section + title + document) back
   * to the active theme's baseline — the "reset all styling" action, relocated
   * here from Edit mode (Task 5). The parent wires this straight to
   * `resetAllStyles()`; unlike `panelChange`, it doesn't depend on a live
   * selection. */
  readonly resetAll = output<void>();

  /** Fired when the user clicks "Edit text". The parent routes it to
   * `CvPreviewComponent.startEditing()`, which mounts the selected element's
   * inline editor so the wording can be changed — selection alone no longer
   * enters edit mode. */
  readonly editText = output<void>();

  protected readonly atsSafeFonts = CV_ATS_SAFE_FONTS;

  /** "Edit text" applies to editable content — any body selection. Titles are
   * fixed section labels, not user-authored text, so they get no Edit control. */
  readonly canEditText = computed<boolean>(() => this.selection()?.part === 'body');

  /** The specific field label + short id for the current selection — shown in
   * the panel's "Editing" header so it names exactly what's selected (mirrors
   * the on-paper chip, e.g. "Name  #name"). Derived by parsing the selection's
   * `elementPath`; falls back to the generic body/title labels. */
  private fieldInfo(): { key: string; id: string } | null {
    const sel = this.selection();
    if (!sel) return null;
    if (sel.part === 'title') return { key: 'documents.cv_style_group_titles', id: sel.sectionKey };
    const p = sel.elementPath;
    if (!p || p === 'summary') {
      return { key: 'documents.cv_style_group_body', id: p || sel.sectionKey };
    }
    const seg = p.split('.');
    switch (seg[0]) {
      case 'pd':
        return seg[1] === 'fullName'
          ? { key: 'documents.cv_field_full_name', id: 'name' }
          : { key: 'documents.cv_field_title', id: 'title' };
      case 'exp': {
        if (seg.includes('bullet')) return { key: 'documents.cv_field_bullet', id: 'bullet' };
        const map: Record<string, string> = {
          company: 'documents.cv_field_company',
          industry: 'documents.cv_field_industry',
          location: 'documents.cv_field_location',
          role: 'documents.cv_field_role',
        };
        return {
          key: map[seg[2]] ?? 'documents.cv_style_group_body',
          id: seg[2] ?? sel.sectionKey,
        };
      }
      case 'skills':
        return seg[2] === 'label'
          ? { key: 'documents.cv_field_label', id: 'category' }
          : { key: 'documents.cv_field_values', id: 'values' };
      case 'lang':
        return { key: 'documents.cv_field_language', id: 'language' };
      case 'edu':
        return { key: 'documents.cv_section_education', id: 'edu' + (seg[1] ?? '') };
      default:
        return { key: 'documents.cv_style_group_body', id: sel.sectionKey };
    }
  }

  readonly selFieldKey = computed<string>(() => this.fieldInfo()?.key ?? '');
  readonly selFieldId = computed<string>(() => this.fieldInfo()?.id ?? '');

  /** The click-a-word-to-bold hint is shown only for the `**markdown**`-backed
   * leaves — the summary body and experience bullets. Other body leaves have
   * no inline-bold representation. */
  readonly showWordBoldHint = computed<boolean>(() => {
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

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
import { sectionLabelKey } from '../../cv-content.util';
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

  /** The selected leaf's REAL rendered typography, read from the paper's DOM by
   * the parent (`CvPreviewComponent.readSelectedHostStyle`). Used as the "Ag"
   * swatch's base so it mirrors the page exactly — including class/theme
   * styling the `CvStyle` model doesn't carry (the name's bold uppercase
   * monospace, an accent colour from a CSS var). The active-scope override is
   * layered on top so a pending edit still previews live. */
  readonly sampleBaseStyle = input<Record<string, string>>({});

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

  /** Whether the selected leaf is currently in text-edit mode — mirrored from
   * `CvPreviewComponent.editing()`. Gates the panel's Bold button (which
   * replaced the inline "B" removed from the paper's editors). */
  readonly editing = input<boolean>(false);

  /** Fired when the user clicks the panel's Bold button while editing a
   * bold-capable leaf; the parent routes it to
   * `CvPreviewComponent.applyBoldToActiveEditor()`. */
  readonly bold = output<void>();

  protected readonly atsSafeFonts = CV_ATS_SAFE_FONTS;

  /** "Edit text" applies to editable content — any body selection. Titles are
   * fixed section labels, not user-authored text, so they get no Edit control. */
  readonly canEditText = computed<boolean>(() => {
    const sel = this.selection();
    // The contact line is style-only (it's composed from several fields and
    // has no single inline editor), so it never offers "Edit text".
    return sel?.part === 'body' && sel.elementPath !== 'pd.contact';
  });

  /** The specific field label + short id for the current selection — shown in
   * the panel's "Editing" header so it names exactly what's selected (mirrors
   * the on-paper chip, e.g. "Name  #name"). Derived by parsing the selection's
   * `elementPath`; falls back to the generic body/title labels. */
  private fieldInfo(): { key: string; id: string } | null {
    const sel = this.selection();
    if (!sel) return null;
    if (sel.part === 'title') return { key: 'documents.cv_style_group_titles', id: sel.sectionKey };
    const p = sel.elementPath;
    // Whole-section selection (body, no specific leaf): name the section
    // itself so the header reads e.g. "Personal details" rather than the
    // generic "Body text".
    if (!p) {
      return { key: sectionLabelKey(sel.sectionKey), id: sel.sectionKey };
    }
    if (p === 'summary') {
      return { key: 'documents.cv_style_group_body', id: 'summary' };
    }
    const seg = p.split('.');
    switch (seg[0]) {
      case 'pd':
        return seg[1] === 'fullName'
          ? { key: 'documents.cv_field_full_name', id: 'name' }
          : seg[1] === 'contact'
            ? { key: 'documents.cv_field_contact', id: 'contact' }
            : { key: 'documents.cv_field_title', id: 'title' };
      case 'exp': {
        if (seg.includes('bullet')) return { key: 'documents.cv_field_bullet', id: 'bullet' };
        const map: Record<string, string> = {
          company: 'documents.cv_field_company',
          industry: 'documents.cv_field_industry',
          location: 'documents.cv_field_location',
          role: 'documents.cv_field_role',
          startDate: 'documents.cv_field_start_date',
          endDate: 'documents.cv_field_end_date',
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
      case 'edu': {
        const map: Record<string, string> = {
          degree: 'documents.cv_field_degree',
          institution: 'documents.cv_field_institution',
          startDate: 'documents.cv_field_start_date',
          endDate: 'documents.cv_field_end_date',
        };
        return {
          key: map[seg[2]] ?? 'documents.cv_section_education',
          id: seg[2] ?? 'edu' + (seg[1] ?? ''),
        };
      }
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

  /** The selected leaf is one whose text supports `**bold**` — only the
   * summary body and experience bullets. Drives the panel's Bold button
   * (shown while editing such a leaf). */
  readonly canBold = computed<boolean>(() => {
    const p = this.selection()?.part === 'body' ? this.selection()?.elementPath : undefined;
    return !!p && (p === 'summary' || p.split('.').includes('bullet'));
  });

  /** Inline style for the "Ag" preview swatch — reflects the font/weight/colour
   * of the ACTIVE scope's override so the user previews the edit target before
   * committing. Unset properties fall through to the paper's Georgia default. */
  readonly sampleStyle = computed<Record<string, string>>(() => {
    const sel = this.selection();
    // Start from the leaf's REAL rendered style (from the paper), falling back
    // to Georgia only when the paper hasn't reported one yet.
    const base = this.sampleBaseStyle();
    const css: Record<string, string> = {
      'font-family': 'Georgia, "Times New Roman", serif',
      ...base,
    };
    if (!sel) return css;
    // Layer the ACTIVE scope's pending override on top so a mid-edit change
    // previews immediately (before the paper re-renders and re-reports).
    const o = sel.part === 'title' ? this.activeTitleOverride() : this.activeBodyOverride();
    if (o.fontFamily) css['font-family'] = o.fontFamily;
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

  /** Raw title-underline thickness (pt) for the active title scope
   * (`null` = Inherit → theme default). */
  readonly activeTitleRuleWidth = computed<number | null>(() => {
    const sel = this.selection();
    if (!sel) return null;
    const s = this.style();
    return (
      (this.scope() === 'document'
        ? s.titleRuleWidthPt
        : s.sectionStyles?.[sel.sectionKey]?.titleRuleWidthPt) ?? null
    );
  });

  /** Raw title-underline colour for the active title scope
   * (`null` = Inherit → theme rule colour). */
  readonly activeTitleRuleColor = computed<string | null>(() => {
    const sel = this.selection();
    if (!sel) return null;
    const s = this.style();
    return (
      (this.scope() === 'document'
        ? s.titleRuleColorHex
        : s.sectionStyles?.[sel.sectionKey]?.titleRuleColorHex) ?? null
    );
  });

  setTitleRuleWidth(value: string | number | null): void {
    if (this.selection()) {
      this.panelChange.emit({ scope: this.scope(), titleRuleWidth: value ? +value : null });
    }
  }
  setTitleRuleColor(value: string): void {
    if (this.selection()) {
      this.panelChange.emit({ scope: this.scope(), titleRuleColor: value || null });
    }
  }

  reset(): void {
    if (this.selection()) this.panelChange.emit({ scope: this.scope(), reset: true });
  }
}

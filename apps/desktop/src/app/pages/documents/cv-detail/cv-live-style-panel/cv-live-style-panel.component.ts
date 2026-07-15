import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgStyle } from '@angular/common';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import type {
  CvBorderStyle,
  CvElementStyle,
  CvFontWeight,
  CvStyle,
  CvTextStyle,
} from '@applye/core';
import { CV_ATS_SAFE_FONTS } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import {
  effectiveTitleRuleColor,
  effectiveTitleRuleWidth,
  sectionLabelKey,
} from '../../cv-content.util';
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
  imports: [FormsModule, NgStyle, LucideAngularModule],
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
  protected readonly icons = { chevron: ChevronDown };

  /** Collapsible-group state (session only): the Text group opens by default,
   * the Line group starts collapsed — this keeps the panel short enough that
   * the footer reset button stays reachable on small windows without
   * scrolling. */
  readonly textOpen = signal(true);
  readonly lineOpen = signal(false);

  /** "Edit text" applies to editable content — any body selection. Titles are
   * fixed section labels, not user-authored text, so they get no Edit control. */
  readonly canEditText = computed<boolean>(() => {
    const sel = this.selection();
    const p = sel?.elementPath;
    // "Edit text" only applies to a single editable TEXT leaf. Excluded: a
    // pathless whole-section body, the composed contact line, the whole
    // languages line, and group/entry paths — none has one inline editor.
    return (
      sel?.part === 'body' && !!p && p !== 'pd.contact' && p !== 'lang' && !this.isEntryPath(p)
    );
  });

  /** The specific field label + short id for the current selection — shown in
   * the panel's "Editing" header so it names exactly what's selected (mirrors
   * the on-paper chip, e.g. "Name  #name"). Derived by parsing the selection's
   * `elementPath`; falls back to the generic body/title labels. */
  /** A "group" path (`exp.0`, `edu.1`, `skills.0`) targets a whole
   * experience/education entry or a skills group, not a single text leaf — it
   * behaves like a section selection (section-scope styling, section name in
   * the header) but frames just the clicked group on the paper. */
  private isEntryPath(p: string | undefined): boolean {
    return !!p && /^(?:exp|edu|skills)\.\d+$/.test(p);
  }

  private fieldInfo(): { key: string; id: string } | null {
    const sel = this.selection();
    if (!sel) return null;
    if (sel.part === 'title') return { key: 'documents.cv_style_group_titles', id: sel.sectionKey };
    const p = sel.elementPath;
    // A group/entry, the whole languages line, or a pathless body selection
    // all name the SECTION itself in the header (e.g. "Education", "Languages")
    // rather than a generic field label.
    if (this.isEntryPath(p) || this.isWholeLanguages(p) || !p) {
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

  /** The contextual "APPLY TO" buttons for the current selection — each names
   * the actual thing it targets ("This experience" / "All experiences") rather
   * than the abstract element/section scope, and single-target selections
   * (personal-details block, body text, languages, a lone field) show just one
   * button. The first entry is the default scope. */
  readonly scopeButtons = computed<{ scope: CvStyleScope; label: string }[]>(() => {
    const sel = this.selection();
    if (!sel) return [];
    const t = this.t();
    const D = (k: string) => t('documents.' + k);
    if (sel.part === 'title') {
      return [
        { scope: 'section', label: D('cv_style_scope_this_title') },
        { scope: 'document', label: D('cv_style_scope_all_titles') },
      ];
    }
    const p = sel.elementPath;
    // Whole-section body block (personal details) — one button, named section.
    if (!p) return [{ scope: 'section', label: t(sectionLabelKey(sel.sectionKey)) }];
    if (p === 'summary') return [{ scope: 'element', label: D('cv_scope_body_text') }];
    if (p === 'lang') return [{ scope: 'element', label: D('cv_scope_languages') }];
    const seg = p.split('.');
    if (this.isEntryPath(p)) {
      if (seg[0] === 'exp')
        return [
          { scope: 'element', label: D('cv_scope_this_experience') },
          { scope: 'section', label: D('cv_scope_all_experiences') },
        ];
      if (seg[0] === 'edu')
        return [
          { scope: 'element', label: D('cv_scope_this_education') },
          { scope: 'section', label: D('cv_scope_all_education') },
        ];
      return [
        { scope: 'element', label: D('cv_scope_this_skills') },
        { scope: 'section', label: D('cv_scope_all_skills') },
      ];
    }
    if (seg[0] === 'exp' && seg.includes('bullet')) {
      return [
        { scope: 'element', label: D('cv_scope_this_achievement') },
        { scope: 'bullets', label: D('cv_scope_all_achievements') },
      ];
    }
    // A single field (company, role, name, date, …): element-only.
    return [{ scope: 'element', label: D('cv_scope_this_field') }];
  });

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

  /** Hex for the COLOR control at the active scope. The override wins; with
   * none it shows the leaf's REAL rendered colour (from the paper), so the
   * picker matches the page even when the colour is INHERITED from a higher
   * scope (e.g. a "This section" colour showing through on a single field) —
   * previously it fell straight to the accent, so the picker read green while
   * the text was blue. Falls back to the accent only when nothing is known. */
  readonly effectiveColorHex = computed<string>(() => {
    const o =
      this.selection()?.part === 'title' ? this.activeTitleOverride() : this.activeBodyOverride();
    return (
      o.colorHex ?? this.rgbToHex(this.sampleBaseStyle()['color']) ?? this.style().accentColorHex
    );
  });

  /** Normalise a computed `rgb()/rgba()` colour to `#rrggbb` for `<input
   * type="color">` (which only accepts hex). Passes through an existing hex;
   * returns null when it can't parse. */
  private rgbToHex(value: string | undefined): string | null {
    if (!value) return null;
    if (value.startsWith('#')) return value;
    const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const h = (n: string) => Number(n).toString(16).padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
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
  readonly scope = linkedSignal<CvStyleScope>(() => this.scopeButtons()[0]?.scope ?? 'element');

  /** The languages line is a single whole-section element (`lang`): styling it
   * is the same as styling the section, so the section scope is redundant and
   * hidden. */
  private isWholeLanguages(p: string | undefined): boolean {
    return p === 'lang';
  }

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
      case 'bullets': {
        // "All achievements" — the section's shared bullet style.
        const o = s.sectionStyles?.[sel.sectionKey]?.bulletStyle ?? {};
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

  /** Title text values for the active title scope (this title vs. all titles) —
   * feeds the title control models. At "this title" a property with no override
   * of its own shows the all-titles value it INHERITS, not a blank: the control
   * must read as what the title actually renders, so switching scope after an
   * all-titles edit never leaves a stale value on screen. A property set here
   * still wins, and one set nowhere still reads as Inherit. */
  readonly activeTitleOverride = computed<CvTextStyle>(() => {
    const sel = this.selection();
    if (!sel) return {};
    const s = this.style();
    const doc = s.titleStyle ?? {};
    if (this.scope() === 'document') return doc;
    const own = s.sectionStyles?.[sel.sectionKey]?.title ?? {};
    return {
      fontFamily: own.fontFamily ?? doc.fontFamily,
      fontSizePt: own.fontSizePt ?? doc.fontSizePt,
      fontWeight: own.fontWeight ?? doc.fontWeight,
      colorHex: own.colorHex ?? doc.colorHex,
    };
  });

  /** Title-underline value for the active title scope ('' = Inherit; "this
   * title" falls back to the all-titles line — see `activeTitleOverride`). */
  readonly activeTitleBorder = computed<string>(() => {
    const sel = this.selection();
    if (!sel) return '';
    const s = this.style();
    return this.scope() === 'document'
      ? (s.titleBorder ?? '')
      : (s.sectionStyles?.[sel.sectionKey]?.titleBorder ?? s.titleBorder ?? '');
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

  /** Title-underline thickness (pt) for the active title scope (`null` =
   * Inherit → theme default; "this title" falls back to the all-titles width). */
  readonly activeTitleRuleWidth = computed<number | null>(() => {
    const sel = this.selection();
    if (!sel) return null;
    const s = this.style();
    return (
      (this.scope() === 'document'
        ? s.titleRuleWidthPt
        : effectiveTitleRuleWidth(s, sel.sectionKey)) ?? null
    );
  });

  /** Title-underline colour for the active title scope (`null` = Inherit →
   * theme rule colour; "this title" falls back to the all-titles colour). */
  readonly activeTitleRuleColor = computed<string | null>(() => {
    const sel = this.selection();
    if (!sel) return null;
    const s = this.style();
    return (
      (this.scope() === 'document'
        ? s.titleRuleColorHex
        : effectiveTitleRuleColor(s, sel.sectionKey)) ?? null
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

  /** Sections that draw a BODY divider the user can size/colour: the
   * personal-details header underline and the experience entry rule. */
  readonly canBodyRule = computed<boolean>(() => {
    const sel = this.selection();
    if (!sel || sel.part !== 'body') return false;
    if (sel.sectionKey !== 'personal_details' && sel.sectionKey !== 'experience') return false;
    // The section's structural divider. Shown at section scope, and for an
    // ENTRY container — an entry has no per-leaf line of its own (a border
    // there would land under its bullets), so this rule is the only line that
    // means anything for it, and hiding it left an entry selection with no
    // line control at all. Writes always target the section, which is where
    // the rule lives: there is no per-entry rule in the model.
    //
    // Deliberately hidden for a single FIELD (`exp.0.role`, `pd.name`): that
    // uses its own per-leaf line group, so the two never overlap and editing a
    // field can't silently rewrite the whole section's divider.
    return this.scope() === 'section' || this.isEntryPath(sel.elementPath);
  });

  /** Raw section body-rule style ('' = Inherit → the theme's rule). */
  readonly activeBodyBorder = computed<string>(() => {
    const sel = this.selection();
    return sel ? (this.style().sectionStyles?.[sel.sectionKey]?.bodyBorder ?? '') : '';
  });

  setBodyBorder(value: string): void {
    if (this.selection()) {
      this.panelChange.emit({
        scope: this.scope(),
        bodyBorder: (value as CvBorderStyle) || null,
      });
    }
  }

  /** Raw section body-rule width (pt) for the selected section
   * (`null` = Inherit → theme rule). */
  readonly activeBodyRuleWidth = computed<number | null>(() => {
    const sel = this.selection();
    return sel ? (this.style().sectionStyles?.[sel.sectionKey]?.bodyRuleWidthPt ?? null) : null;
  });

  /** Raw section body-rule colour for the selected section
   * (`null` = Inherit → theme rule colour). */
  readonly activeBodyRuleColor = computed<string | null>(() => {
    const sel = this.selection();
    return sel ? (this.style().sectionStyles?.[sel.sectionKey]?.bodyRuleColorHex ?? null) : null;
  });

  setBodyRuleWidth(value: string | number | null): void {
    if (this.selection()) {
      this.panelChange.emit({ scope: this.scope(), bodyRuleWidth: value ? +value : null });
    }
  }
  setBodyRuleColor(value: string): void {
    if (this.selection()) {
      this.panelChange.emit({ scope: this.scope(), bodyRuleColor: value || null });
    }
  }

  /** Sections that draw in-line item separators the user can size/colour —
   * the `|` between languages. */
  readonly canSeparator = computed<boolean>(() => {
    const sel = this.selection();
    return !!sel && sel.part === 'body' && sel.sectionKey === 'languages';
  });

  readonly activeSeparatorColor = computed<string | null>(() => {
    const sel = this.selection();
    return sel ? (this.style().sectionStyles?.[sel.sectionKey]?.separatorColorHex ?? null) : null;
  });

  readonly activeSeparatorSize = computed<number | null>(() => {
    const sel = this.selection();
    return sel ? (this.style().sectionStyles?.[sel.sectionKey]?.separatorSizePt ?? null) : null;
  });

  setSeparatorColor(value: string): void {
    if (this.selection()) {
      this.panelChange.emit({ scope: this.scope(), separatorColor: value || null });
    }
  }
  setSeparatorSize(value: string | number | null): void {
    if (this.selection()) {
      this.panelChange.emit({ scope: this.scope(), separatorSize: value ? +value : null });
    }
  }

  /** A single leaf, styled at element scope, can carry its own bottom rule
   * (underline). Excluded: the composed contact line (`pd.contact`), a
   * multi-field wrapper with no single baseline; and an experience/education/
   * skills ENTRY (`exp.0`), which is a container wrapping the head AND its
   * bullets — a border there lands under the bullets, not under the head. An
   * entry's divider is the section's `bodyBorder` rule instead. */
  readonly canElementLine = computed<boolean>(() => {
    const sel = this.selection();
    const p = sel?.elementPath;
    return this.scope() === 'element' && !!p && p !== 'pd.contact' && !this.isEntryPath(p);
  });

  /** Raw per-leaf border style for the selected element ('' = none/off). */
  readonly activeElementBorder = computed<string>(() => {
    const p = this.selection()?.elementPath;
    return (p && this.style().elementStyles?.[p]?.borderStyle) || '';
  });

  readonly activeElementRuleWidth = computed<number | null>(() => {
    const p = this.selection()?.elementPath;
    return (p ? this.style().elementStyles?.[p]?.ruleWidthPt : undefined) ?? null;
  });

  readonly activeElementRuleColor = computed<string | null>(() => {
    const p = this.selection()?.elementPath;
    return (p ? this.style().elementStyles?.[p]?.ruleColorHex : undefined) ?? null;
  });

  /** Whether the selected leaf currently draws a line (controls whether the
   * width/colour rows are shown). */
  readonly hasElementLine = computed<boolean>(() => {
    const b = this.activeElementBorder();
    return b !== '' && b !== 'none';
  });

  /** Pick a line style. 'none'/'' clears the whole rule (style + width +
   * colour) so an off leaf keeps no stray override. */
  setElementBorder(value: string): void {
    if (!value || value === 'none') {
      this.emit({ borderStyle: undefined, ruleWidthPt: undefined, ruleColorHex: undefined });
    } else {
      this.emit({ borderStyle: value as CvBorderStyle });
    }
  }
  setElementRuleWidth(value: string | number | null): void {
    this.emit({ ruleWidthPt: value ? +value : undefined });
  }
  setElementRuleColor(value: string): void {
    this.emit({ ruleColorHex: value || undefined });
  }

  reset(): void {
    if (this.selection()) this.panelChange.emit({ scope: this.scope(), reset: true });
  }
}

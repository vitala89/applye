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
  /** The active theme's own section-title rule (`themeTitleRule`), or null for
   * a theme that draws none. Lets the line size/colour controls show the exact
   * value the title renders at when the user has set no override of their own,
   * instead of a blank Inherit. The panel has no view of the theme itself — the
   * parent resolves it. */
  readonly themeRule = input<{ widthPt: number; colorHex: string } | null>(null);
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

  /** Swatch colour for an underline control. `<input type="color">` cannot show
   * "unset", so an unset rule must still resolve to the colour on the page:
   * after the style model (the user's own value, then the theme's rule) comes
   * the rule colour read from the rendered host, which is the only way to see a
   * neutral default that lives in CSS tokens. The accent is the last resort,
   * for a selection whose host was not read.
   *
   * Only for rules the SELECTED host itself draws (a title's, a leaf's). The
   * section body rule and the languages separator are drawn by other elements,
   * so their swatches must not read this. */
  private ruleColorSwatch(value: string | null): string {
    return (
      value ??
      this.rgbToHex(this.sampleBaseStyle()['border-bottom-color']) ??
      this.style().accentColorHex
    );
  }

  readonly titleRuleColorSwatch = computed<string>(() =>
    this.ruleColorSwatch(this.activeTitleRuleColor()),
  );
  readonly elementRuleColorSwatch = computed<string>(() =>
    this.ruleColorSwatch(this.activeElementRuleColor()),
  );

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

  /** Body values for the active scope — feeds the control models so each shows
   * the value the selection actually RENDERS with, not a blank: an unset
   * property falls through the same cascade the preview draws with, so the
   * control never contradicts the page (see `activeTitleOverride`).
   *
   * Each scope walks its own chain, because the renderer does:
   * - `element` — the leaf's own override, then what it inherits: the shared
   *   bullet style for a bullet (`<ul>` `bulletListCss`), the section override
   *   for anything else (`bodyCss`/`entryCss`), then the document.
   * - `bullets` — the shared bullet style over the DOCUMENT: bullets skip the
   *   section scope by design (that scope styles the entry heads only).
   * - `section` — the section override, then the document.
   * - `document` — the always-present root values.
   *
   * Colour never falls back to `accentColorHex` at any scope (no-accent-leak):
   * body text reads `bodyColorHex`, which is unset unless the user picks one,
   * and bullets have no colour base at all — both correctly read as Inherit. */
  readonly activeBodyOverride = computed<Partial<CvElementStyle>>(() => {
    const sel = this.selection();
    if (!sel) return {};
    const s = this.style();
    const section = s.sectionStyles?.[sel.sectionKey] ?? {};
    const bullet = section.bulletStyle ?? {};
    const doc = {
      fontFamily: s.fontFamily,
      fontSizePt: s.fontSizePt,
      fontWeight: s.fontWeight,
      colorHex: s.bodyColorHex,
      lineHeight: undefined,
    };
    const sectionOver: Partial<CvElementStyle> = {
      fontFamily: section.fontFamily ?? doc.fontFamily,
      fontSizePt: section.fontSizePt ?? doc.fontSizePt,
      fontWeight: section.fontWeight ?? doc.fontWeight,
      colorHex: section.colorHex ?? doc.colorHex,
      lineHeight: section.lineHeight,
    };
    const bulletOver: Partial<CvElementStyle> = {
      fontFamily: bullet.fontFamily ?? doc.fontFamily,
      fontSizePt: bullet.fontSizePt ?? doc.fontSizePt,
      fontWeight: bullet.fontWeight ?? doc.fontWeight,
      // No colour in the bullet base — an unset colour keeps the muted default,
      // so it reads as Inherit rather than the body colour.
      colorHex: bullet.colorHex,
      lineHeight: bullet.lineHeight,
    };
    switch (this.scope()) {
      case 'section':
        return sectionOver;
      case 'bullets':
        return bulletOver;
      case 'document':
        return doc;
      case 'element':
      default: {
        const own = (sel.elementPath ? s.elementStyles?.[sel.elementPath] : undefined) ?? {};
        const base = this.isBulletPath(sel.elementPath) ? bulletOver : sectionOver;
        return {
          fontFamily: own.fontFamily ?? base.fontFamily,
          fontSizePt: own.fontSizePt ?? base.fontSizePt,
          fontWeight: own.fontWeight ?? base.fontWeight,
          colorHex: own.colorHex ?? base.colorHex,
          lineHeight: own.lineHeight ?? base.lineHeight,
        };
      }
    }
  });

  /** A bullet leaf (`exp.0.bullet.1`) — the one body path whose inherited base
   * is the shared bullet style rather than the section override. */
  private isBulletPath(p: string | undefined): boolean {
    return !!p && p.includes('.bullet.');
  }

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

  /** Title-underline thickness (pt) for the active title scope. Falls through
   * the same cascade the title renders with — this title → all titles → the
   * theme's own rule — so the control shows the size actually on the page.
   * `null` (Inherit) only when the theme draws no rule either: that neutral
   * default lives in CSS tokens, which must not be forked into TS. */
  readonly activeTitleRuleWidth = computed<number | null>(() => {
    const sel = this.selection();
    if (!sel) return null;
    const s = this.style();
    const user =
      this.scope() === 'document' ? s.titleRuleWidthPt : effectiveTitleRuleWidth(s, sel.sectionKey);
    return user ?? this.themeRule()?.widthPt ?? null;
  });

  /** Title-underline colour for the active title scope — same cascade as
   * `activeTitleRuleWidth`. */
  readonly activeTitleRuleColor = computed<string | null>(() => {
    const sel = this.selection();
    if (!sel) return null;
    const s = this.style();
    const user =
      this.scope() === 'document'
        ? s.titleRuleColorHex
        : effectiveTitleRuleColor(s, sel.sectionKey);
    return user ?? this.themeRule()?.colorHex ?? null;
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
    // The section's structural divider — every entry's line at once, i.e.
    // exactly the "All experiences" scope. Section scope ONLY: an entry now has
    // a rule of its own (`entryCss` re-points the head's vars at it), so at
    // element scope the entry's own line group is the honest control. Showing
    // this one there is what made a "This experience" line edit restyle every
    // entry — the write lands on the section, which is where this rule lives.
    //
    // Also hidden for a single FIELD (`exp.0.role`, `pd.name`), which likewise
    // has its own per-leaf line group.
    return this.scope() === 'section';
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
   * multi-field wrapper with no single baseline; and an education/skills ENTRY,
   * whose head draws no rule at all, so the control would do nothing.
   *
   * An EXPERIENCE entry (`exp.0`) is included: its head is the one entry head
   * that draws a rule, and `entryCss` re-points that rule's vars at the entry's
   * own override. The border still never lands on the container itself (it
   * would draw under the bullets) — see `entryCss`. */
  readonly canElementLine = computed<boolean>(() => {
    const sel = this.selection();
    const p = sel?.elementPath;
    if (this.scope() !== 'element' || !p || p === 'pd.contact') return false;
    return !this.isEntryPath(p) || this.isExperienceEntryPath(p);
  });

  /** An experience entry (`exp.0`) — the only entry with a rule of its own. */
  private isExperienceEntryPath(p: string | undefined): boolean {
    return !!p && /^exp\.\d+$/.test(p);
  }

  /** The selected element's line, as it RENDERS. An experience entry with no
   * override of its own inherits the section's divider, so its controls show
   * that (see `activeTitleOverride` for the same rule on titles). A plain leaf
   * has no such fallback by design: its underline is its own or absent. */
  readonly activeElementBorder = computed<string>(() => {
    const p = this.selection()?.elementPath;
    const own = p && this.style().elementStyles?.[p]?.borderStyle;
    if (own) return own;
    return this.isExperienceEntryPath(p) ? this.activeBodyBorder() : '';
  });

  readonly activeElementRuleWidth = computed<number | null>(() => {
    const p = this.selection()?.elementPath;
    const own = p ? this.style().elementStyles?.[p]?.ruleWidthPt : undefined;
    return own ?? (this.isExperienceEntryPath(p) ? this.activeBodyRuleWidth() : null);
  });

  readonly activeElementRuleColor = computed<string | null>(() => {
    const p = this.selection()?.elementPath;
    const own = p ? this.style().elementStyles?.[p]?.ruleColorHex : undefined;
    return own ?? (this.isExperienceEntryPath(p) ? this.activeBodyRuleColor() : null);
  });

  /** Whether the selected leaf currently draws a line (controls whether the
   * width/colour rows are shown). */
  readonly hasElementLine = computed<boolean>(() => {
    const b = this.activeElementBorder();
    return b !== '' && b !== 'none';
  });

  /** Pick a line style. '' (Inherit) clears the whole rule (style + width +
   * colour) so nothing stray is kept.
   *
   * 'none' clears it too for a plain leaf, where absent IS off. For an
   * experience entry the two differ: absent means it inherits the section's
   * divider, so an explicit 'none' has to be stored, or turning this entry's
   * line off would just hand it back the section's. */
  setElementBorder(value: string): void {
    const off = { borderStyle: undefined, ruleWidthPt: undefined, ruleColorHex: undefined };
    if (!value) {
      this.emit(off);
    } else if (value === 'none') {
      this.emit(
        this.isExperienceEntryPath(this.selection()?.elementPath)
          ? { borderStyle: 'none' }
          : { ...off },
      );
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

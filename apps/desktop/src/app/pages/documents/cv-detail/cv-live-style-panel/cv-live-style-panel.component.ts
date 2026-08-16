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
import type { CvBorderStyle, CvElementStyle, CvFontWeight, CvStyle } from '@applye/core';
import type { CvPreviewSelection, CvStyleScope, CvStylePanelChange } from '@applye/core';
import { CV_ATS_SAFE_FONTS } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import {
  canBold,
  canEditText,
  isExperienceEntryPath,
  scopeButtonsFor,
  selectedFieldInfo,
  showsWordBoldHint,
} from './cv-style-panel-selection';
import {
  bodyOverrideAt,
  elementBorderAt,
  elementBorderPatch,
  elementRuleColorAt,
  elementRuleWidthAt,
  rgbToHex,
  ruleColorSwatch,
  sectionBodyBorder,
  sectionBodyRuleColor,
  sectionBodyRuleWidth,
  sectionSeparatorColor,
  sectionSeparatorSize,
  showsBodyRule,
  showsElementLine,
  showsSeparator,
  titleBorderAt,
  titleOverrideAt,
  titleRuleColorAt,
  titleRuleWidthAt,
} from './cv-style-panel-cascade';

/**
 * Contextual live-style panel shown beside the paper in Preview mode. Receives
 * the selected section/part/element and the current document style, exposes a
 * SCOPE selector, and emits a single scope-tagged `CvStylePanelChange`. It
 * never owns persistence or the override-cleaning merge - the parent maps each
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
 *
 * **What it owns is now only the wiring.** Two page-local pure modules hold the
 * rules and carry the reasoning for each: `cv-style-panel-selection.ts` decides
 * what the selection *is* (path predicates, the header's field label, the APPLY
 * TO buttons), and `cv-style-panel-cascade.ts` decides what a control should
 * *show* at the active scope. Everything below is inputs, outputs, the scope
 * signal, and one-line bindings onto those two.
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
   * document) relative to the active theme's baseline - drives the "reset all
   * styling" footer button's enabled state. Computed by the parent
   * (`hasAnyCustomStyle`); the panel has no view of the whole style tree. */
  readonly hasCustomStyle = input<boolean>(false);
  /** The active theme's own section-title rule (`themeTitleRule`), or null for
   * a theme that draws none. Lets the line size/colour controls show the exact
   * value the title renders at when the user has set no override of their own,
   * instead of a blank Inherit. The panel has no view of the theme itself - the
   * parent resolves it. */
  readonly themeRule = input<{ widthPt: number; colorHex: string } | null>(null);
  /** The active theme's own rule under an experience entry's head
   * (`themeEntryRule`), or null for a theme that draws none. An entry with no
   * line of its own and no section rule still draws THIS, so its controls must
   * report it rather than "None". */
  readonly themeEntryRule = input<{ widthPt: number; colorHex: string } | null>(null);
  /** The plain text of the currently-selected element - shown in the "Ag"
   * sample swatch so it previews the real content (not lorem). Resolved by the
   * parent from the selection + sections; empty for pathless selections. */
  readonly sampleText = input<string>('');

  /** The selected leaf's REAL rendered typography, read from the paper's DOM by
   * the parent (`CvPreviewComponent.readSelectedHostStyle`). Used as the "Ag"
   * swatch's base so it mirrors the page exactly - including class/theme
   * styling the `CvStyle` model doesn't carry (the name's bold uppercase
   * monospace, an accent colour from a CSS var). The active-scope override is
   * layered on top so a pending edit still previews live. */
  readonly sampleBaseStyle = input<Record<string, string>>({});

  /** Single scope-tagged change - the parent picks the write target from the
   * current `selection` (part / sectionKey / elementPath) plus `scope`. */
  readonly panelChange = output<CvStylePanelChange>();
  /** Reset EVERY style override (element + section + title + document) back
   * to the active theme's baseline - the "reset all styling" action, relocated
   * here from Edit mode (Task 5). The parent wires this straight to
   * `resetAllStyles()`; unlike `panelChange`, it doesn't depend on a live
   * selection. */
  readonly resetAll = output<void>();

  /** Fired when the user clicks "Edit text". The parent routes it to
   * `CvPreviewComponent.startEditing()`, which mounts the selected element's
   * inline editor so the wording can be changed - selection alone no longer
   * enters edit mode. */
  readonly editText = output<void>();

  /** Whether the selected leaf is currently in text-edit mode - mirrored from
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
   * the Line group starts collapsed - this keeps the panel short enough that
   * the footer reset button stays reachable on small windows without
   * scrolling. */
  readonly textOpen = signal(true);
  readonly lineOpen = signal(false);

  /** Curated body leading choices (unitless). `1.45` is the existing
   * `--leading-normal`; unset (Inherit) preserves each element's baseline. */
  protected readonly lineHeightOptions: { value: number; labelKey: string }[] = [
    { value: 1.2, labelKey: 'documents.cv_style_line_height_compact' },
    { value: 1.35, labelKey: 'documents.cv_style_line_height_tight' },
    { value: 1.45, labelKey: 'documents.cv_style_line_height_normal' },
    { value: 1.6, labelKey: 'documents.cv_style_line_height_relaxed' },
  ];

  // --- What the selection is ------------------------------------------------

  readonly canEditText = computed<boolean>(() => canEditText(this.selection()));
  readonly showWordBoldHint = computed<boolean>(() => showsWordBoldHint(this.selection()));
  readonly canBold = computed<boolean>(() => canBold(this.selection()));

  private readonly fieldInfo = computed(() => selectedFieldInfo(this.selection()));
  readonly selFieldKey = computed<string>(() => this.fieldInfo()?.key ?? '');
  readonly selFieldId = computed<string>(() => this.fieldInfo()?.id ?? '');

  readonly scopeButtons = computed<{ scope: CvStyleScope; label: string }[]>(() =>
    scopeButtonsFor(this.selection(), this.t()),
  );

  /** Active scope. Resets to the default whenever the selection changes; a
   * manual switch survives subsequent edits (which mutate `style`, not
   * `selection`). The default is `scopeButtons`' first entry: `section` for a
   * title (= this title), `element` for a body leaf with an `elementPath`, and
   * `section` for a pathless body selection (a section-body wrapper with no
   * single leaf singled out) - the latter matters because `element` scope on a
   * pathless selection would land on nothing (the parent's element-scope branch
   * requires a path) and silently drop the edit. */
  readonly scope = linkedSignal<CvStyleScope>(() => this.scopeButtons()[0]?.scope ?? 'element');

  setScope(value: CvStyleScope): void {
    this.scope.set(value);
  }

  // --- What each control shows at the active scope ---------------------------

  readonly activeBodyOverride = computed<Partial<CvElementStyle>>(() =>
    bodyOverrideAt(this.style(), this.selection(), this.scope()),
  );
  readonly activeTitleOverride = computed(() =>
    titleOverrideAt(this.style(), this.selection(), this.scope()),
  );
  readonly activeTitleBorder = computed<string>(() =>
    titleBorderAt(this.style(), this.selection(), this.scope()),
  );

  /** Inline style for the "Ag" preview swatch - reflects the font/weight/colour
   * of the ACTIVE scope's override so the user previews the edit target before
   * committing. Unset properties fall through to the paper's Georgia default. */
  readonly sampleStyle = computed<Record<string, string>>(() => {
    const sel = this.selection();
    // Start from the leaf's REAL rendered style (from the paper), falling back
    // to Georgia only when the paper hasn't reported one yet.
    const css: Record<string, string> = {
      'font-family': 'Georgia, "Times New Roman", serif',
      ...this.sampleBaseStyle(),
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
   * scope (e.g. a "This section" colour showing through on a single field) -
   * previously it fell straight to the accent, so the picker read green while
   * the text was blue. Falls back to the accent only when nothing is known. */
  readonly effectiveColorHex = computed<string>(() => {
    const o =
      this.selection()?.part === 'title' ? this.activeTitleOverride() : this.activeBodyOverride();
    return o.colorHex ?? rgbToHex(this.sampleBaseStyle()['color']) ?? this.style().accentColorHex;
  });

  readonly activeTitleRuleWidth = computed<number | null>(() =>
    titleRuleWidthAt(this.style(), this.selection(), this.scope(), this.themeRule()),
  );
  readonly activeTitleRuleColor = computed<string | null>(() =>
    titleRuleColorAt(this.style(), this.selection(), this.scope(), this.themeRule()),
  );

  private readonly swatch = (value: string | null): string =>
    ruleColorSwatch(value, this.sampleBaseStyle(), this.style().accentColorHex);

  readonly titleRuleColorSwatch = computed<string>(() => this.swatch(this.activeTitleRuleColor()));
  readonly elementRuleColorSwatch = computed<string>(() =>
    this.swatch(this.activeElementRuleColor()),
  );

  readonly canBodyRule = computed<boolean>(() => showsBodyRule(this.selection(), this.scope()));
  readonly activeBodyBorder = computed<string>(() =>
    sectionBodyBorder(this.style(), this.selection()),
  );
  readonly activeBodyRuleWidth = computed<number | null>(() =>
    sectionBodyRuleWidth(this.style(), this.selection()),
  );
  readonly activeBodyRuleColor = computed<string | null>(() =>
    sectionBodyRuleColor(this.style(), this.selection()),
  );

  readonly canSeparator = computed<boolean>(() => showsSeparator(this.selection()));
  readonly activeSeparatorColor = computed<string | null>(() =>
    sectionSeparatorColor(this.style(), this.selection()),
  );
  readonly activeSeparatorSize = computed<number | null>(() =>
    sectionSeparatorSize(this.style(), this.selection()),
  );

  readonly canElementLine = computed<boolean>(() =>
    showsElementLine(this.selection(), this.scope()),
  );

  /** Whether the selection is an experience entry - the one element whose line
   * is INHERITED when unset (from its section, then the theme) rather than
   * simply absent. Drives the Inherit option, which a plain leaf must not get. */
  readonly isEntrySelection = computed<boolean>(() =>
    isExperienceEntryPath(this.selection()?.elementPath),
  );

  readonly activeElementBorder = computed<string>(() =>
    elementBorderAt(this.style(), this.selection(), this.themeEntryRule()),
  );
  readonly activeElementRuleWidth = computed<number | null>(() =>
    elementRuleWidthAt(this.style(), this.selection(), this.themeEntryRule()),
  );
  readonly activeElementRuleColor = computed<string | null>(() =>
    elementRuleColorAt(this.style(), this.selection(), this.themeEntryRule()),
  );

  /** Select model for the line style. An entry distinguishes Inherit ('') from
   * an explicit None; a plain leaf has no Inherit, so an absent line reads as
   * None there. */
  readonly elementBorderModel = computed<string>(() => {
    const b = this.activeElementBorder();
    return this.isEntrySelection() ? b : b || 'none';
  });

  /** Whether the selected leaf currently draws a line (controls whether the
   * width/colour rows are shown). */
  readonly hasElementLine = computed<boolean>(() => {
    const b = this.activeElementBorder();
    return b !== '' && b !== 'none';
  });

  // --- What each control writes ---------------------------------------------

  private emit(patch: Partial<CvElementStyle>): void {
    if (this.selection()) this.panelChange.emit({ scope: this.scope(), patch });
  }

  /** Every non-`patch` change shares this guard: a write with no live selection
   * has no target, so it is dropped rather than emitted against whatever the
   * scope happens to be. */
  private emitChange(change: Omit<CvStylePanelChange, 'scope'>): void {
    if (this.selection()) this.panelChange.emit({ scope: this.scope(), ...change });
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
    this.emitChange({ titleBorder: (value || null) as CvBorderStyle | null });
  }

  setTitleRuleWidth(value: string | number | null): void {
    this.emitChange({ titleRuleWidth: value ? +value : null });
  }
  setTitleRuleColor(value: string): void {
    this.emitChange({ titleRuleColor: value || null });
  }

  setBodyBorder(value: string): void {
    this.emitChange({ bodyBorder: (value as CvBorderStyle) || null });
  }
  setBodyRuleWidth(value: string | number | null): void {
    this.emitChange({ bodyRuleWidth: value ? +value : null });
  }
  setBodyRuleColor(value: string): void {
    this.emitChange({ bodyRuleColor: value || null });
  }

  setSeparatorColor(value: string): void {
    this.emitChange({ separatorColor: value || null });
  }
  setSeparatorSize(value: string | number | null): void {
    this.emitChange({ separatorSize: value ? +value : null });
  }

  setElementBorder(value: string): void {
    this.emit(elementBorderPatch(this.selection(), value));
  }
  setElementRuleWidth(value: string | number | null): void {
    this.emit({ ruleWidthPt: value ? +value : undefined });
  }
  setElementRuleColor(value: string): void {
    this.emit({ ruleColorHex: value || undefined });
  }

  reset(): void {
    this.emitChange({ reset: true });
  }
}

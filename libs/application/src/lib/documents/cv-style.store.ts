import { Injectable, computed, inject, signal } from '@angular/core';
import type { CvSectionKey, CvSectionStyle, CvStyle, CvTextStyle, StyleNote } from '@applye/core';
import {
  CV_STYLE_DEFAULT,
  getBuiltinTheme,
  patchCvSectionStyle,
  resetCvSectionStyle,
  themeEntryRule,
  themeStyleSeed,
  themeTitleRule,
} from '@applye/core';
import { DocumentsGateway } from '@applye/data';
import { STYLE_CHECK_DEBOUNCE_MS, dedupeStyleNotes } from './document-style-safety';

/** How long a burst of style edits settles before the ATS safety re-check runs.
 * Dragging a size slider emits on every step; the check is a round trip. */

/**
 * A CV's visual style: the document-wide `CvStyle`, the theme it sits on, and
 * the ATS safety notes the current style produces.
 *
 * **Component-scoped**, and it does not own the document row - the store that
 * does reads `style()` and `themeId()` when it assembles the save, for the same
 * reason `CvPhotoStore` returns sections rather than writing them:
 * `documentLibraryUpsert` takes a whole record, so three stores editing one CV
 * cannot each save their own slice without clobbering the others.
 *
 * **Every immutable `CvStyle` transform is a pure function in `libs/core`**
 * (`cv-style.util.ts`, `cv-style-scope.util.ts`), shared by this store's page,
 * the cover-letter editor and the live-style panel. This store owns the signal,
 * the theme baseline and the debounced safety check; a caller composes a next
 * style with those helpers and commits it through `applyStyle`.
 *
 * **Where the composition lives is now split, and the split is deliberate.**
 * Amendment five left all of it outside, on the grounds that folding it in
 * rewrote two files already over budget. Amendment sixty-four folds in the three
 * per-section transforms below and nothing else: they take a `CvSectionKey` and
 * a patch, read this store's own `style()` and commit through its own
 * `applyStyle`, so every argument they need is here and a page that called them
 * was doing this store's work through an indirection. **What stays outside is
 * what has callers this store does not serve** - the panel's scope routing
 * (`routeCvStyleChange`) and the per-element patches are composed by the panel
 * component and by the cover-letter editor, neither of which goes through this
 * store at all, and page geometry stays on the page for the same reason.
 */
@Injectable()
export class CvStyleStore {
  private readonly db = inject(DocumentsGateway);

  readonly style = signal<CvStyle>(CV_STYLE_DEFAULT);
  readonly themeId = signal<number>(1);
  readonly styleNotes = signal<StyleNote[]>([]);

  private styleCheckTimer?: ReturnType<typeof setTimeout>;

  readonly activeTheme = computed(() => getBuiltinTheme(this.themeId()));
  /** The active theme's own section-title rule - fed to the live-style panel so
   * its line size/colour controls can show the value the title renders at. */
  readonly activeThemeTitleRule = computed(() => themeTitleRule(this.activeTheme()));
  /** The theme's own rule under an experience entry head - fed to the panel for
   * the same reason as `activeThemeTitleRule`. */
  readonly activeThemeEntryRule = computed(() => themeEntryRule(this.activeTheme()));

  /** The clean baseline for the active theme: document defaults with the
   * theme's four base tokens (font/size/weight/accent) applied. "Custom" and
   * "Reset styles" are measured against THIS, not the hard-coded Classic
   * default - so a pristine Aurora doc reads as "Aurora", not "Custom", and
   * Reset returns to the selected theme. */
  readonly themeBaseStyle = computed<CvStyle>(() => ({
    ...CV_STYLE_DEFAULT,
    ...themeStyleSeed(this.activeTheme()),
  }));

  /** True when the style differs from the active theme's baseline in any way -
   * a document-wide field (body font/size/weight/colour, title style, title
   * line), a per-section override, or a per-element override. Page geometry is
   * deliberately NOT part of this comparison: `resetAllStyles` preserves the
   * current `page` rather than reseeding it, so page geometry never makes a
   * document read as "custom" here. Drives the live-style panel's "reset all
   * styling" enabled state, so it reacts to global, per-section, AND
   * per-element changes alike. A pristine doc on a theme is NOT custom. */
  readonly hasAnyCustomStyle = computed(() => {
    const s = this.style();
    const d = this.themeBaseStyle();
    const nonEmpty = (o: Record<string, unknown> | undefined): boolean =>
      !!o && Object.values(o).some((v) => v != null);
    const sectionCustom = Object.values(s.sectionStyles ?? {}).some(
      (o) =>
        o &&
        Object.values(o).some((v) =>
          v && typeof v === 'object' ? nonEmpty(v as Record<string, unknown>) : v != null,
        ),
    );
    const elementCustom = Object.values(s.elementStyles ?? {}).some((o) =>
      nonEmpty(o as Record<string, unknown> | undefined),
    );
    return (
      s.fontFamily !== d.fontFamily ||
      s.fontSizePt !== d.fontSizePt ||
      s.fontWeight !== d.fontWeight ||
      s.accentColorHex !== d.accentColorHex ||
      s.bodyColorHex !== d.bodyColorHex ||
      !!s.titleBorder ||
      s.titleRuleWidthPt != null ||
      !!s.titleRuleColorHex ||
      nonEmpty(s.titleStyle as Record<string, unknown> | undefined) ||
      sectionCustom ||
      elementCustom
    );
  });

  /** Takes the theme and style off a freshly loaded document. An absent
   * `styleJson` means the document has never been styled, so it starts on the
   * theme's own baseline. Throws on malformed JSON - the caller's load already
   * reports a document it cannot read. */
  async hydrate(themeId: number | null | undefined, styleJson: string | null | undefined) {
    const id = themeId ?? 1;
    this.themeId.set(id);
    const seed = themeStyleSeed(getBuiltinTheme(id));
    this.style.set(
      styleJson
        ? { ...CV_STYLE_DEFAULT, ...seed, ...JSON.parse(styleJson) }
        : { ...CV_STYLE_DEFAULT, ...seed },
    );
    await this.refreshStyleNotes();
  }

  /** Commits a fully-built next style and debounces the ATS safety re-check.
   * Every write below funnels through here, so there is one place the check is
   * scheduled and one place the signal is set. */
  applyStyle(next: CvStyle): void {
    this.style.set(next);
    this.scheduleStyleCheck();
  }

  updateStyle(patch: Partial<CvStyle>): void {
    this.applyStyle({ ...this.style(), ...patch });
  }

  /** Deep-merge a patch into the document-wide title style (template
   * expressions can't spread, so the merge happens here). */
  updateTitleStyle(patch: Partial<CvTextStyle>): void {
    this.updateStyle({ titleStyle: { ...(this.style().titleStyle ?? {}), ...patch } });
  }

  /** Patch one section's override. Shallow, so a nested field passed here
   * replaces its object wholesale - see `setSectionTitleStyle` for the one
   * nested field that needs merging instead. */
  setSectionStyle(key: CvSectionKey, patch: Partial<CvSectionStyle>): void {
    this.applyStyle(patchCvSectionStyle(this.style(), key, patch));
  }

  /** Deep-merge a patch into a section's title override, which
   * `setSectionStyle`'s shallow merge would otherwise replace wholesale. */
  setSectionTitleStyle(key: CvSectionKey, patch: Partial<CvTextStyle>): void {
    this.setSectionStyle(key, { title: patch });
  }

  /** Drop one section's override entirely, back to whatever the document-wide
   * style and the active theme resolve to. */
  resetSectionStyle(key: CvSectionKey): void {
    this.applyStyle(resetCvSectionStyle(this.style(), key));
  }

  /** Reset every section and the document-wide style back to the active theme's
   * baseline (not the hard-coded Classic default), keeping page geometry. */
  resetAllStyles(): void {
    this.style.set({ ...this.themeBaseStyle(), page: this.style().page });
    this.checkStyleNotesNow();
  }

  /** Switch theme: reseed the four base tokens to the theme's defaults but keep
   * the user's explicit per-section overrides, title style, title border, and
   * page geometry. */
  selectTheme(id: number): void {
    this.themeId.set(id);
    this.style.set({ ...this.style(), ...themeStyleSeed(getBuiltinTheme(id)) });
    this.checkStyleNotesNow();
  }

  private scheduleStyleCheck(): void {
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), STYLE_CHECK_DEBOUNCE_MS);
  }

  /** Theme and full-reset changes rewrite the whole style at once rather than
   * arriving as a burst, so they check immediately instead of debouncing. Any
   * pending debounced check is dropped: it would re-check a style that no
   * longer exists. */
  private checkStyleNotesNow(): void {
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  private async refreshStyleNotes(): Promise<void> {
    const notes = await this.db.checkStyleSafety(JSON.stringify(this.style()));
    this.styleNotes.set(dedupeStyleNotes(notes));
  }
}

import {
  afterRenderEffect,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  LucideAngularModule,
  Pencil,
  RefreshCw,
  Save,
  Check,
  Info,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-angular';
import type {
  CvContent,
  CvSection,
  CvSectionKey,
  CvElementStyle,
  CvSectionStyle,
  CvStyle,
  CvTemplate,
  CvTextStyle,
  DocumentLibraryItem,
  PageMargins,
  PageSettings,
  PageSize,
  PhotoPlacement,
  StyleNote,
} from '@applye/core';
import {
  CV_STYLE_DEFAULT,
  PAGE_SETTINGS_DEFAULT,
  getBuiltinTheme,
  themeEntryRule,
  themeStyleSeed,
  themeTitleRule,
} from '@applye/core';
import { CvPhotoStore } from '@applye/application';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../../core/toast/toast.service';
import { CvPreviewComponent } from './cv-preview/cv-preview.component';
import { CvLiveStylePanelComponent } from './cv-live-style-panel/cv-live-style-panel.component';
import { CvSummaryEditorComponent } from './section-editors/cv-summary-editor.component';
import { CvLanguagesEditorComponent } from './section-editors/cv-languages-editor.component';
import { CvSkillsEditorComponent } from './section-editors/cv-skills-editor.component';
import { CvEducationEditorComponent } from './section-editors/cv-education-editor.component';
import { CvExperienceEditorComponent } from './section-editors/cv-experience-editor.component';
import { CvPersonalDetailsEditorComponent } from './section-editors/cv-personal-details-editor.component';
import {
  cvFieldAtsNoteKeys,
  cvLeafText,
  type CvPreviewSelection,
  type CvStylePanelChange,
  mergeRegeneratedSection,
  normalizeCvContent,
  parseCvSkillResponse,
  patchCvDocumentBody,
  patchCvElementStyle,
  clearSectionElementOverrides,
  clearSectionEntryRuleOverrides,
  clearSectionTitleOverrides,
  patchCvSectionStyle,
  REGENERATABLE_SECTION_KEYS,
  resetCvElementStyle,
  resetCvSectionStyle,
  resolvePageSettings,
  sectionLabelKey,
} from '../cv-content.util';

/** Merges an incoming profile field into the current personal-details value,
 * ignoring empty/whitespace-only incoming values so a blank field from the
 * model never overwrites an existing value. */
export function mergePersonalField<T extends string | undefined>(
  incoming: string | null | undefined,
  current: T,
): string | T {
  return incoming && incoming.trim() ? incoming : current;
}

@Component({
  selector: 'app-cv-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    ButtonDirective,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CvPreviewComponent,
    CvLiveStylePanelComponent,
    CvSummaryEditorComponent,
    CvLanguagesEditorComponent,
    CvSkillsEditorComponent,
    CvEducationEditorComponent,
    CvExperienceEditorComponent,
    CvPersonalDetailsEditorComponent,
  ],
  templateUrl: './cv-detail.component.html',
  styleUrl: './cv-detail.component.scss',
  providers: [CvPhotoStore],
})
export class CvDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly db = inject(DbService);
  private readonly ai = inject(AiService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly appRef = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly t = this.i18n.t;

  protected readonly icons = {
    back: ArrowLeft,
    save: Save,
    regenerate: RefreshCw,
    preview: Eye,
    edit: Pencil,
    check: Check,
    info: Info,
    panelClose: PanelRightClose,
    panelOpen: PanelRightOpen,
    dragHandle: GripVertical,
    moveUp: ChevronUp,
    moveDown: ChevronDown,
    chevron: ChevronDown,
  };
  protected readonly regeneratableKeys = REGENERATABLE_SECTION_KEYS;
  protected readonly sectionLabelKey = sectionLabelKey;
  protected readonly regionTags = ['de', 'us', 'uk', 'generic'];

  readonly regionOptions = computed(() =>
    this.regionTags.map((tag) => ({
      tag,
      label: `${tag.toUpperCase()} - ${this.t()(`documents.cv_region_${tag}`)}`,
    })),
  );

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly doc = signal<DocumentLibraryItem | null>(null);
  readonly sections = signal<CvSection[]>([]);
  readonly templates = signal<CvTemplate[]>([]);

  readonly label = signal('');
  readonly regionTag = signal('generic');
  readonly isDefault = signal(false);
  /** Whether this CV shows a photo, where, and the two personal-detail fields
   * that are excluded by default. Component-scoped; the image itself is the
   * profile's. Aliased for the template, which names each of these once. */
  private readonly photo = inject(CvPhotoStore);
  readonly includePhoto = this.photo.includePhoto;
  readonly profilePhoto = this.photo.profilePhoto;
  readonly photoDataUri = this.photo.dataUri;
  readonly photoPlacement = this.photo.placement;
  readonly photoPlacementOptions = this.photo.placements;
  readonly includeBirthdate = this.photo.includeBirthdate;
  readonly includeMaritalStatus = this.photo.includeMaritalStatus;

  readonly saving = signal(false);
  readonly justSaved = signal(false);
  readonly regeneratingKey = signal<CvSectionKey | null>(null);
  readonly pullingProfile = signal(false);

  readonly atsNoteKeys = computed(() => cvFieldAtsNoteKeys(this.photo.flags(), this.regionTag()));

  readonly saveTemplateOpen = signal(false);
  readonly saveTemplateName = signal('');
  readonly savingTemplate = signal(false);

  readonly style = signal<CvStyle>(CV_STYLE_DEFAULT);
  readonly themeId = signal<number>(1);
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
  readonly styleNotes = signal<StyleNote[]>([]);
  private styleCheckTimer?: ReturnType<typeof setTimeout>;

  private static readonly STYLE_NOTE_KEYS: Record<StyleNote['kind'], string> = {
    font_ats_risk: 'documents.cv_style_note_font',
    size_out_of_range: 'documents.cv_style_note_size',
    color_readability_risk: 'documents.cv_style_note_color',
    weight_unavailable_risk: 'documents.cv_style_note_weight',
  };

  styleNoteMessage(note: StyleNote): string {
    return this.t()(CvDetailComponent.STYLE_NOTE_KEYS[note.kind]).replace('{value}', note.detail);
  }

  updateStyle(patch: Partial<CvStyle>): void {
    this.style.set({ ...this.style(), ...patch });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
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

  private async refreshStyleNotes(): Promise<void> {
    const notes = await this.db.checkStyleSafety(JSON.stringify(this.style()));
    // Global + per-section safety checks can surface the same (kind, detail)
    // more than once (e.g. a Light global weight plus overridden sections);
    // collapse duplicates so each distinct warning shows once.
    const seen = new Set<string>();
    this.styleNotes.set(
      notes.filter((n) => {
        const key = `${n.kind}|${n.detail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
  }

  /** The section/part the user has clicked in the live preview, driving the
   * contextual `CvLiveStylePanelComponent` beside the paper. Null until the
   * first selection; cleared is fine (panel shows its empty state). */
  /** Live-style panel visibility. Collapsing it hands the reclaimed width to
   * the paper, which is the whole point of the preview. */
  readonly livePanelOpen = signal(true);
  readonly liveSelection = signal<CvPreviewSelection | null>(null);

  /** Plain text of the currently-selected leaf, fed to the live-style panel's
   * "Ag" sample so it previews the real selected content. A title's text is its
   * localized section label; body leaves resolve through `cvLeafText`. */
  readonly selectedLeafText = computed<string>(() => {
    const sel = this.liveSelection();
    if (!sel) return '';
    if (sel.part === 'title') return this.t()(sectionLabelKey(sel.sectionKey));
    return cvLeafText(this.sections(), sel);
  });

  /** The live preview, so we can read the selected leaf's REAL rendered style
   * off the paper for the live-style panel's "Ag" swatch (bug: the swatch
   * showed a flat serif instead of the field's actual colour/weight/font). */
  private readonly cvPreviewCmp = viewChild(CvPreviewComponent);

  /** Rendered typography of the selected leaf, mirrored into the swatch. */
  readonly sampleResolvedStyle = signal<Record<string, string>>({});

  /** After each render, re-read the selected leaf's computed style from the
   * DOM (post-layout, so it reflects the current selection AND any just-applied
   * style edit) and push it to the swatch. Guarded by value equality so the
   * signal write doesn't loop with the render it triggers. */
  private readonly sampleStyleSync = afterRenderEffect(() => {
    // Track the inputs that change what's rendered so this re-runs on them.
    this.liveSelection();
    this.style();
    const next = this.cvPreviewCmp()?.readSelectedHostStyle() ?? {};
    if (JSON.stringify(this.sampleResolvedStyle()) !== JSON.stringify(next)) {
      this.sampleResolvedStyle.set(next);
    }
  });

  /** Per-section collapse state for the content-section accordion - session
   * only (not persisted); every section starts expanded (an empty set means
   * nothing is collapsed). */
  readonly collapsedSections = signal<Set<CvSectionKey>>(new Set());

  isSectionOpen(key: CvSectionKey): boolean {
    return !this.collapsedSections().has(key);
  }

  toggleSectionCollapse(key: CvSectionKey): void {
    const next = new Set(this.collapsedSections());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsedSections.set(next);
  }

  /** Collapse state for the "Style" card - open by default. */
  readonly styleOpen = signal(true);

  toggleStyleOpen(): void {
    this.styleOpen.set(!this.styleOpen());
  }

  setSectionStyle(key: CvSectionKey, patch: Partial<CvSectionStyle>): void {
    this.style.set(patchCvSectionStyle(this.style(), key, patch));
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  /** Deep-merge a patch into a section's title override (a nested object that
   * `setSectionStyle`'s shallow merge would otherwise replace wholesale). */
  setSectionTitleStyle(key: CvSectionKey, patch: Partial<CvTextStyle>): void {
    this.setSectionStyle(key, { title: patch });
  }

  /** Deep-merge a patch into the document-wide title style (template
   * expressions can't spread, so the merge happens here). */
  updateTitleStyle(patch: Partial<CvTextStyle>): void {
    this.updateStyle({ titleStyle: { ...(this.style().titleStyle ?? {}), ...patch } });
  }

  resetSectionStyle(key: CvSectionKey): void {
    this.style.set(resetCvSectionStyle(this.style(), key));
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  /** Immutably commits a fully-built next style and debounces the ATS safety
   * re-check - shared by the element/document-scope panel paths that don't go
   * through an existing single-target setter. */
  private applyStyle(next: CvStyle): void {
    this.style.set(next);
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
  }

  /** Routes a scope-tagged panel change to the correct write target for the
   * current live selection (see the Phase D.2 mapping table): body →
   * element/section/document; title → this-title (section) / all-titles
   * (document). No-ops when there is no active selection. */
  onStylePanelChange(change: CvStylePanelChange): void {
    const sel = this.liveSelection();
    if (!sel) return;
    if (sel.part === 'title') this.applyTitleScopeChange(sel.sectionKey, change);
    else this.applyBodyScopeChange(sel, change);
  }

  private applyTitleScopeChange(key: CvSectionKey, change: CvStylePanelChange): void {
    const allTitles = change.scope === 'document';
    if (change.reset) {
      // Clear only the title override for this scope; body/border untouched.
      if (allTitles) this.updateStyle({ titleStyle: undefined });
      else
        this.setSectionTitleStyle(key, {
          fontFamily: undefined,
          fontSizePt: undefined,
          fontWeight: undefined,
          colorHex: undefined,
        });
      return;
    }
    if (change.titleBorder !== undefined) {
      const border = change.titleBorder ?? undefined;
      if (allTitles) this.applyToAllTitles({ titleBorder: undefined }, { titleBorder: border });
      else this.setSectionStyle(key, { titleBorder: border });
      return;
    }
    if (change.titleRuleWidth !== undefined) {
      const w = change.titleRuleWidth ?? undefined;
      if (allTitles)
        this.applyToAllTitles({ titleRuleWidthPt: undefined }, { titleRuleWidthPt: w });
      else this.setSectionStyle(key, { titleRuleWidthPt: w });
      return;
    }
    if (change.titleRuleColor !== undefined) {
      const c = change.titleRuleColor ?? undefined;
      if (allTitles)
        this.applyToAllTitles({ titleRuleColorHex: undefined }, { titleRuleColorHex: c });
      else this.setSectionStyle(key, { titleRuleColorHex: c });
      return;
    }
    if (change.patch) {
      if (allTitles) {
        // Clear the SAME text properties this patch writes (font, size, weight,
        // or colour) from every section's title override, then write the new
        // document-wide value.
        const inherit = Object.fromEntries(
          Object.keys(change.patch).map((k) => [k, undefined]),
        ) as CvTextStyle;
        this.style.set(clearSectionTitleOverrides(this.style(), { title: inherit }));
        this.updateTitleStyle(change.patch);
      } else this.setSectionTitleStyle(key, change.patch);
    }
  }

  /** Writes an "all titles" (document-scope) title property. The per-section
   * overrides of that SAME property are cleared first, so a title the user
   * styled on its own adopts the new value instead of silently keeping its old
   * one - the title-layer counterpart of the `clearSectionElementOverrides`
   * step in `applyBodyScopeChange`. Sibling properties survive: only what this
   * control writes is made uniform. */
  private applyToAllTitles(inherit: Partial<CvSectionStyle>, patch: Partial<CvStyle>): void {
    this.style.set(clearSectionTitleOverrides(this.style(), inherit));
    this.updateStyle(patch);
  }

  /** Clears one rule property from every entry in a section before its
   * section-wide ("All experiences") value is written, so an entry the user
   * styled on its own adopts the new line instead of silently keeping the old.
   * The title layer's `applyToAllTitles` does the same one level up. */
  private applyToAllEntries(key: CvSectionKey, inherit: Partial<CvElementStyle>): void {
    this.style.set(clearSectionEntryRuleOverrides(this.style(), key, inherit));
  }

  private applyBodyScopeChange(sel: CvPreviewSelection, change: CvStylePanelChange): void {
    const key = sel.sectionKey;
    // Section body-rule (divider) is a section-level property - written at
    // section scope regardless of the font scope selector.
    if (change.bodyBorder !== undefined) {
      this.applyToAllEntries(key, { borderStyle: undefined });
      this.setSectionStyle(key, { bodyBorder: change.bodyBorder ?? undefined });
      return;
    }
    if (change.bodyRuleWidth !== undefined) {
      this.applyToAllEntries(key, { ruleWidthPt: undefined });
      this.setSectionStyle(key, { bodyRuleWidthPt: change.bodyRuleWidth ?? undefined });
      return;
    }
    if (change.bodyRuleColor !== undefined) {
      this.applyToAllEntries(key, { ruleColorHex: undefined });
      this.setSectionStyle(key, { bodyRuleColorHex: change.bodyRuleColor ?? undefined });
      return;
    }
    if (change.separatorColor !== undefined) {
      this.setSectionStyle(key, { separatorColorHex: change.separatorColor ?? undefined });
      return;
    }
    if (change.separatorSize !== undefined) {
      this.setSectionStyle(key, { separatorSizePt: change.separatorSize ?? undefined });
      return;
    }
    if (change.scope === 'bullets') {
      // "All achievements": the section-shared bullet style. Reset clears it by
      // merging an all-undefined patch (which `patchCvSectionStyle` drops).
      const patch: Partial<CvElementStyle> = change.reset
        ? {
            fontFamily: undefined,
            fontSizePt: undefined,
            fontWeight: undefined,
            colorHex: undefined,
            lineHeight: undefined,
          }
        : (change.patch ?? {});
      // Applying to all achievements wipes the per-bullet overrides so every
      // bullet adopts the shared value uniformly.
      if (!change.reset) this.style.set(clearSectionElementOverrides(this.style(), key, true));
      this.setSectionStyle(key, { bulletStyle: patch });
      return;
    }
    if (change.scope === 'section') {
      if (change.reset) {
        this.resetSectionStyle(key);
        return;
      }
      // Applying to the whole section (e.g. "All experiences") first wipes the
      // per-entry/field overrides in it (bullets excepted - their own scope),
      // so EVERY entry adopts the section value uniformly instead of the
      // individually-styled ones silently keeping their old colour.
      this.style.set(clearSectionElementOverrides(this.style(), key));
      this.setSectionStyle(key, change.patch ?? {});
      return;
    }
    if (change.scope === 'element') {
      const path = sel.elementPath;
      if (!path) return;
      this.applyStyle(
        change.reset
          ? resetCvElementStyle(this.style(), path)
          : patchCvElementStyle(this.style(), path, change.patch ?? {}),
      );
      return;
    }
    // document scope: reset is deferred to Task 5's global "reset all styling".
    if (change.reset) return;
    this.applyStyle(patchCvDocumentBody(this.style(), change.patch ?? {}));
  }

  /** True when the style differs from the active theme's baseline in any way -
   * a document-wide field (body font/size/weight/colour, title style, title
   * line), a per-section override, or a per-element override. Page geometry
   * is deliberately NOT part of this comparison: `resetAllStyles` preserves
   * the current `page` rather than reseeding it, so page geometry never makes
   * a document read as "custom" here. Drives the live-style panel's "reset
   * all styling" enabled state (Task 5 - the Edit-mode "Custom" badge that
   * used to read this was removed along with the document-wide style
   * groups), so it reacts to global, per-section, AND per-element changes
   * alike. A pristine doc on a theme is NOT custom (a fresh Aurora doc
   * doesn't count as "customized"). */
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

  /** Reset every section and the document-wide style back to the active
   * theme's baseline (not the hard-coded Classic default). */
  resetAllStyles(): void {
    this.style.set({ ...this.themeBaseStyle(), page: this.style().page });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  /** Switch theme: reseed the four base tokens to the theme's defaults but keep
   * the user's explicit per-section overrides, title style, title border, and
   * page geometry. */
  selectTheme(id: number): void {
    this.themeId.set(id);
    const seed = themeStyleSeed(getBuiltinTheme(id));
    this.style.set({ ...this.style(), ...seed });
    if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
    void this.refreshStyleNotes();
  }

  readonly previewMode = signal(false);

  togglePreview(): void {
    this.previewMode.set(!this.previewMode());
  }

  /**
   * WYSIWYG PDF export via the OS print dialog. Injects a `@page` rule sized
   * from the current page settings, toggles `printing-cv` on `<body>` so the
   * print stylesheet isolates `.cvpreview`, then invokes the standard DOM
   * `window.print()`. Tauri's webview plugin already overrides
   * `window.print` on macOS to route through its native print command (gated
   * by the `core:webview:allow-print` capability); on Windows/Linux the
   * webview's built-in print is used directly - no `@tauri-apps/api` import
   * is needed or available for this in the installed SDK version.
   */
  async exportPdfWysiwyg(): Promise<void> {
    // Commit any in-progress inline edit and drop every editor affordance BEFORE
    // printing: blur the focused leaf so its `(blur)` handler commits the draft,
    // then clear the live selection so the page cards render committed text with
    // no native control, caret, selection outline, or side panel. Then wait for
    // Angular to render that resting state and for the sheet to finish a fresh
    // pagination pass, so the exported PDF matches the on-screen preview exactly.
    this.commitAndCloseEditors();
    await this.nextStableFrame();
    const r = resolvePageSettings(this.style().page);
    // The @page rule supplies the REAL margins; the print stylesheet then zeroes
    // each `.page-card`'s simulated padding and lets its height be content-driven
    // (see `body.printing-cv .page-card`). This yields exact physical margins (no
    // full-bleed scaling shrinking them) and stops a card that exactly filled a
    // page from rounding over into a trailing blank page. Mirrors
    // `exportPdfWysiwyg` on `CoverLetterDetailComponent`.
    const m = r.margin;
    const rule =
      `@page { size: ${r.widthMm}mm ${r.heightMm}mm;` +
      ` margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
    let el = document.getElementById('wysiwyg-page-rule') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'wysiwyg-page-rule';
      document.head.appendChild(el);
    }
    el.textContent = rule;
    // Native macOS print (Tauri) is async: window.print() returns before the
    // page is rendered for print, so removing the class synchronously would
    // strip the print styles before the snapshot and capture the whole app.
    // Keep the class on and clear it on `afterprint`. Every `body.printing-cv`
    // rule lives inside `@media print`, so a lingering class has no on-screen
    // effect if `afterprint` never fires.
    const clearPrinting = (): void => {
      document.body.classList.remove('printing-cv');
      window.removeEventListener('afterprint', clearPrinting);
    };
    window.addEventListener('afterprint', clearPrinting);
    document.body.classList.add('printing-cv');
    window.print();
  }

  /** Blur the focused inline editor - firing its `(blur)` handler, which commits
   * the draft if it changed - and clear the live selection so all inline editor
   * chrome unmounts and the page cards fall back to committed text. */
  private commitAndCloseEditors(): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.liveSelection.set(null);
  }

  /** Resolve once Angular has applied pending signal changes and the paginated
   * sheet has re-measured/repaginated. `tick()` flushes CD synchronously (the
   * app is zoneless); two animation frames then bracket the sheet's
   * measure-in-a-microtask + repaginate. Falls back to a microtask where rAF is
   * unavailable (unit tests). */
  private nextStableFrame(): Promise<void> {
    this.appRef.tick();
    if (typeof requestAnimationFrame === 'undefined') return Promise.resolve();
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  /**
   * Direct OS/browser print (Cmd/Ctrl+P), bypassing the Export button. Drop the
   * live selection so every inline editor unmounts and the page cards render
   * their last-committed canonical text - the uncommitted draft and its native
   * control never reach the print snapshot. Unlike the Export action this does
   * NOT commit the draft (a raw Cmd+P should not silently persist a half-typed
   * edit). `tick()` performs the swap synchronously, before the browser captures
   * the page (zoneless CD is otherwise async and would miss the snapshot). */
  private readonly handleBeforePrint = (): void => {
    if (!this.previewMode() || this.liveSelection() === null) return;
    this.liveSelection.set(null);
    this.appRef.tick();
  };

  constructor() {
    window.addEventListener('beforeprint', this.handleBeforePrint);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('beforeprint', this.handleBeforePrint),
    );
    void this.load();
  }

  private personalDetailsSection(): Extract<CvSection, { key: 'personal_details' }> | undefined {
    return this.sections().find(
      (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
    );
  }

  async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading.set(true);
    this.loadError.set(false);
    try {
      // The photo itself lives on the profile now, and its store reads it: this
      // document only decides whether to show it and where.
      const [item, templates] = await Promise.all([
        this.db.documentLibraryGet(id),
        this.db.cvTemplatesList(),
        this.photo.loadProfilePhoto(),
      ]);
      if (!item) {
        this.loadError.set(true);
        return;
      }
      this.doc.set(item);
      this.templates.set(templates);
      this.label.set(item.label ?? '');
      this.regionTag.set(item.regionTag ?? 'generic');
      this.isDefault.set(item.isDefault);
      // Opened from the apply wizard's "Review CV": show the rendered result
      // first, not the raw section editor. The user can toggle to Edit.
      if (this.route.snapshot.queryParamMap.get('preview') === '1') {
        this.previewMode.set(true);
      }

      const raw: CvContent = item.contentJson ? JSON.parse(item.contentJson) : { sections: [] };
      const content = normalizeCvContent(raw);
      const ordered = [...content.sections].sort((a, b) => a.order - b.order);
      this.sections.set(ordered);

      this.photo.hydrate(ordered);

      const themeId = item.themeId ?? 1;
      this.themeId.set(themeId);
      const seed = themeStyleSeed(getBuiltinTheme(themeId));
      const style: CvStyle = item.styleJson
        ? { ...CV_STYLE_DEFAULT, ...seed, ...JSON.parse(item.styleJson) }
        : { ...CV_STYLE_DEFAULT, ...seed };
      this.style.set(style);
      await this.refreshStyleNotes();
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  back(): void {
    if (this.shouldReturnToApplyWizard()) {
      void this.returnToApplyWizard(false);
      return;
    }
    const jobId = this.returnJobId();
    if (jobId) {
      void this.router.navigate(['/jobs', jobId]);
      return;
    }
    void this.router.navigate(['/documents']);
  }

  /** Label for the back button: the job it returns to, or plain "Documents". */
  backLabel(): string {
    const jobLabel = this.route.snapshot.queryParamMap.get('jobLabel');
    return this.returnJobId() && jobLabel
      ? this.t()('documents.cv_back_to_job').replace('{job}', jobLabel)
      : this.t()('documents.cv_back_to_documents');
  }

  private shouldReturnToApplyWizard(): boolean {
    return this.route.snapshot.queryParamMap.get('returnTo') === 'applyWizard';
  }

  /** Job id to return to when opened from My Jobs (returnTo=myJobs), else null. */
  private returnJobId(): string | null {
    const params = this.route.snapshot.queryParamMap;
    return params.get('returnTo') === 'myJobs' ? params.get('jobId') : null;
  }

  private returnToApplyWizard(documentSaved: boolean): Promise<boolean> {
    const params = this.route.snapshot.queryParamMap;
    const jobId = params.get('jobId');
    if (!jobId) return this.router.navigate(['/documents']);
    return this.router.navigate(['/jobs', jobId], {
      queryParams: {
        returnTo: 'applyWizard',
        wizardStep: 'documents',
        documentType: 'cv',
        documentId: this.doc()?.id ?? params.get('documentId'),
        reviewHash: params.get('reviewHash'),
        documentSaved: documentSaved ? '1' : '0',
      },
    });
  }

  /** Header sections whose position is fixed - they carry the document's
   *  identity (photo + personal details) and must stay pinned to the top,
   *  so reordering (drag or move buttons) is disabled for them. */
  private static readonly LOCKED_SECTION_KEYS: readonly CvSectionKey[] = [
    'photo',
    'personal_details',
  ];

  isSectionLocked(key: CvSectionKey): boolean {
    return CvDetailComponent.LOCKED_SECTION_KEYS.includes(key);
  }

  /** Pins the locked header sections to the top in their canonical order
   *  (photo, then personal_details), leaving the rest in their given order,
   *  then reassigns the `order` index. Guarantees a reorder can never move a
   *  locked section or push another section above it. */
  private pinLockedSections(list: CvSection[]): CvSection[] {
    const locked = CvDetailComponent.LOCKED_SECTION_KEYS.map((k) =>
      list.find((s) => s.key === k),
    ).filter((s): s is CvSection => !!s);
    const rest = list.filter((s) => !this.isSectionLocked(s.key));
    return [...locked, ...rest].map((s, index) => ({ ...s, order: index }));
  }

  drop(event: CdkDragDrop<CvSection[]>): void {
    const list = this.sections().slice();
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.sections.set(this.pinLockedSections(list));
  }

  private moveSection(key: CvSectionKey, offset: -1 | 1): void {
    if (this.isSectionLocked(key)) return;
    const list = this.sections().slice();
    const index = list.findIndex((s) => s.key === key);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= list.length) return;
    // Never swap a movable section past a locked header section.
    if (this.isSectionLocked(list[target].key)) return;
    moveItemInArray(list, index, target);
    this.sections.set(this.pinLockedSections(list));
  }

  moveSectionUp(key: CvSectionKey): void {
    this.moveSection(key, -1);
  }

  moveSectionDown(key: CvSectionKey): void {
    this.moveSection(key, 1);
  }

  /** Swaps a single section by key with a new immutable value - the sink for
   * extracted section-editor children's `(sectionChange)` output (e.g.
   * `CvSummaryEditorComponent`, `CvLanguagesEditorComponent`). */
  replaceSection(updated: CvSection): void {
    this.sections.update((list) => list.map((s) => (s.key === updated.key ? updated : s)));
  }

  async regenerateSection(key: CvSectionKey): Promise<void> {
    if (this.regeneratingKey()) return;
    const doc = this.doc();
    if (!doc) return;
    this.regeneratingKey.set(key);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new Error(this.t()('documents.cv_generate_no_profile'));

      const language = doc.language ?? settings.defaultDocLanguage ?? 'en';
      const regionTag = this.regionTag();
      const archetypeTag = doc.archetypeTag ?? 'generalist';

      const hashInput = [profile.fullMd, regionTag, archetypeTag, language, key].join('|');
      const sourceHash = await this.db.hashText(hashInput);
      const current = this.sections().find((s) => s.key === key);
      if (current?.sourceHash === sourceHash) {
        return;
      }

      const rendered = await this.ai.renderSkill('cv-generate-baseline', {
        profile_md: profile.fullMd,
        scoring_json: profile.scoringJson ?? '{}',
        region_tag: regionTag,
        archetype_tag: archetypeTag,
        language,
        section: key,
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });
      const parsed = parseCvSkillResponse(res.text);
      const updated = mergeRegeneratedSection(
        { sections: this.sections() },
        key,
        parsed,
        sourceHash,
      );
      this.sections.set(updated.sections);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.regeneratingKey.set(null);
    }
  }

  async pullFromProfile(): Promise<void> {
    if (this.pullingProfile()) return;
    const personal = this.personalDetailsSection();
    if (!personal) return;
    this.pullingProfile.set(true);
    try {
      const [profile, settings] = await Promise.all([this.db.getProfile(), this.db.getSettings()]);
      if (!profile?.fullMd) throw new Error(this.t()('documents.cv_generate_no_profile'));
      const language = this.doc()?.language ?? settings.defaultDocLanguage ?? 'en';
      const rendered = await this.ai.renderSkill('cv-generate-baseline', {
        profile_md: profile.fullMd,
        scoring_json: profile.scoringJson ?? '{}',
        region_tag: this.regionTag(),
        archetype_tag: this.doc()?.archetypeTag ?? 'generalist',
        language,
        section: 'personalDetails',
      });
      const res = await this.ai.run({
        mode: settings.aiMode,
        provider: settings.provider,
        model: settings.defaultModel,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        language,
        maxTokens: 8192,
      });
      const parsed = parseCvSkillResponse(res.text);
      const p = parsed.personalDetails;
      personal.fullName = mergePersonalField(p.fullName, personal.fullName);
      personal.title = mergePersonalField(p.title, personal.title);
      personal.email = mergePersonalField(p.email, personal.email);
      personal.phone = mergePersonalField(p.phone, personal.phone);
      personal.address = mergePersonalField(p.address, personal.address);
      personal.website = mergePersonalField(p.website, personal.website);
      personal.linkedin = mergePersonalField(p.linkedin, personal.linkedin);
      this.sections.set([...this.sections()]);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.pullingProfile.set(false);
    }
  }

  /** Opens the profile, where the one reusable photo is uploaded and cropped. */
  goToProfilePhoto(): void {
    void this.router.navigate(['/profile']);
  }

  setPhotoPlacement(placement: PhotoPlacement): void {
    this.photo.setPlacement(placement);
  }

  /** Toggles the "Include photo" chip. The store decides what the section list
   * must become, because switching the photo on has to create one. */
  toggleIncludePhoto(): void {
    this.sections.set(this.photo.toggleIncludePhoto(this.sections()));
  }

  async save(): Promise<void> {
    const doc = this.doc();
    if (!doc || this.saving()) return;
    this.saving.set(true);
    try {
      const sections = this.photo.sectionsForSave(this.sections());
      this.sections.set(sections);

      if (this.isDefault()) {
        const siblings = await this.db.documentLibraryList('cv');
        for (const sibling of siblings) {
          if (
            sibling.id !== doc.id &&
            sibling.isDefault &&
            sibling.regionTag === this.regionTag()
          ) {
            await this.db.documentLibraryUpsert({ ...sibling, id: sibling.id, isDefault: false });
          }
        }
      }

      const saved = await this.db.documentLibraryUpsert({
        id: doc.id,
        docType: 'cv',
        source: doc.source,
        label: this.label(),
        contentJson: JSON.stringify({ sections }),
        templateId: doc.templateId,
        styleJson: JSON.stringify(this.style()),
        themeId: this.themeId(),
        regionTag: this.regionTag(),
        language: doc.language,
        archetypeTag: doc.archetypeTag,
        isDefault: this.isDefault(),
        inputHash: doc.inputHash,
        modelUsed: doc.modelUsed,
        tokensInput: doc.tokensInput,
        tokensOutput: doc.tokensOutput,
      });
      this.doc.set(saved);
      this.justSaved.set(true);
      this.toast.success(this.t()('documents.cv_saved'));
      if (this.shouldReturnToApplyWizard()) {
        await this.returnToApplyWizard(true);
        return;
      }
      setTimeout(() => this.justSaved.set(false), 2500);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.saving.set(false);
    }
  }

  openSaveTemplate(): void {
    this.saveTemplateName.set('');
    this.saveTemplateOpen.set(true);
  }

  cancelSaveTemplate(): void {
    this.saveTemplateOpen.set(false);
  }

  async confirmSaveTemplate(): Promise<void> {
    if (!this.saveTemplateName().trim() || this.savingTemplate()) return;
    this.savingTemplate.set(true);
    try {
      const orderedKeys = this.sections()
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => s.key);
      await this.db.cvTemplateUpsert({
        name: this.saveTemplateName().trim(),
        regionTag: this.regionTag(),
        sectionsJson: JSON.stringify(orderedKeys),
        includePhoto: this.photo.includePhoto(),
        includeBirthdate: this.photo.includeBirthdate(),
        includeMaritalStatus: this.photo.includeMaritalStatus(),
      });
      this.templates.set(await this.db.cvTemplatesList());
      this.saveTemplateOpen.set(false);
      this.toast.success(this.t()('documents.cv_template_saved'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.savingTemplate.set(false);
    }
  }
}

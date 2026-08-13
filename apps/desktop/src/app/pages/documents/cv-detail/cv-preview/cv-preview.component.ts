import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { CvPreviewEditingService } from './cv-preview-editing.service';
import { CvPreviewStyleService } from './cv-preview-style.service';
import { CvPreviewSelectionService, type CvLeafFieldKey } from './cv-preview-selection.service';
import { CvPreviewEditModeService } from './cv-preview-edit-mode.service';
import { CvPreviewHeaderComponent } from './cv-preview-header/cv-preview-header.component';
import { buildCvAtoms } from './cv-preview-atoms';
import type {
  CvExperienceSection,
  CvSection,
  CvSectionKey,
  CvStyle,
  CvSummarySection,
  CvTextRun,
  PhotoPlacement,
} from '@applye/core';
import {
  getBuiltinTheme,
  leafPath,
  orderedVisibleSections,
  parseInlineEmphasis,
  replaceExperienceBullet,
  resolvePageSettings,
  sectionLabelKey,
  themeCssVars,
  toggleWordBold,
  type CvPreviewSelection,
  visiblePersonalContactFields,
  wordTokens,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { PaginatedSheetComponent, type SheetAtom, type SheetGeometry } from '@applye/ui';

/**
 * Presentational live preview for the CV editor: the paginated page-card
 * sheet, its 8 atom templates, and the pure styling resolvers they depend on.
 * Behavior-preserving extraction from `CvDetailComponent` - no visual or
 * pagination change. `sections`/`style`/`themeId`/photo state stay owned by
 * the parent (source of truth); this component only renders them and shows
 * its own overflow warning.
 */
@Component({
  selector: 'app-cv-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, PaginatedSheetComponent, CvPreviewHeaderComponent],
  templateUrl: './cv-preview.component.html',
  styleUrl: './cv-preview.component.scss',
  // Component-scoped: an in-progress draft belongs to this preview and must
  // not outlive it.
  providers: [
    CvPreviewEditingService,
    CvPreviewStyleService,
    CvPreviewSelectionService,
    CvPreviewEditModeService,
  ],
})
export class CvPreviewComponent {
  /** Drafting and committing; the component keeps only the question of which
   * editor is on screen. Bound below so commits reach `sectionChange`. */
  protected readonly edit = inject(CvPreviewEditingService);
  /** Every `[ngStyle]` map the template asks for; bound to this component's
   * inputs below. Named short because the template calls it 57 times and the
   * bindings have to stay inside 100 columns. */
  protected readonly css = inject(CvPreviewStyleService);
  /** Who is selected, and whether a render may offer selection at all. Public
   * so an atom template's future child component can inject the SAME instance
   * through its declaration injector instead of threading the protocol through
   * inputs (ADR-0005, level three). This component's own template still reaches
   * it through the one-line delegators below. */
  readonly sel = inject(CvPreviewSelectionService);
  /** Whether the selected leaf's inline editor is mounted, and where focus goes
   * when that changes. Public for the same reason as `sel`. */
  readonly mode = inject(CvPreviewEditModeService);

  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly sections = input.required<CvSection[]>();
  readonly style = input.required<CvStyle>();
  readonly themeId = input.required<number>();
  readonly includePhoto = input.required<boolean>();
  readonly photoDataUri = input.required<string | null>();
  readonly photoPlacement = input.required<PhotoPlacement>();
  /** Forwarded to `<app-cv-preview-header>`, which builds the contact line.
   * Required rather than optional: without them the birthdate and
   * marital-status fields would silently drop out of that line. */
  readonly includeBirthdate = input.required<boolean>();
  readonly includeMaritalStatus = input.required<boolean>();

  /** When true, visible page-card atoms expose click-to-select affordances for
   * the contextual live-style panel. Measurement atoms are never interactive
   * regardless - the render-mode gate below keeps the measure pass inert. */
  readonly interactive = input(false);
  /** The section/part the parent currently has selected - drives the selected
   * outline. The parent owns this signal; the preview only reports changes. */
  readonly selection = input<CvPreviewSelection | null>(null);
  /** Emitted when the user clicks a selectable body/title target (page pass
   * only). */
  readonly selectionChange = output<CvPreviewSelection | null>();
  /** Immutable section-change sink for inline content edits - emitted once per
   * committed leaf edit (see `commitSummary`/`commitPersonalField`). */
  readonly sectionChange = output<CvSection>();

  // Selection lives in `CvPreviewSelectionService`. These delegators exist so
  // the remaining call sites in `cv-preview.component.html` keep their
  // unprefixed names: adding `sel.` to each would push bindings past 100
  // columns, and prettier's reflow would GROW the template. **Each one dies
  // with the last atom block that calls it** - `isSectionSelected` and the
  // `buildContactLine` re-export went with the header, and the header's child
  // reaches the services by injection instead.

  selectable(renderMode: unknown): boolean {
    return this.sel.selectable(renderMode);
  }

  isSelected(sectionKey: CvSectionKey, part: 'body' | 'title'): boolean {
    return this.sel.isSelected(sectionKey, part);
  }

  isElementSelected(path: string): boolean {
    return this.sel.isElementSelected(path);
  }

  selectPart(
    sectionKey: CvSectionKey,
    part: 'body' | 'title',
    renderMode: unknown,
    event?: Event,
    elementPath?: string,
  ): void {
    this.sel.selectPart(sectionKey, part, renderMode, event, elementPath);
  }

  selectLeaf(sectionKey: CvSectionKey, path: string, renderMode: unknown, event?: Event): void {
    this.sel.selectLeaf(sectionKey, path, renderMode, event);
  }

  onSelectKey(
    event: Event,
    sectionKey: CvSectionKey,
    part: 'body' | 'title',
    renderMode: unknown,
    elementPath?: string,
  ): void {
    this.sel.onSelectKey(event, sectionKey, part, renderMode, elementPath);
  }

  selectAriaLabel(sectionKey: CvSectionKey, part: 'body' | 'title'): string {
    return this.sel.selectAriaLabel(sectionKey, part);
  }

  leafAriaLabel(sectionKey: CvSectionKey, field: CvLeafFieldKey): string {
    return this.sel.leafAriaLabel(sectionKey, field);
  }

  constructor() {
    this.edit.bind((section) => this.sectionChange.emit(section));
    this.css.bind({
      style: this.style,
      selection: this.selection,
      theme: this.activeTheme,
      host: () => this.el.nativeElement,
    });
    this.sel.bind({
      selection: this.selection,
      interactive: this.interactive,
      t: this.t,
      emit: (next) => this.selectionChange.emit(next),
    });
    this.mode.bind({
      selection: this.selection,
      interactive: this.interactive,
      host: () => this.el.nativeElement,
    });
  }

  // Edit mode and editor focus live in `CvPreviewEditModeService`. Delegators,
  // for the same reason as the selection ones above - and `editing` is read by
  // `cv-detail` through this component, so it keeps its name here regardless.

  get editing() {
    return this.mode.editing;
  }

  isEditingLeaf(path: string): boolean {
    return this.mode.isEditingLeaf(path);
  }

  startEditing(): void {
    this.mode.startEditing();
  }

  finishLeafEdit(el: HTMLElement, sectionKey: CvSectionKey, part: 'body' | 'title'): void {
    this.mode.finishLeafEdit(el, sectionKey, part);
  }

  /** The host listener has to live on the component - a service cannot carry
   * one - but the decision of whether a given click is empty space is the
   * selection service's (see `clearOnBackgroundClick`). */
  @HostListener('click', ['$event'])
  onBackgroundClick(event: Event): void {
    this.sel.clearOnBackgroundClick(event);
  }

  protected readonly sectionLabelKey = sectionLabelKey;
  protected readonly visiblePersonalContactFields = visiblePersonalContactFields;
  /** Exposed for the template - see `leafPath`'s doc for why every leaf-id
   * template literal now goes through this single builder instead of a raw
   * string, so `leafDraft`'s draft key and `selectLeaf`/`selectPart`'s
   * emitted `elementPath` can never drift apart. */
  protected readonly leafPath = leafPath;
  /** Whether the currently-EDITING leaf supports `**bold**` - the summary body
   * and experience bullets are the only markdown-backed editors. Drives the
   * live-style panel's Bold button (the inline "B" was removed in favour of a
   * panel control), so it only appears where bold actually applies. */
  canBoldActiveEditor(): boolean {
    const p = this.editing() ? this.selection()?.elementPath : undefined;
    return !!p && (p === 'summary' || p.split('.').includes('bullet'));
  }

  /** Apply `**bold**` to the active inline editor's current selection, driven
   * by the live-style panel's Bold button. Locates the mounted textarea on the
   * visible page (never the hidden measurement pass) and routes to the same
   * summary/bullet bold helper the removed inline "B" button used. */
  applyBoldToActiveEditor(): void {
    const sel = this.selection();
    if (!sel?.elementPath) return;
    const nodes = this.el.nativeElement.querySelectorAll<HTMLTextAreaElement>(
      'textarea.cvpreview__leaf-editor',
    );
    const el = Array.from(nodes).find((n) => !n.closest('.paginated-sheet__measure'));
    if (!el) return;
    const seg = sel.elementPath.split('.');
    if (seg[0] === 'summary') {
      const s = this.sections().find((x) => x.key === 'summary') as CvSummarySection | undefined;
      this.edit.applySummaryBold(el, s?.text ?? '');
    } else if (seg[0] === 'exp' && seg[2] === 'bullet') {
      const i = Number(seg[1]);
      const b = Number(seg[3]);
      const s = this.sections().find((x) => x.key === sel.sectionKey) as
        CvExperienceSection | undefined;
      this.edit.applyBulletBold(el, i, b, s?.entries[i]?.bullets?.[b] ?? '');
    }
  }

  readonly activeTheme = computed(() => getBuiltinTheme(this.themeId()));

  /** Theme custom properties for the preview viewport; inherited by all page cards. */
  readonly themeVars = computed<Record<string, string>>(() => themeCssVars(this.activeTheme()));

  /** px per mm at 96dpi - fixes the on-screen sheet to real page proportions. */
  private static readonly PX_PER_MM = 96 / 25.4;

  /** Preview page geometry (px) - real A4/Letter proportions plus margins,
   * consumed by `<lib-paginated-sheet>`, which owns pagination/measurement. */
  readonly geometry = computed<SheetGeometry>(() => {
    const r = resolvePageSettings(this.style().page);
    const px = CvPreviewComponent.PX_PER_MM;
    return {
      pageWidthPx: r.widthMm * px,
      pageHeightPx: r.heightMm * px,
      marginTopPx: r.margin.top * px,
      marginRightPx: r.margin.right * px,
      marginBottomPx: r.margin.bottom * px,
      marginLeftPx: r.margin.left * px,
    };
  });

  /** True when any single atom is taller than one usable page - set from
   * `<lib-paginated-sheet>`'s `(blockOverflow)` output. Drives this component's
   * own overflow warning; the parent no longer mirrors it. */
  protected readonly overflow = signal(false);

  protected onBlockOverflow(value: boolean): void {
    this.overflow.set(value);
  }

  // Atom templates for the paginated sheet - declared in the HTML (`#headerTpl` etc).
  readonly headerTpl = viewChild.required<TemplateRef<unknown>>('headerTpl');
  readonly summaryTpl = viewChild.required<TemplateRef<unknown>>('summaryTpl');
  readonly sectionTitleTpl = viewChild.required<TemplateRef<unknown>>('sectionTitleTpl');
  readonly skillsTpl = viewChild.required<TemplateRef<unknown>>('skillsTpl');
  readonly expHeadTpl = viewChild.required<TemplateRef<unknown>>('expHeadTpl');
  readonly expBulletTpl = viewChild.required<TemplateRef<unknown>>('expBulletTpl');
  readonly eduEntryTpl = viewChild.required<TemplateRef<unknown>>('eduEntryTpl');
  readonly languagesTpl = viewChild.required<TemplateRef<unknown>>('languagesTpl');

  /** Ordered, visible sections as they'd actually render - the photo
   * toggle isn't written back into `section.visible` until Save, so this
   * mirrors the live toggle state rather than trusting the stored value. */
  readonly previewSections = computed(() => {
    const live = this.sections().map((s) =>
      s.key === 'photo' ? { ...s, visible: this.includePhoto() } : s,
    );
    return orderedVisibleSections(live);
  });

  /** Flattened page atoms for `<lib-paginated-sheet>`; the flattening itself
   * is a pure function so it can be asserted without mounting the preview. */
  readonly atoms = computed<SheetAtom[]>(() =>
    buildCvAtoms({
      sections: this.previewSections(),
      includePhoto: this.includePhoto(),
      photoDataUri: this.photoDataUri(),
      photoPlacement: this.photoPlacement(),
      t: this.t(),
      tpl: {
        headerTpl: this.headerTpl(),
        summaryTpl: this.summaryTpl(),
        sectionTitleTpl: this.sectionTitleTpl(),
        skillsTpl: this.skillsTpl(),
        expHeadTpl: this.expHeadTpl(),
        expBulletTpl: this.expBulletTpl(),
        eduEntryTpl: this.eduEntryTpl(),
        languagesTpl: this.languagesTpl(),
      },
    }),
  );

  /** `t()` has no interpolation support (see `TranslateService.t`), so page
   * captions substitute `{i}`/`{n}` manually - same pattern as
   * `styleNoteMessage`'s `{value}` substitution in the parent. */
  readonly captionFn = (page: number, total: number): string =>
    this.t()('documents.preview_page_of')
      .replace('{i}', String(page))
      .replace('{n}', String(total));

  runs(text: string): CvTextRun[] {
    return parseInlineEmphasis(text);
  }

  /** Exposed for the template: split a summary/bullet line into clickable word
   * tokens (see `wordTokens`). Rendered only for the SELECTED body leaf, so
   * clicking a word toggles its bold. */
  protected readonly wordTokens = wordTokens;

  /** Toggle bold for one word of the summary body - click-a-word-on-the-paper
   * (design). Emits a new immutable summary section with the rewritten
   * `**markdown**` text (export-safe, same model the resting render reads). */
  toggleSummaryWord(section: CvSummarySection, wordIndex: number, event: Event): void {
    event.stopPropagation();
    this.sectionChange.emit({ ...section, text: toggleWordBold(section.text, wordIndex) });
  }

  /** Toggle bold for one word of an experience bullet - click-a-word (design).
   * Emits a new immutable `CvExperienceSection` touching only that bullet. */
  toggleBulletWord(
    section: CvExperienceSection,
    entryIndex: number,
    bulletIndex: number,
    wordIndex: number,
    event: Event,
  ): void {
    event.stopPropagation();
    const bullet = section.entries[entryIndex]?.bullets?.[bulletIndex] ?? '';
    this.sectionChange.emit(
      replaceExperienceBullet(section, entryIndex, bulletIndex, toggleWordBold(bullet, wordIndex)),
    );
  }

  leafChipLabel(field: CvLeafFieldKey): string {
    return this.sel.leafChipLabel(field);
  }

  partChipLabel(part: 'body' | 'title'): string {
    return this.sel.partChipLabel(part);
  }

  /** `cv-detail` samples the selected host's resolved style through this
   * component, so the contract stays here even though the measurement moved. */
  readSelectedHostStyle(): Record<string, string> | null {
    return this.css.readSelectedHostStyle();
  }
}

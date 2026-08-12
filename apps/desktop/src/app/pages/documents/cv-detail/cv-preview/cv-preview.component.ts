import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { CvPreviewEditingService } from './cv-preview-editing.service';
import { CvPreviewStyleService } from './cv-preview-style.service';
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
  buildContactLine,
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

/** Field key for a per-leaf accessible-name suffix (Task 6 a11y hardening,
 * review minor T2): every per-leaf selectable host - one with its own
 * distinct `elementPath`, e.g. an experience entry's company/industry/
 * location/role or a skill group's label/values - previously reused the
 * generic `selectAriaLabel(key, 'body')` name for every field in the same
 * section, so a screen reader announced "Experience - Body text" for company,
 * industry, location, AND role alike. `leafAriaLabel` composes the section
 * label with a field-specific label instead, reusing the SAME i18n field
 * labels already shown in the Edit-mode section editors (`cv_field_company`,
 * `cv_field_role`, …) rather than minting parallel strings. Hosts with no
 * single leaf singled out (the whole-entry/whole-row/whole-body wrapper,
 * which never carries an `elementPath`) keep the generic `selectAriaLabel`
 * name - there is nothing to disambiguate there. */
export type CvLeafFieldKey =
  | 'fullName'
  | 'title'
  | 'company'
  | 'industry'
  | 'location'
  | 'role'
  | 'startDate'
  | 'endDate'
  | 'contact'
  | 'degree'
  | 'institution'
  | 'bullet'
  | 'skillLabel'
  | 'skillValues'
  | 'language';

const LEAF_FIELD_LABEL_KEYS: Record<CvLeafFieldKey, string> = {
  fullName: 'documents.cv_field_full_name',
  title: 'documents.cv_field_title',
  company: 'documents.cv_field_company',
  industry: 'documents.cv_field_industry',
  location: 'documents.cv_field_location',
  role: 'documents.cv_field_role',
  startDate: 'documents.cv_field_start_date',
  endDate: 'documents.cv_field_end_date',
  contact: 'documents.cv_field_contact',
  degree: 'documents.cv_field_degree',
  institution: 'documents.cv_field_institution',
  bullet: 'documents.cv_field_bullet',
  skillLabel: 'documents.cv_field_label',
  skillValues: 'documents.cv_field_values',
  language: 'documents.cv_field_language',
};

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
  imports: [NgStyle, PaginatedSheetComponent],
  templateUrl: './cv-preview.component.html',
  styleUrl: './cv-preview.component.scss',
  // Component-scoped: an in-progress draft belongs to this preview and must
  // not outlive it.
  providers: [CvPreviewEditingService, CvPreviewStyleService],
})
export class CvPreviewComponent {
  /** Drafting and committing; the component keeps only the question of which
   * editor is on screen. Bound below so commits reach `sectionChange`. */
  protected readonly edit = inject(CvPreviewEditingService);
  /** Every `[ngStyle]` map the template asks for; bound to this component's
   * inputs below. Named short because the template calls it 57 times and the
   * bindings have to stay inside 100 columns. */
  protected readonly css = inject(CvPreviewStyleService);

  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly sections = input.required<CvSection[]>();
  readonly style = input.required<CvStyle>();
  readonly themeId = input.required<number>();
  readonly includePhoto = input.required<boolean>();
  readonly photoDataUri = input.required<string | null>();
  readonly photoPlacement = input.required<PhotoPlacement>();
  /** Drives `buildContactLine`'s optional fields in `#headerTpl` - not in the
   * original task brief's input list, but required: the header atom template
   * (moved verbatim) reads these two signals directly. Without them the
   * contact line's birthdate/marital-status inclusion would silently break. */
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

  /** True only for a visible page-card render while interactive - the single
   * gate every atom template uses so the hidden measurement pass (`'measure'`)
   * never gains a role, tabindex, cursor, or click handler. */
  selectable(renderMode: unknown): boolean {
    return this.interactive() && renderMode === 'page';
  }

  isSelected(sectionKey: CvSectionKey, part: 'body' | 'title'): boolean {
    const s = this.selection();
    return !!s && s.sectionKey === sectionKey && s.part === part;
  }

  /** True when the WHOLE section body is the selection - i.e. its body is
   * selected with no specific leaf (`elementPath`) singled out. Drives the
   * section-wrapper highlight + chip so selecting a group (e.g. the personal-
   * details block or an experience entry) reads the same as selecting a single
   * field. Kept distinct from `isSelected(key,'body')`, which stays true even
   * when a leaf inside the section is the actual target. */
  isSectionSelected(sectionKey: CvSectionKey): boolean {
    const s = this.selection();
    return !!s && s.sectionKey === sectionKey && s.part === 'body' && !s.elementPath;
  }

  /** Element-scope highlight: true when `path` is the specific leaf the
   * current selection targets (`elementPath`) - distinct from `isSelected`,
   * which only tracks section+part. `path` is the same transient draft-id
   * string passed to `leafDraft` for that leaf (see `CvPreviewSelection`),
   * so callers never need a separate lookup table to know "is this the
   * element the live-style panel is scoped to". */
  isElementSelected(path: string): boolean {
    return this.selection()?.elementPath === path;
  }

  /** True only when `next` differs from the current selection in
   * `sectionKey`, `part`, or `elementPath` - the shared guard behind both
   * `selectPart` and `selectLeaf` (see their docs for why re-emitting an
   * identical selection must be avoided). */
  private isNewSelection(next: CvPreviewSelection): boolean {
    const s = this.selection();
    return (
      !s ||
      s.sectionKey !== next.sectionKey ||
      s.part !== next.part ||
      s.elementPath !== next.elementPath
    );
  }

  /** Emit a semantic selection for a clicked target - a no-op unless this is a
   * selectable page render, so the inert measurement pass can never emit.
   * Also a no-op (after stopping propagation) when the requested region is
   * already the current selection: re-emitting an identical-but-new
   * selection object would still change the `selection` signal's reference,
   * re-running the focus effect and yanking focus back to the section's
   * first leaf editor - stealing it from whatever leaf inside the same
   * section the user actually clicked (e.g. a bullet nested under an
   * already-selected experience entry).
   *
   * `elementPath` is optional and additive (Phase D.2): passing it targets a
   * single body leaf as the style-scope while still gating content editors
   * at the section+part level (`isSelected` ignores it). Only ever pass it
   * alongside `part: 'body'` - a title selection has no element scope. */
  selectPart(
    sectionKey: CvSectionKey,
    part: 'body' | 'title',
    renderMode: unknown,
    event?: Event,
    elementPath?: string,
  ): void {
    if (!this.selectable(renderMode)) return;
    event?.stopPropagation();
    const next: CvPreviewSelection =
      elementPath !== undefined ? { sectionKey, part, elementPath } : { sectionKey, part };
    if (!this.isNewSelection(next)) return;
    this.selectionChange.emit(next);
  }

  /** Selects one specific body leaf - a thin wrapper over `selectPart` that
   * always targets `part: 'body'` and stops the click from also being
   * handled by the section-wrapper host's own `selectPart` binding (leaf
   * hosts are nested inside the section body host in the template). `path`
   * must be the exact same string passed to `leafDraft` for this leaf - see
   * `CvPreviewSelection.elementPath`. */
  selectLeaf(sectionKey: CvSectionKey, path: string, renderMode: unknown, event?: Event): void {
    this.selectPart(sectionKey, 'body', renderMode, event, path);
  }

  /** Keyboard activation of a selectable host. Space would otherwise scroll the
   * page, so we always `preventDefault` before selecting - this gives Space the
   * same activation semantics as Enter and a native `<button>`. */
  onSelectKey(
    event: Event,
    sectionKey: CvSectionKey,
    part: 'body' | 'title',
    renderMode: unknown,
    elementPath?: string,
  ): void {
    if (!this.selectable(renderMode)) return;
    // A key event bubbling up from an inline editor must NOT be treated as a
    // host activation: otherwise typing Space into an input gets
    // `preventDefault`'d (no space char) and re-selects the host, yanking
    // focus out of the edit. Let the editor handle its own keys.
    const target = event.target as HTMLElement | null;
    if (target?.closest('.cvpreview__leaf-editor')) return;
    event.preventDefault();
    this.selectPart(sectionKey, part, renderMode, event, elementPath);
  }

  /** Accessible name for a selectable body/title host - "<section> - <scope>"
   * (e.g. "Summary - Body text"), built from existing localized strings so the
   * `role="button"` regions are never announced as unnamed buttons. */
  selectAriaLabel(sectionKey: CvSectionKey, part: 'body' | 'title'): string {
    const section = this.t()(sectionLabelKey(sectionKey));
    const scope = this.t()(
      part === 'title' ? 'documents.cv_style_group_titles' : 'documents.cv_style_group_body',
    );
    return `${section} - ${scope}`;
  }

  /** Field-specific accessible name for a per-leaf selectable host - "<section>
   * - <field>" (e.g. "Experience - Company"), so a screen reader can tell
   * apart sibling leaves in the same section/part that `selectAriaLabel`
   * alone would announce identically. See `CvLeafFieldKey`'s doc. */
  leafAriaLabel(sectionKey: CvSectionKey, field: CvLeafFieldKey): string {
    const section = this.t()(sectionLabelKey(sectionKey));
    const fieldLabel = this.t()(LEAF_FIELD_LABEL_KEYS[field]);
    return `${section} - ${fieldLabel}`;
  }

  /** The selectable host to return keyboard focus to once a committing edit
   * clears the selection and the resting markup re-renders (see the focus
   * effect below). Keyed as `"<sectionKey>:<part>"` to match `data-cv-select`. */
  private returnFocusTo: string | null = null;

  /** `"<sectionKey>:<part>"` (or `null`) - deliberately ignores `elementPath`.
   * A `computed()` memoizes on its OUTPUT value, so changing only
   * `elementPath` (Phase D.2: clicking a different leaf inside the same
   * already-selected section/part to move the style-scope target) produces
   * the same string and does not re-notify the focus effect below. Without
   * this the focus-trap fix (see the effect's doc) would regress: an
   * elementPath-only change would still swap the `selection` input's object
   * reference, re-running the effect and yanking focus to the section's
   * first leaf editor mid-click - exactly the bug that fix exists to
   * prevent, just triggered by an element change instead of a redundant
   * whole-selection re-emit. */
  private readonly focusKey = computed<string | null>(() => {
    const s = this.selection();
    return s ? `${s.sectionKey}:${s.part}` : null;
  });

  /** Full selection identity including `elementPath` - the reset basis for
   * `editing` so moving to a DIFFERENT leaf (even within the same section+part)
   * drops back to view mode. */
  private readonly selKey = computed<string | null>(() => {
    const s = this.selection();
    return s ? `${s.sectionKey}:${s.part}:${s.elementPath ?? ''}` : null;
  });

  /** Whether the selected LEAF is in explicit text-EDIT mode (its own inline
   * editor mounted). Selecting a leaf no longer auto-mounts editors - that
   * turned every field in the section into an input at once. The user opts in
   * per selection via the live-panel "Edit text" button (`startEditing`). A
   * `linkedSignal` off `selKey` so moving the selection to any other element
   * drops back to view mode. */
  readonly editing = linkedSignal<boolean>(() => {
    this.selKey();
    return false;
  });

  /** True when THIS specific leaf is the one being text-edited - the per-field
   * gate that replaced the old section-level editor branch, so "Edit text"
   * mounts only the selected element's editor, not every field in its section. */
  isEditingLeaf(path: string): boolean {
    return this.editing() && this.isElementSelected(path);
  }

  /** Enter text-edit mode for the current selection (live-panel "Edit text").
   * A no-op with nothing selected. */
  startEditing(): void {
    if (this.selection()) this.editing.set(true);
  }

  /**
   * Focus management for the inline editors, in one place:
   * - ENTERING edit mode (`editing()` true) moves focus INTO the mounted leaf
   *   editor, so keyboard users don't need an extra tab;
   * - leaving edit mode via Enter (`finishLeafEdit`) returns focus to the
   *   now-restored selectable host.
   * Both run in a microtask so the DOM has rendered the new state first. Keyed
   * off `focusKey()` (section+part) + `editing()`, not the raw `selection()`
   * object, so an elementPath-only change never re-triggers this. */
  constructor() {
    this.edit.bind((section) => this.sectionChange.emit(section));
    this.css.bind({
      style: this.style,
      selection: this.selection,
      theme: this.activeTheme,
      host: () => this.el.nativeElement,
    });
    effect(() => {
      const key = this.focusKey();
      const editing = this.editing();
      if (!this.interactive()) return;
      if (key && editing) {
        queueMicrotask(() =>
          this.el.nativeElement
            .querySelector<HTMLElement>('.page-card .cvpreview__leaf-editor')
            ?.focus(),
        );
      } else if (this.returnFocusTo) {
        const target = this.returnFocusTo;
        this.returnFocusTo = null;
        queueMicrotask(() =>
          this.el.nativeElement
            .querySelector<HTMLElement>(`.page-card [data-cv-select="${target}"]`)
            ?.focus(),
        );
      }
    });
  }

  /** Finish editing a single-line leaf via Enter: blur commits the draft (the
   * element's own `(blur)` handler), then leave edit mode - the selection is
   * KEPT (chip + outline stay, panel stays open) and focus returns to the
   * now-restored selectable host. */
  finishLeafEdit(el: HTMLElement, sectionKey: CvSectionKey, part: 'body' | 'title'): void {
    el.blur();
    this.returnFocusTo = `${sectionKey}:${part}`;
    this.editing.set(false);
  }

  /** Clear the selection when the user clicks empty space in the preview -
   * anywhere that is NOT a selectable host, an inline editor, or an editor's
   * Bold button (selectable hosts already `stopPropagation`; this guard also
   * covers the editor textareas/inputs, which don't). Keeps a focused edit
   * alive: clicking the active editor never deselects. A no-op off the
   * interactive page render or when nothing is selected. Any in-progress edit
   * commits independently via the editor's own native `(blur)`. Bound as a
   * host listener (not a template `(click)`) so the deselect catcher needs no
   * focusable/keyboard affordance - selectable hosts already stop propagation,
   * so only genuine empty-space clicks bubble up to here. */
  @HostListener('click', ['$event'])
  onBackgroundClick(event: Event): void {
    if (!this.interactive() || !this.selection()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-cv-select], .cvpreview__leaf-editor')) return;
    this.selectionChange.emit(null);
  }

  protected readonly sectionLabelKey = sectionLabelKey;
  protected readonly buildContactLine = buildContactLine;
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

  /** Flattens `previewSections()` (in order) into ordered page atoms for
   * `<lib-paginated-sheet>`. `photo` has no atom of its own - it folds into
   * the header atom's render, mirroring the CSS float it always relied on. */
  readonly atoms = computed<SheetAtom[]>(() => {
    const out: SheetAtom[] = [];
    const t = this.t();
    const photoUri = this.includePhoto() ? this.photoDataUri() : null;

    for (const section of this.previewSections()) {
      switch (section.key) {
        case 'personal_details':
          out.push({
            id: 'header',
            tpl: this.headerTpl(),
            ctx: { $implicit: section, photoUri, placement: this.photoPlacement() },
          });
          break;
        case 'summary':
          if (section.text) {
            out.push({ id: 'summary', tpl: this.summaryTpl(), ctx: { $implicit: section } });
          }
          break;
        case 'skills':
          if (section.groups.length) {
            out.push({ id: 'skills', tpl: this.skillsTpl(), ctx: { $implicit: section } });
          }
          break;
        case 'languages':
          if (section.items.length) {
            out.push({ id: 'languages', tpl: this.languagesTpl(), ctx: { $implicit: section } });
          }
          break;
        case 'experience': {
          if (!section.entries.length) break;
          const label = t(sectionLabelKey('experience'));
          out.push({
            id: 'sec:experience:title',
            tpl: this.sectionTitleTpl(),
            ctx: { $implicit: label, key: 'experience' },
            glueToNext: true,
          });
          section.entries.forEach((entry, i) => {
            const bullets = entry.bullets ?? [];
            // Head glued to its first bullet so a heading never sits alone at a
            // page bottom; the remaining bullets are free to flow to the next
            // page, filling the current one instead of jumping the whole entry.
            out.push({
              id: `sec:experience:e${i}:head`,
              tpl: this.expHeadTpl(),
              ctx: { $implicit: entry, key: 'experience', first: i === 0, i, section },
              glueToNext: bullets.length > 0,
            });
            bullets.forEach((bullet, b) =>
              out.push({
                id: `sec:experience:e${i}:b${b}`,
                tpl: this.expBulletTpl(),
                ctx: { $implicit: bullet, key: 'experience', i, b, section },
              }),
            );
          });
          break;
        }
        case 'education': {
          if (!section.entries.length) break;
          const label = t(sectionLabelKey('education'));
          out.push({
            id: 'sec:education:title',
            tpl: this.sectionTitleTpl(),
            ctx: { $implicit: label, key: 'education' },
            glueToNext: true,
          });
          section.entries.forEach((entry, i) =>
            out.push({
              id: `sec:education:e${i}`,
              tpl: this.eduEntryTpl(),
              ctx: { $implicit: entry, key: 'education', i, section },
            }),
          );
          break;
        }
        // 'photo' folds into the header render - no standalone atom.
      }
    }
    return out;
  });

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

  /** Short chip label shown above a selected single leaf on the paper - the
   * field name (e.g. "Company", "Skill values"), reusing the same i18n field
   * labels as the a11y names and the Edit-mode section editors. */
  leafChipLabel(field: CvLeafFieldKey): string {
    return this.t()(LEAF_FIELD_LABEL_KEYS[field]);
  }

  /** Chip label for a selected section-level part (a title, or a whole-section
   * body with no single leaf singled out). */
  partChipLabel(part: 'body' | 'title'): string {
    return this.t()(
      part === 'title' ? 'documents.cv_style_group_titles' : 'documents.cv_style_group_body',
    );
  }

  /** `cv-detail` samples the selected host's resolved style through this
   * component, so the contract stays here even though the measurement moved. */
  readSelectedHostStyle(): Record<string, string> | null {
    return this.css.readSelectedHostStyle();
  }
}

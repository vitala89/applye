import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import type {
  CvPersonalDetailsSection,
  CvSection,
  CvSectionKey,
  CvStyle,
  CvSummarySection,
  CvTextRun,
  PhotoPlacement,
} from '@applye/core';
import { getBuiltinTheme, parseInlineEmphasis, themeCssVars, toggleBoldWrap } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { PaginatedSheetComponent, type SheetAtom, type SheetGeometry } from '@applye/ui';
import {
  buildContactLine,
  type CvContactFieldKey,
  type CvPreviewSelection,
  effectiveSectionStyle,
  effectiveTitleBorder,
  effectiveTitleStyle,
  orderedVisibleSections,
  resolvePageSettings,
  sectionLabelKey,
  visiblePersonalContactFields,
} from '../../cv-content.util';

/**
 * Presentational live preview for the CV editor: the paginated page-card
 * sheet, its 8 atom templates, and the pure styling resolvers they depend on.
 * Behavior-preserving extraction from `CvDetailComponent` — no visual or
 * pagination change. `sections`/`style`/`themeId`/photo state stay owned by
 * the parent (source of truth); this component only renders them and
 * reports overflow back up via `blockOverflow`.
 */
@Component({
  selector: 'app-cv-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, PaginatedSheetComponent],
  templateUrl: './cv-preview.component.html',
  styleUrl: './cv-preview.component.scss',
})
export class CvPreviewComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly sections = input.required<CvSection[]>();
  readonly style = input.required<CvStyle>();
  readonly themeId = input.required<number>();
  readonly includePhoto = input.required<boolean>();
  readonly photoDataUri = input.required<string | null>();
  readonly photoPlacement = input.required<PhotoPlacement>();
  /** Drives `buildContactLine`'s optional fields in `#headerTpl` — not in the
   * original task brief's input list, but required: the header atom template
   * (moved verbatim) reads these two signals directly. Without them the
   * contact line's birthdate/marital-status inclusion would silently break. */
  readonly includeBirthdate = input.required<boolean>();
  readonly includeMaritalStatus = input.required<boolean>();

  /** Mirrors `<lib-paginated-sheet>`'s `(blockOverflow)` output up to the
   * parent, which owns the signal driving the export/editor-side warning. */
  readonly blockOverflow = output<boolean>();

  /** When true, visible page-card atoms expose click-to-select affordances for
   * the contextual live-style panel. Measurement atoms are never interactive
   * regardless — the render-mode gate below keeps the measure pass inert. */
  readonly interactive = input(false);
  /** The section/part the parent currently has selected — drives the selected
   * outline. The parent owns this signal; the preview only reports changes. */
  readonly selection = input<CvPreviewSelection | null>(null);
  /** Emitted when the user clicks a selectable body/title target (page pass
   * only). */
  readonly selectionChange = output<CvPreviewSelection | null>();
  /** Immutable section-change sink for inline content edits — emitted once per
   * committed leaf edit (see `commitSummary`/`commitPersonalField`). */
  readonly sectionChange = output<CvSection>();

  /** True only for a visible page-card render while interactive — the single
   * gate every atom template uses so the hidden measurement pass (`'measure'`)
   * never gains a role, tabindex, cursor, or click handler. */
  selectable(renderMode: unknown): boolean {
    return this.interactive() && renderMode === 'page';
  }

  isSelected(sectionKey: CvSectionKey, part: 'body' | 'title'): boolean {
    const s = this.selection();
    return !!s && s.sectionKey === sectionKey && s.part === part;
  }

  /** Emit a semantic selection for a clicked target — a no-op unless this is a
   * selectable page render, so the inert measurement pass can never emit. */
  selectPart(
    sectionKey: CvSectionKey,
    part: 'body' | 'title',
    renderMode: unknown,
    event?: Event,
  ): void {
    if (!this.selectable(renderMode)) return;
    event?.stopPropagation();
    this.selectionChange.emit({ sectionKey, part });
  }

  protected readonly sectionLabelKey = sectionLabelKey;
  protected readonly buildContactLine = buildContactLine;
  protected readonly visiblePersonalContactFields = visiblePersonalContactFields;

  // --- Inline leaf editing (summary + personal_details) -----------------
  //
  // A leaf becomes a native editor while it is BOTH the active `selection`
  // (Task 3) and on a selectable (page, interactive) render — the measure
  // pass is never selectable, so it can never mount an editor. Typing only
  // updates this local draft map (`drafts`); nothing is emitted until the
  // control blurs (or an explicit apply keystroke triggers blur), and only
  // if the draft actually differs from the resting model value — which also
  // makes "Escape then blur" a no-op for free: Escape resets the draft back
  // to the resting value, so the following blur sees no change and emits
  // nothing.
  private readonly drafts = signal<Record<string, string>>({});

  /** Current draft text for a leaf, or the resting model value if the leaf
   * has no in-progress edit yet (e.g. right after mounting the editor). */
  leafDraft(id: string, resting: string): string {
    return this.drafts()[id] ?? resting;
  }

  /** Drafting — updates local state only, emits nothing. */
  onLeafInput(id: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [id]: value }));
  }

  /** Escape — revert the draft to the resting value. Does not itself emit or
   * end editing; a subsequent blur will see an unchanged value and skip the
   * commit. */
  onLeafEscape(id: string, resting: string): void {
    this.drafts.update((d) => ({ ...d, [id]: resting }));
  }

  private clearDraft(id: string): void {
    this.drafts.update((d) => {
      if (!(id in d)) return d;
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  /** Commit the summary leaf on blur: emits one new immutable
   * `CvSummarySection` only if the draft actually changed the text. */
  commitSummary(section: CvSummarySection, resting: string): void {
    const id = 'summary';
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.sectionChange.emit({ ...section, text: value });
    }
  }

  /** Wrap/unwrap `**bold**` around the summary textarea's current selection —
   * modifies the draft only (still drafting; the eventual blur commits it),
   * then restores the caret. Bound to the Bold button and Cmd/Ctrl+B. */
  applySummaryBold(el: HTMLTextAreaElement, resting: string): void {
    const id = 'summary';
    const current = this.drafts()[id] ?? resting;
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const r = toggleBoldWrap(current, start, end);
    this.drafts.update((d) => ({ ...d, [id]: r.text }));
    queueMicrotask(() => {
      el.value = r.text;
      el.setSelectionRange(r.selStart, r.selEnd);
      el.focus();
    });
  }

  /** Cmd/Ctrl+B handler for the summary textarea. */
  onSummaryBoldKeydown(event: KeyboardEvent, el: HTMLTextAreaElement, resting: string): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      this.applySummaryBold(el, resting);
    }
  }

  /** Commit a single personal-details field on blur: emits one new immutable
   * `CvPersonalDetailsSection` only if the draft actually changed the value —
   * this is what keeps a localized fallback (e.g. the "Untitled" placeholder)
   * from ever becoming persisted content: the draft starts at the real
   * (possibly empty) field value, never at the fallback label, so an
   * untouched field never diffs from `resting` and never commits. */
  commitPersonalField(
    section: CvPersonalDetailsSection,
    field: CvContactFieldKey | 'fullName' | 'title',
    resting: string,
  ): void {
    const id = `pd.${field}`;
    const value = this.drafts()[id] ?? resting;
    this.clearDraft(id);
    if (value !== resting) {
      this.sectionChange.emit({ ...section, [field]: value });
    }
  }

  readonly activeTheme = computed(() => getBuiltinTheme(this.themeId()));

  /** Theme custom properties for the preview viewport; inherited by all page cards. */
  readonly themeVars = computed<Record<string, string>>(() => themeCssVars(this.activeTheme()));

  /** px per mm at 96dpi — fixes the on-screen sheet to real page proportions. */
  private static readonly PX_PER_MM = 96 / 25.4;

  /** Preview page geometry (px) — real A4/Letter proportions plus margins,
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

  /** True when any single atom is taller than one usable page — set from
   * `<lib-paginated-sheet>`'s `(blockOverflow)` output; also forwarded to the
   * parent via the `blockOverflow` output. */
  protected readonly overflow = signal(false);

  protected onBlockOverflow(value: boolean): void {
    this.overflow.set(value);
    this.blockOverflow.emit(value);
  }

  // Atom templates for the paginated sheet — declared in the HTML (`#headerTpl` etc).
  readonly headerTpl = viewChild.required<TemplateRef<unknown>>('headerTpl');
  readonly summaryTpl = viewChild.required<TemplateRef<unknown>>('summaryTpl');
  readonly sectionTitleTpl = viewChild.required<TemplateRef<unknown>>('sectionTitleTpl');
  readonly skillsTpl = viewChild.required<TemplateRef<unknown>>('skillsTpl');
  readonly expHeadTpl = viewChild.required<TemplateRef<unknown>>('expHeadTpl');
  readonly expBulletTpl = viewChild.required<TemplateRef<unknown>>('expBulletTpl');
  readonly eduEntryTpl = viewChild.required<TemplateRef<unknown>>('eduEntryTpl');
  readonly languagesTpl = viewChild.required<TemplateRef<unknown>>('languagesTpl');

  /** Ordered, visible sections as they'd actually render — the photo
   * toggle isn't written back into `section.visible` until Save, so this
   * mirrors the live toggle state rather than trusting the stored value. */
  readonly previewSections = computed(() => {
    const live = this.sections().map((s) =>
      s.key === 'photo' ? { ...s, visible: this.includePhoto() } : s,
    );
    return orderedVisibleSections(live);
  });

  /** Flattens `previewSections()` (in order) into ordered page atoms for
   * `<lib-paginated-sheet>`. `photo` has no atom of its own — it folds into
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
              ctx: { $implicit: entry, key: 'experience', first: i === 0 },
              glueToNext: bullets.length > 0,
            });
            bullets.forEach((bullet, b) =>
              out.push({
                id: `sec:experience:e${i}:b${b}`,
                tpl: this.expBulletTpl(),
                ctx: { $implicit: bullet, key: 'experience' },
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
              ctx: { $implicit: entry, key: 'education' },
            }),
          );
          break;
        }
        // 'photo' folds into the header render — no standalone atom.
      }
    }
    return out;
  });

  /** `t()` has no interpolation support (see `TranslateService.t`), so page
   * captions substitute `{i}`/`{n}` manually — same pattern as
   * `styleNoteMessage`'s `{value}` substitution in the parent. */
  readonly captionFn = (page: number, total: number): string =>
    this.t()('documents.preview_page_of')
      .replace('{i}', String(page))
      .replace('{n}', String(total));

  runs(text: string): CvTextRun[] {
    return parseInlineEmphasis(text);
  }

  /** Effective font/size/weight/colour for a section — its own override
   * merged over the document-wide style (`effectiveSectionStyle`). */
  effStyle(key: CvSectionKey) {
    return effectiveSectionStyle(this.style(), key);
  }

  /** Body-text style for a section wrapper. */
  bodyCss(key: CvSectionKey): Record<string, string> {
    const s = this.effStyle(key);
    const css: Record<string, string> = {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
      color: s.colorHex,
    };
    if (s.lineHeight !== undefined) {
      css['line-height'] = String(s.lineHeight);
      css['--cv-section-line-height'] = String(s.lineHeight);
    }
    if (this.style().sectionStyles?.[key]?.colorHex) {
      css['--cv-section-body-color'] = s.colorHex;
    }
    return css;
  }

  /** Title style for a section heading. */
  titleCss(key: CvSectionKey): Record<string, string> {
    const s = effectiveTitleStyle(this.style(), key);
    return {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
      color: s.colorHex,
    };
  }

  /** Title underline as a `border-bottom` string for `[style.borderBottom]`.
   * When the active theme defines an accent/muted section rule and the user
   * hasn't explicitly set their own title border, the theme's colour/weight
   * wins (Aurora); otherwise falls back to the neutral default (Classic,
   * whose `ruleColor` is `'none'`, always takes this branch). */
  titleBorderCss(key: CvSectionKey): string {
    const b = effectiveTitleBorder(this.style(), key);
    if (b === 'none') return 'none';
    const sh = this.activeTheme().sectionHeader;
    if (sh.ruleColor !== 'none' && !this.hasExplicitTitleBorder(key)) {
      const color = sh.ruleColor === 'accent' ? 'var(--cv-accent)' : 'var(--cv-muted)';
      return `${sh.ruleWeightPt}pt ${b} ${color}`;
    }
    return `var(--border-width) ${b} var(--border-subtle)`;
  }

  private hasExplicitTitleBorder(key: CvSectionKey): boolean {
    const s = this.style();
    return s.sectionStyles?.[key]?.titleBorder != null || s.titleBorder != null;
  }

  headerPlacementClass(placement: PhotoPlacement): string {
    const suffix =
      placement === 'above_center' ? 'center' : placement === 'above_right' ? 'right' : 'left';
    return `cvpreview__header--${suffix}`;
  }
}

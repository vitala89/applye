import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  signal,
  TemplateRef,
  viewChildren,
} from '@angular/core';
import { PackAtom, paginate } from './paginate.util';

export interface SheetGeometry {
  pageWidthPx: number;
  pageHeightPx: number;
  marginTopPx: number;
  marginRightPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
}

export interface SheetAtom {
  /** stable id, used for @for tracking */
  id: string;
  /** the host template rendered for this atom, in both the measure pass and
   *  the final card */
  tpl: TemplateRef<unknown>;
  /** context object passed to the template outlet (e.g. { $implicit: entry }) */
  ctx?: unknown;
  /** true when this atom must stay with the next atom (section title → first entry) */
  glueToNext?: boolean;
}

/** Which pass is rendering an atom template: the hidden measurement pass, or
 *  a visible page card. Atom templates use this to gate interactive affordances
 *  (click-to-select, inline edit) so they only ever appear in the 'page' pass. */
export type SheetRenderMode = 'measure' | 'page';

/**
 * Namespaced outlet-context key carrying the current {@link SheetRenderMode}.
 * The leading `$` avoids colliding with atom-supplied context fields (e.g.
 * `$implicit`). Reserved: atoms must not supply this key themselves.
 */
export const SHEET_RENDER_MODE_KEY = '$sheetRenderMode';

@Component({
  selector: 'lib-paginated-sheet',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './paginated-sheet.html',
  styleUrl: './paginated-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginatedSheetComponent implements AfterViewInit, OnDestroy {
  readonly atoms = input.required<SheetAtom[]>();
  readonly geometry = input.required<SheetGeometry>();
  readonly captionFn = input.required<(page: number, total: number) => string>();
  readonly blockOverflow = output<boolean>();

  /** Wrappers around each atom in the hidden measure pass. */
  private readonly measureEls = viewChildren<ElementRef<HTMLElement>>('measureAtom');

  /** Measured atom heights (px). Zero-length until the first measure pass. */
  private readonly heights = signal<number[]>([]);

  /**
   * Headroom subtracted from the measured content column width, on top of
   * its margins. A right-aligned run (a date, a location) is positioned by
   * the on-screen layout engine's own text measurement, which is not the
   * same computation WKWebView's print rasterizer uses to draw the same
   * embedded font's glyphs at print resolution - a sub-pixel gap in the same
   * family as the height gap below, just on the width axis. Confirmed via
   * `pypdf` against a native export: a right-aligned run measured 0.9pt past
   * the page's own clip edge. This margin keeps every atom's right edge far
   * enough from the true boundary that the gap can't push a glyph past it.
   */
  private static readonly PRINT_WIDTH_SAFETY_MARGIN_PX = 4;

  /** Content width available inside the margins - the measure column width. */
  readonly contentWidthPx = computed(() => {
    const g = this.geometry();
    return Math.max(
      1,
      g.pageWidthPx -
        g.marginLeftPx -
        g.marginRightPx -
        PaginatedSheetComponent.PRINT_WIDTH_SAFETY_MARGIN_PX,
    );
  });

  /**
   * Trimmed off the printed page box so a full-height card can never round
   * past the printable area and emit a blank page. Measured, not guessed: an
   * export's own page content box reads 728.00pt (910.00px at the 0.8 scale
   * WKWebView prints at) where this geometry computes 910.63px - the print
   * pass rounds 0.63px short of what the screen believes. 1px covers it.
   */
  private static readonly PRINT_PAGE_BOX_TRIM_PX = 1;

  /**
   * Height of one printed page's content box - the full area inside the
   * native margins, *not* reduced by the packing headroom below.
   *
   * Print CSS gives this to every card but the last, so each one fills its
   * page exactly. That is what closes the duplicate-paint bug: the artifact
   * needs leftover space at the foot of a page to fragment the next card
   * into, and a card that fills its page leaves none. The packing headroom
   * stays a separate, smaller number, so the slack now sits *inside* the
   * card, below its last atom, where nothing can be painted into it.
   */
  readonly pageBoxHeightPx = computed(() => {
    const g = this.geometry();
    return Math.max(
      1,
      g.pageHeightPx -
        g.marginTopPx -
        g.marginBottomPx -
        PaginatedSheetComponent.PRINT_PAGE_BOX_TRIM_PX,
    );
  });

  /**
   * Headroom subtracted from every page's usable height, on top of its
   * margins. Pagination runs once, on the editor's own on-screen layout,
   * *before* the print pass ever starts (`awaitPrintSettle` marks the print
   * class only after settling) - so a card is packed to fit a height measured
   * under normal CSS, then handed to WKWebView's print layout, which can
   * legally come out a few points taller for the same content (the same class
   * of on-screen-vs-print divergence `contentWidthPx` exists to close for
   * width, measured at 10-13pt in practice). A page-card that comes out even
   * fractionally too tall forces the browser to break inside a box marked
   * `break-inside: avoid` - and the observed failure there is not a quietly
   * shifted page break, it is the box's own last atom (a section title glued
   * to content the paginator judged fit) printing twice: once, incomplete, at
   * the foot of the page that overflowed, and again in full at the top of the
   * next. This margin exists so a card is never packed close enough to that
   * edge for the print pass's own layout to cross it.
   *
   * **This does not close the duplicate-paint bug, and may widen it.** A
   * native export at 24px was read with `pypdf`: the paginator had correctly
   * assigned "LANGUAGES" to card 1 (page 1's clip is exactly one heading plus
   * one line tall), yet page 0 carried a second, 11.5px clip strip below
   * card 0's box with the same heading painted into it. WKWebView begins
   * laying the next card out in whatever space is left at the foot of the
   * page, paints its first line there, and only then honours
   * `break-before: page` - painting it a second time on the next page. The
   * strip is the leftover space, so it grows with this constant rather than
   * shrinking: 24px of headroom left 11.5px of strip and leaked a heading;
   * a card packed 36px short leaked two full lines. Headroom is the wrong
   * lever for that failure, and the fix belongs in the print CSS's
   * fragmentation rules, not here.
   */
  private static readonly PRINT_HEIGHT_SAFETY_MARGIN_PX = 24;

  private readonly usableH = computed(() => {
    const g = this.geometry();
    return Math.max(
      1,
      g.pageHeightPx -
        g.marginTopPx -
        g.marginBottomPx -
        PaginatedSheetComponent.PRINT_HEIGHT_SAFETY_MARGIN_PX,
    );
  });

  /** Pages as ordered atom-index arrays. */
  readonly pages = computed<number[][]>(() => {
    const atoms = this.atoms();
    const heights = this.heights();
    if (atoms.length === 0) return [[]];
    const packAtoms: PackAtom[] = atoms.map((a, i) => ({
      height: heights[i] ?? 0,
      glueToNext: a.glueToNext,
    }));
    return paginate(packAtoms, this.usableH());
  });

  private ro?: ResizeObserver;

  constructor() {
    // Emit overflow whenever any atom is taller than one usable page.
    effect(() => {
      const usable = this.usableH();
      const tooTall = this.heights().some((h) => h > usable + 1);
      this.blockOverflow.emit(tooTall);
    });
    // Re-measure when atoms or geometry change.
    effect(() => {
      this.atoms();
      this.geometry();
      queueMicrotask(() => this.measure());
    });
  }

  ngAfterViewInit(): void {
    // jsdom (unit tests) has no ResizeObserver; skip live re-measurement there.
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure());
      for (const el of this.measureEls()) this.ro.observe(el.nativeElement);
    }
    this.measure();
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  private measure(): void {
    const els = this.measureEls();
    const next = els.map((el) => el.nativeElement.offsetHeight);
    const cur = this.heights();
    if (next.length === cur.length && next.every((h, i) => h === cur[i])) return;
    // keep the ResizeObserver watching the live set of measure elements
    this.ro?.disconnect();
    for (const el of els) this.ro?.observe(el.nativeElement);
    this.heights.set(next);
  }

  /** Caption text for card `pageIndex` (0-based). */
  captionFor(pageIndex: number): string {
    return this.captionFn()(pageIndex + 1, this.pages().length);
  }

  atomAt(index: number): SheetAtom {
    return this.atoms()[index];
  }

  /** Outlet context for atom `index` in the visible page-card pass. */
  pageCtx(index: number): Record<string, unknown> {
    return this.ctxWithRenderMode(this.atomAt(index), 'page');
  }

  /** Outlet context for `atom` in the hidden measurement pass. */
  measureCtx(atom: SheetAtom): Record<string, unknown> {
    return this.ctxWithRenderMode(atom, 'measure');
  }

  /**
   * Merges the namespaced render-mode signal into an atom's own context.
   * Throws if the atom already supplies the reserved key, so callers can't
   * silently override which pass a template thinks it's rendering in.
   */
  private ctxWithRenderMode(atom: SheetAtom, mode: SheetRenderMode): Record<string, unknown> {
    const base = (atom.ctx ?? {}) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(base, SHEET_RENDER_MODE_KEY)) {
      // Intentional fail-fast: a colliding `$sheetRenderMode` key is a contract
      // violation, not a runtime condition to tolerate. Throwing here surfaces
      // the offending atom immediately rather than letting a template silently
      // mistake the measure pass for the page pass (or vice versa).
      throw new Error(
        `SheetAtom "${atom.id}" ctx must not supply the reserved "${SHEET_RENDER_MODE_KEY}" key.`,
      );
    }
    return { ...base, [SHEET_RENDER_MODE_KEY]: mode };
  }
}

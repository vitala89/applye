import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  TemplateRef,
  computed,
  effect,
  input,
  output,
  signal,
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

  /** Content width available inside the margins — the measure column width. */
  readonly contentWidthPx = computed(() => {
    const g = this.geometry();
    return Math.max(1, g.pageWidthPx - g.marginLeftPx - g.marginRightPx);
  });

  private readonly usableH = computed(() => {
    const g = this.geometry();
    return Math.max(1, g.pageHeightPx - g.marginTopPx - g.marginBottomPx);
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
      throw new Error(
        `SheetAtom "${atom.id}" ctx must not supply the reserved "${SHEET_RENDER_MODE_KEY}" key.`,
      );
    }
    return { ...base, [SHEET_RENDER_MODE_KEY]: mode };
  }
}

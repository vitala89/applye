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
}

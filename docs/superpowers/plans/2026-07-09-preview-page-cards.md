# Discrete Page Cards in Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the continuous preview sheet + dashed break-guide in the CV and cover-letter previews with real, discrete white page cards, each captioned "Page i of N", split at entry-level atom boundaries.

**Architecture:** A shared, mechanical `PaginatedSheetComponent` (`libs/ui`) measures host-supplied atom templates in a hidden pass, packs them into pages with a pure `paginate()` util (greedy, never splitting an atom, gluing section titles to the first entry), and renders one white `.page-card` per page with a caption. The CV and cover-letter hosts flatten their own models into ordered atoms and project atom templates in. Print keeps native browser pagination with `break-inside: avoid` on the same atoms.

**Tech Stack:** Angular 18 standalone components + signals, TypeScript, Jest, SCSS, `libs/i18n` translations, Nx monorepo.

## Global Constraints

- Shared UI + design tokens live in `libs/ui`; the paginator component and its util go there and are exported from `libs/ui/src/index.ts`.
- `libs/ui` stays i18n-free: all user-facing strings ("Page i of N", "… (cont.)", overflow warning) are passed in from the host as inputs, localized via `libs/i18n`.
- User-facing strings go through `libs/i18n` (`libs/i18n/src/lib/translations/translations.ts`), EN + DE, no hardcoded copy in host templates.
- `PX_PER_MM = 96 / 25.4`. Page geometry comes from `resolvePageSettings()` in `cv-content.util.ts` — do NOT change that resolver or the margins model.
- All cross-component print rules (hide/show, paper colours) MUST live in the global `apps/desktop/src/styles.scss`, never in a component SCSS (Angular Emulated encapsulation scopes `body.printing-cv *` to that component only — the PR #67 bug).
- Conventional Commits, lowercase subject (commitlint enforces).
- Component selector convention: `lib-*`, standalone, separate `.html`/`.scss`/`.ts`/`.spec.ts` (see `libs/ui/src/lib/score-gauge/`).
- Branch: `feat/preview-page-cards` (already created).

---

## File Structure

- Create `libs/ui/src/lib/paginated-sheet/paginate.util.ts` — pure packing (`PackAtom`, `paginate`).
- Create `libs/ui/src/lib/paginated-sheet/paginate.util.spec.ts` — pure unit tests.
- Create `libs/ui/src/lib/paginated-sheet/paginated-sheet.ts` — `PaginatedSheetComponent`, `SheetAtom`, `SheetGeometry`.
- Create `libs/ui/src/lib/paginated-sheet/paginated-sheet.html`.
- Create `libs/ui/src/lib/paginated-sheet/paginated-sheet.scss`.
- Create `libs/ui/src/lib/paginated-sheet/paginated-sheet.spec.ts`.
- Create `libs/ui/src/styles/_paper.scss` — `@mixin paper-light` (shared by the component SCSS and the global print block).
- Modify `libs/ui/src/index.ts` — export the component + types.
- Modify `libs/i18n/src/lib/translations/translations.ts` — add page-card copy keys (EN + DE).
- Modify `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.{ts,html,scss,spec.ts}`.
- Modify `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.{ts,html,scss,spec.ts}`.
- Modify `apps/desktop/src/styles.scss` — print block: cards → native flow, hide captions, `@use` the shared paper mixin.

---

## Task 1: Pure pagination util

**Files:**

- Create: `libs/ui/src/lib/paginated-sheet/paginate.util.ts`
- Test: `libs/ui/src/lib/paginated-sheet/paginate.util.spec.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface PackAtom {
    /** measured pixel height of the atom */
    height: number;
    /** when true, this atom must stay on the same page as the next atom
     *  (e.g. a section title glued to its first entry) */
    glueToNext?: boolean;
  }
  /** Greedy top-to-bottom packing. Returns pages; each page is an ordered
   *  list of atom indices into `atoms`. An atom is never split. A glued atom
   *  is pushed to the next page if it plus its following atom would not both
   *  fit on the current page. An atom taller than `usableH` stands alone on
   *  its own page (and will visibly overflow — the host warns). */
  export function paginate(atoms: PackAtom[], usableH: number): number[][];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// libs/ui/src/lib/paginated-sheet/paginate.util.spec.ts
import { paginate, PackAtom } from './paginate.util';

const h = (height: number, glueToNext = false): PackAtom => ({ height, glueToNext });

describe('paginate', () => {
  it('returns a single empty page for no atoms', () => {
    expect(paginate([], 1000)).toEqual([[]]);
  });

  it('keeps atoms that fit on one page together', () => {
    expect(paginate([h(300), h(300), h(300)], 1000)).toEqual([[0, 1, 2]]);
  });

  it('starts a new page when the next atom would overflow', () => {
    expect(paginate([h(600), h(600)], 1000)).toEqual([[0], [1]]);
  });

  it('packs greedily across three pages', () => {
    expect(paginate([h(400), h(400), h(400), h(400), h(400)], 1000)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('never splits an oversized atom — it stands alone on its own page', () => {
    expect(paginate([h(300), h(1500), h(300)], 1000)).toEqual([[0], [1], [2]]);
  });

  it('pushes a glued title to the next page when title + first entry do not both fit', () => {
    // page fills to 800; a glued 100 title + 300 entry (=400) will not fit in
    // the remaining 200, so the title moves down to sit with its entry.
    expect(paginate([h(800), h(100, true), h(300)], 1000)).toEqual([[0], [1, 2]]);
  });

  it('keeps a glued title with its entry when both fit', () => {
    expect(paginate([h(400), h(100, true), h(300)], 1000)).toEqual([[0, 1, 2]]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test ui --test-path-pattern=paginate.util`
Expected: FAIL — `Cannot find module './paginate.util'`.

- [ ] **Step 3: Write the implementation**

```ts
// libs/ui/src/lib/paginated-sheet/paginate.util.ts
export interface PackAtom {
  height: number;
  glueToNext?: boolean;
}

export function paginate(atoms: PackAtom[], usableH: number): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let currentH = 0;

  const flush = (): void => {
    pages.push(current);
    current = [];
    currentH = 0;
  };

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    // Look-ahead height: a glued atom must fit together with the next one.
    const next = atom.glueToNext ? atoms[i + 1] : undefined;
    const needH = atom.height + (next ? next.height : 0);

    if (current.length > 0 && currentH + needH > usableH) {
      flush();
    }
    current.push(i);
    currentH += atom.height;
  }

  flush();
  return pages;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test ui --test-path-pattern=paginate.util`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add libs/ui/src/lib/paginated-sheet/paginate.util.ts libs/ui/src/lib/paginated-sheet/paginate.util.spec.ts
git commit -m "feat(ui): pure page-packing util for paginated preview"
```

---

## Task 2: Shared paper-light SCSS mixin

**Files:**

- Create: `libs/ui/src/styles/_paper.scss`

Single source for the "always white paper" token overrides, `@use`d by both the component SCSS (Task 3) and the global print block (Task 6). Values copied verbatim from the current `apps/desktop/src/styles.scss` `@media print` block.

- [ ] **Step 1: Create the mixin**

```scss
// libs/ui/src/styles/_paper.scss
// Pins an element (and its cascade) to light "paper" colours regardless of the
// active app theme. Used by the on-screen page cards AND the print block so
// screen == printed PDF. Do not fork these values — change them here only.
@mixin paper-light {
  --surface-1: #ffffff;
  --surface-2: #fafaf8;
  --surface-hover: #f4f4f2;
  --surface-sunken: #f4f4f2;
  --text-primary: #16161a;
  --text-secondary: #5a5a63;
  --text-tertiary: #6b6b73;
  --text-accent: #4f5bff;
  --border-subtle: #ececee;
  --border-default: #d6d6da;
  --border-strong: #b8b8bf;
  --border-accent: #4f5bff;
  --accent: #4f5bff;
  --accent-hover: #3a33d6;
  --accent-fg: #ffffff;
  --accent-tint: rgba(79, 91, 255, 0.08);
  --danger: #e05656;
  --danger-tint: rgba(224, 86, 86, 0.1);
  --warning: #e0a23b;
  --warning-tint: rgba(224, 162, 59, 0.12);
  --success: #2bb673;
  background-color: #fff;
  color: #16161a;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
```

- [ ] **Step 2: Verify it compiles via a consumer (no standalone build).**

No commit yet — this partial has no consumer until Task 3. Proceed directly to Task 3, then commit both together at the end of Task 3.

---

## Task 3: PaginatedSheetComponent

**Files:**

- Create: `libs/ui/src/lib/paginated-sheet/paginated-sheet.ts`
- Create: `libs/ui/src/lib/paginated-sheet/paginated-sheet.html`
- Create: `libs/ui/src/lib/paginated-sheet/paginated-sheet.scss`
- Create: `libs/ui/src/lib/paginated-sheet/paginated-sheet.spec.ts`
- Modify: `libs/ui/src/index.ts`

**Interfaces:**

- Consumes: `paginate`, `PackAtom` (Task 1); `@mixin paper-light` (Task 2).
- Produces:

  ```ts
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
    /** localized base label of the section this atom belongs to (e.g.
     *  "Berufserfahrung"); null for atoms with no section (header, summary). */
    sectionLabel?: string | null;
    /** true when this atom is the section's own title (its start); false/absent
     *  for the section's entries. Drives the "(cont.)" reprint. */
    isSectionStart?: boolean;
    /** true when this atom must stay with the next atom (section title → first entry) */
    glueToNext?: boolean;
  }
  // Component: selector 'lib-paginated-sheet'
  //   inputs:  atoms: SheetAtom[]              (required)
  //            geometry: SheetGeometry         (required)
  //            captionFn: (page, total) => string        (required)
  //            continuationFn: (sectionLabel) => string  (required)
  //   outputs: blockOverflow: boolean          (emits on recompute)
  ```

- [ ] **Step 1: Write the failing spec**

```ts
// libs/ui/src/lib/paginated-sheet/paginated-sheet.spec.ts
import { Component, signal, TemplateRef, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginatedSheetComponent, SheetAtom, SheetGeometry } from './paginated-sheet';

@Component({
  standalone: true,
  imports: [PaginatedSheetComponent],
  template: `
    <ng-template #box><div class="box" style="height:400px"></div></ng-template>
    <lib-paginated-sheet
      [atoms]="atoms()"
      [geometry]="geometry"
      [captionFn]="captionFn"
      [continuationFn]="contFn"
    />
  `,
})
class HostComponent {
  readonly box = viewChild.required('box', { read: TemplateRef });
  readonly atoms = signal<SheetAtom[]>([]);
  readonly geometry: SheetGeometry = {
    pageWidthPx: 794,
    pageHeightPx: 1123,
    marginTopPx: 40,
    marginRightPx: 40,
    marginBottomPx: 40,
    marginLeftPx: 40,
  };
  readonly captionFn = (p: number, n: number): string => `Page ${p} of ${n}`;
  readonly contFn = (label: string): string => `${label} (cont.)`;
}

describe('PaginatedSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders one page card with a caption for empty content', () => {
    const cards = fixture.nativeElement.querySelectorAll('.page-card');
    expect(cards.length).toBe(1);
    const caption = fixture.nativeElement.querySelector('.page-card__caption');
    expect(caption.textContent.trim()).toBe('Page 1 of 1');
  });

  it('renders a caption per card using captionFn', () => {
    // jsdom reports offsetHeight as 0, so heights come from the measured
    // signal; drive packing directly by exposing the pack result.
    const c = fixture.componentInstance;
    const atoms: SheetAtom[] = [
      { id: 'a', tpl: c.box() },
      { id: 'b', tpl: c.box() },
    ];
    c.atoms.set(atoms);
    fixture.detectChanges();
    const captions = fixture.nativeElement.querySelectorAll('.page-card__caption');
    expect(captions.length).toBeGreaterThanOrEqual(1);
    expect(captions[0].textContent).toContain('of');
  });
});
```

> **Note on measurement in jsdom:** `offsetHeight` is `0` in jsdom, so the measure pass yields all-zero heights and everything packs onto one page. The specs above assert structure/captions, not real splitting (real splitting is covered by Task 1's pure tests + the manual gate). Implement the component so a zero-height measure still renders exactly one page.

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx nx test ui --test-path-pattern=paginated-sheet`
Expected: FAIL — `Cannot find module './paginated-sheet'`.

- [ ] **Step 3: Write the component TypeScript**

```ts
// libs/ui/src/lib/paginated-sheet/paginated-sheet.ts
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
  id: string;
  tpl: TemplateRef<unknown>;
  ctx?: unknown;
  sectionLabel?: string | null;
  isSectionStart?: boolean;
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
  readonly continuationFn = input.required<(sectionLabel: string) => string>();
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
    this.ro = new ResizeObserver(() => this.measure());
    for (const el of this.measureEls()) this.ro.observe(el.nativeElement);
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

  /** When a card's first atom is a mid-section continuation (its section's
   *  title was on an earlier page), returns the "(cont.)" reprint; else null. */
  continuationFor(page: number[]): string | null {
    const first = page[0];
    if (first == null) return null;
    const atom = this.atoms()[first];
    if (!atom?.sectionLabel || atom.isSectionStart) return null;
    return this.continuationFn()(atom.sectionLabel);
  }

  atomAt(index: number): SheetAtom {
    return this.atoms()[index];
  }
}
```

- [ ] **Step 4: Write the component template**

```html
<!-- libs/ui/src/lib/paginated-sheet/paginated-sheet.html -->
<!-- Hidden measure pass: every atom rendered once in a single page-width
     column so we can read its natural height. Positioned off-screen. -->
<div class="paginated-sheet__measure" aria-hidden="true" [style.width.px]="contentWidthPx()">
  @for (atom of atoms(); track atom.id) {
  <div #measureAtom>
    <ng-container [ngTemplateOutlet]="atom.tpl" [ngTemplateOutletContext]="atom.ctx ?? {}" />
  </div>
  }
</div>

<!-- Rendered page cards. -->
@for (page of pages(); track $index) {
<div class="page-card-wrap">
  <div
    class="page-card"
    [style.width.px]="geometry().pageWidthPx"
    [style.height.px]="geometry().pageHeightPx"
    [style.padding.px]="0"
    [style.paddingTop.px]="geometry().marginTopPx"
    [style.paddingRight.px]="geometry().marginRightPx"
    [style.paddingBottom.px]="geometry().marginBottomPx"
    [style.paddingLeft.px]="geometry().marginLeftPx"
  >
    @if (continuationFor(page); as cont) {
    <p class="page-card__cont">{{ cont }}</p>
    } @for (idx of page; track atomAt(idx).id) {
    <div class="page-card__atom">
      <ng-container
        [ngTemplateOutlet]="atomAt(idx).tpl"
        [ngTemplateOutletContext]="atomAt(idx).ctx ?? {}"
      />
    </div>
    }
  </div>
  <p class="page-card__caption">{{ captionFor($index) }}</p>
</div>
}
```

- [ ] **Step 5: Write the component SCSS**

```scss
// libs/ui/src/lib/paginated-sheet/paginated-sheet.scss
@use '../../styles/paper' as paper;

:host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}

.paginated-sheet__measure {
  position: absolute;
  left: -99999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.page-card-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.page-card {
  @include paper.paper-light;
  box-sizing: border-box;
  overflow: hidden;
  border: var(--border-width) solid var(--border-default);
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  font-family: var(--font-sans);
}

.page-card__cont {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-3);
}

.page-card__caption {
  // Chrome around the paper: use the app theme, not the pinned paper colours.
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  text-align: center;
}
```

> The paper mixin pins `--text-tertiary` on `.page-card`; because `.page-card__caption` sits **outside** `.page-card` (sibling in `.page-card-wrap`), it correctly inherits the app-theme token. Keep it a sibling, not a child.

- [ ] **Step 6: Export from the barrel**

Add to `libs/ui/src/index.ts`:

```ts
export * from './lib/paginated-sheet/paginate.util';
export * from './lib/paginated-sheet/paginated-sheet';
```

- [ ] **Step 7: Run the spec to verify it passes**

Run: `npx nx test ui --test-path-pattern=paginated-sheet`
Expected: PASS — both structure specs green.

- [ ] **Step 8: Commit**

```bash
git add libs/ui/src/lib/paginated-sheet/ libs/ui/src/styles/_paper.scss libs/ui/src/index.ts
git commit -m "feat(ui): paginated-sheet component with measure-pack-render page cards"
```

---

## Task 4: i18n keys for page-card copy

**Files:**

- Modify: `libs/i18n/src/lib/translations/translations.ts`

**Interfaces:**

- Produces i18n keys consumed by Tasks 5 & 6:
  - `documents.preview_page_of` — "Page {i} of {n}" / "Seite {i} von {n}"
  - `documents.preview_section_continued` — "{section} (cont.)" / "{section} (Fortsetzung)"
  - `documents.preview_block_overflow` — overflow warning.

- [ ] **Step 1: Find the existing documents block + the interpolation convention**

Run: `grep -n "documents.cv_preview\|cv_preview_empty\|documents\." libs/i18n/src/lib/translations/translations.ts | head`
Then read ~15 lines around the `documents.cv_preview_empty` key to confirm the object shape and how existing keys interpolate params (e.g. `{count}` placeholders and the `t()` signature).

- [ ] **Step 2: Add the three keys under `documents.` in BOTH the EN and DE maps**

English values:

```ts
'documents.preview_page_of': 'Page {i} of {n}',
'documents.preview_section_continued': '{section} (cont.)',
'documents.preview_block_overflow':
  'A block is too tall to fit one page — shorten it so the preview and PDF paginate cleanly.',
```

German values:

```ts
'documents.preview_page_of': 'Seite {i} von {n}',
'documents.preview_section_continued': '{section} (Fortsetzung)',
'documents.preview_block_overflow':
  'Ein Block ist zu hoch für eine Seite — kürze ihn, damit Vorschau und PDF sauber umbrechen.',
```

Match the exact placeholder/interpolation style the file already uses. If the project has an i18n-keys parity spec/test, keep EN and DE key sets identical.

- [ ] **Step 3: Run the i18n key parity check**

Run: `npx nx test i18n` (or `grep -rn "i18n-keys" apps libs` to locate the parity spec and run that project's tests).
Expected: PASS — EN/DE key sets match, no missing keys.

- [ ] **Step 4: Commit**

```bash
git add libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(i18n): page-card preview copy (page-of, continued, overflow)"
```

---

## Task 5: Wire cv-detail to the paginated sheet

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss`
- Test: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `PaginatedSheetComponent`, `SheetAtom`, `SheetGeometry` from `@applye/ui` (confirm the import path used elsewhere in the app, e.g. `grep -rn "from '@applye/ui'" apps/desktop/src | head`); `resolvePageSettings` (already imported at `cv-detail.component.ts:75`).

**Context:** The current preview is a single `#cvSheet` `.cvpreview` element (html ~706–868) with inline sections, plus `pageVars`, `sheetEl`, `pageCount`, `blockOverflow`, `ro`, `observeSheet`, `recomputePages`, `observeSheetEffect` (ts ~236–292) and a `.cvpreview__pagebar` row (~869) + warning. Sections rendered: personal_details (`__name/__title/__contact` + optional `__photo`), summary, skills, experience (per-entry `__entry`), education (per-entry `__entry`), languages. Replace the single sheet with `<lib-paginated-sheet>` fed by a flattened `atoms()` list; keep every inner markup fragment by moving it into `<ng-template>`s.

- [ ] **Step 1: Write/adjust the host spec first**

Open `cv-detail.component.spec.ts`. Replace any assertion about the single `.cvpreview` sheet, `.cvpreview__pagebar`, or the gradient guide with:

```ts
it('renders the paginated sheet in preview mode', () => {
  component.previewMode.set(true);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('lib-paginated-sheet')).toBeTruthy();
  expect(fixture.nativeElement.querySelector('.cvpreview__pagebar')).toBeNull();
});

it('builds one atom per experience entry', () => {
  // arrange a CV document with an experience section of 2 entries via the
  // component's existing test setup, then:
  const ids = component.atoms().map((a) => a.id);
  expect(ids).toContain('sec:experience:title');
  expect(ids.filter((id) => id.startsWith('sec:experience:e')).length).toBe(2);
});
```

Reuse the spec's existing document fixture/builder; if none exposes sections, add a minimal `CvContent` with a 2-entry experience section following the shapes in `document.model.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx nx test desktop --test-path-pattern=cv-detail.component`
Expected: FAIL — `atoms` is not a function / `lib-paginated-sheet` not found.

- [ ] **Step 3: Add the geometry + atoms builder to the component TS**

Add imports and a `geometry` computed (numbers, from `resolvePageSettings`), and an `atoms` computed. Add `PaginatedSheetComponent` to the component `imports`. Keep `previewMode`. Remove `pageVars`, `sheetEl`, `pageCount`, `ro`, `observeSheet`, `recomputePages`, `observeSheetEffect`, and the `ngOnDestroy` RO teardown (the component owns measurement now). Keep a `blockOverflow` signal, now set from the sheet's output.

```ts
// imports
import { PaginatedSheetComponent, SheetAtom, SheetGeometry } from '@applye/ui';

// in the @Component imports array: add PaginatedSheetComponent

// geometry from the resolved page (px)
readonly geometry = computed<SheetGeometry>(() => {
  const r = resolvePageSettings(this.style().page);
  const px = CvDetailComponent.PX_PER_MM;
  return {
    pageWidthPx: r.widthMm * px,
    pageHeightPx: r.heightMm * px,
    marginTopPx: r.margin.top * px,
    marginRightPx: r.margin.right * px,
    marginBottomPx: r.margin.bottom * px,
    marginLeftPx: r.margin.left * px,
  };
});

readonly blockOverflow = signal(false);

// TemplateRefs declared in the HTML (Step 4)
readonly headerTpl = viewChild.required<TemplateRef<unknown>>('headerTpl');
readonly summaryTpl = viewChild.required<TemplateRef<unknown>>('summaryTpl');
readonly sectionTitleTpl = viewChild.required<TemplateRef<unknown>>('sectionTitleTpl');
readonly skillsTpl = viewChild.required<TemplateRef<unknown>>('skillsTpl');
readonly expEntryTpl = viewChild.required<TemplateRef<unknown>>('expEntryTpl');
readonly eduEntryTpl = viewChild.required<TemplateRef<unknown>>('eduEntryTpl');
readonly languagesTpl = viewChild.required<TemplateRef<unknown>>('languagesTpl');

/** Flattens visible CV sections (in `order`) into ordered page atoms. */
readonly atoms = computed<SheetAtom[]>(() => {
  const doc = this.style(); // whatever signal already holds the CV content/sections
  const sections = /* visible sections sorted by order — reuse the existing
     preview ordering expression from the template/component */ [];
  const out: SheetAtom[] = [];
  const t = this.t();

  for (const section of sections) {
    switch (section.key) {
      case 'personal_details':
        out.push({ id: 'header', tpl: this.headerTpl(), ctx: { $implicit: section } });
        break;
      case 'summary':
        out.push({ id: 'summary', tpl: this.summaryTpl(), ctx: { $implicit: section } });
        break;
      case 'skills':
        out.push({ id: 'skills', tpl: this.skillsTpl(), ctx: { $implicit: section } });
        break;
      case 'languages':
        out.push({ id: 'languages', tpl: this.languagesTpl(), ctx: { $implicit: section } });
        break;
      case 'experience': {
        const label = t('documents.cv_section_experience'); // reuse the existing section-title key
        out.push({
          id: 'sec:experience:title',
          tpl: this.sectionTitleTpl(),
          ctx: { $implicit: label },
          sectionLabel: label,
          isSectionStart: true,
          glueToNext: true,
        });
        section.entries.forEach((entry, i) =>
          out.push({
            id: `sec:experience:e${i}`,
            tpl: this.expEntryTpl(),
            ctx: { $implicit: entry },
            sectionLabel: label,
          }),
        );
        break;
      }
      case 'education': {
        const label = t('documents.cv_section_education');
        out.push({
          id: 'sec:education:title',
          tpl: this.sectionTitleTpl(),
          ctx: { $implicit: label },
          sectionLabel: label,
          isSectionStart: true,
          glueToNext: true,
        });
        section.entries.forEach((entry, i) =>
          out.push({
            id: `sec:education:e${i}`,
            tpl: this.eduEntryTpl(),
            ctx: { $implicit: entry },
            sectionLabel: label,
          }),
        );
        break;
      }
      // 'photo' folds into the header render — skip as a standalone atom.
    }
  }
  return out;
});

readonly captionFn = (page: number, total: number): string =>
  this.t()('documents.preview_page_of', { i: page, n: total });
readonly continuationFn = (label: string): string =>
  this.t()('documents.preview_section_continued', { section: label });
```

Adjust the exact section-source expression and the existing section-title i18n keys to match the current template (read the current `.cvpreview__section-title` bindings around html:743–849 and reuse those keys verbatim — do not invent new ones). Confirm the `t()` call signature for interpolation params from Task 4 Step 1.

- [ ] **Step 4: Replace the preview markup in the HTML**

Replace the `.cvpreview-viewport` → `#cvSheet .cvpreview` block (and the `.cvpreview__pagebar` row) with a viewport that hosts `<lib-paginated-sheet>` plus the `<ng-template>`s carrying the _existing_ fragment markup (moved, not rewritten). Keep the `.cvpreview__*` classes on the fragments so their existing SCSS still applies.

```html
<div class="cvpreview-viewport">
  @if (previewMode()) {
  <lib-paginated-sheet
    [atoms]="atoms()"
    [geometry]="geometry()"
    [captionFn]="captionFn"
    [continuationFn]="continuationFn"
    (blockOverflow)="blockOverflow.set($event)"
  />
  } @if (blockOverflow()) {
  <div class="cvpreview__warning">{{ t()('documents.preview_block_overflow') }}</div>
  }
</div>

<!-- Atom templates: existing preview fragments moved verbatim. -->
<ng-template #headerTpl let-section>
  <!-- move here the current __name / __title / __contact / __photo markup -->
</ng-template>
<ng-template #summaryTpl let-section>
  <div class="cvpreview__section" [ngStyle]="sectionCss('summary')">
    <!-- current summary markup -->
  </div>
</ng-template>
<ng-template #sectionTitleTpl let-label>
  <h3 class="cvpreview__section-title">{{ label }}</h3>
</ng-template>
<ng-template #skillsTpl let-section>
  <div class="cvpreview__section" [ngStyle]="sectionCss('skills')">
    <!-- current skills markup -->
  </div>
</ng-template>
<ng-template #expEntryTpl let-entry>
  <div class="cvpreview__entry"><!-- current single-entry experience markup --></div>
</ng-template>
<ng-template #eduEntryTpl let-entry>
  <div class="cvpreview__entry"><!-- current single-entry education markup --></div>
</ng-template>
<ng-template #languagesTpl let-section>
  <div class="cvpreview__section" [ngStyle]="sectionCss('languages')">
    <!-- current languages markup -->
  </div>
</ng-template>
```

Note: the section-title used to live _inside_ each `.cvpreview__section`; now the title is its own atom (`sectionTitleTpl`) and the entries are separate atoms, so the entry templates must NOT re-render the title. The whole-block sections (summary/skills/languages) keep their own inline title as-is.

- [ ] **Step 5: Update the SCSS**

In `cv-detail.component.scss`: delete the `.cvpreview` sheet rule's `background-image: repeating-linear-gradient(...)`, `background-attachment`, `width/min-height/padding/background/border/box-shadow` sheet framing (the card framing now lives in the component). Delete `.cvpreview__pagebar`. Keep `.cvpreview-viewport`, `.cvpreview__warning`, and all `.cvpreview__*` content styles (name/title/contact/section/entry/etc.) — they still style the fragments inside the atoms. Keep `.cvpreview__photo`.

- [ ] **Step 6: Run host tests + typecheck**

Run: `npx nx test desktop --test-path-pattern=cv-detail.component`
Expected: PASS.
Run: `npm run type-check`
Expected: no errors in cv-detail.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/
git commit -m "feat(documents): cv preview renders discrete page cards"
```

---

## Task 6: Wire cover-letter-detail to the paginated sheet

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.html`
- Modify: `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.scss`
- Test: `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.spec.ts`

**Context:** The letter preview is a `.letter-sheet` element (html ~715+) with fixed-order blocks: address, date, subject, greeting, `bodyParagraphs[]`, closing, signature (model `CoverLetterContent`). No section titles → no `glueToNext`, no continuation. The letter SCSS reuses `.cvpreview__pagebar` (scss:597) and `.cvpreview__warning` (scss:603) and a `repeating-linear-gradient` (scss:624).

**Interfaces:**

- Consumes: `PaginatedSheetComponent`, `SheetAtom`, `SheetGeometry` from `@applye/ui`; the same `resolvePageSettings`-based geometry computed as Task 5 (copy the `geometry` + `captionFn` computeds; `continuationFn` still required by the input — pass an identity `(l) => l`, it is never invoked without `sectionLabel`).

- [ ] **Step 1: Write/adjust the host spec**

```ts
it('renders the paginated sheet in preview mode', () => {
  component.previewMode.set(true);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('lib-paginated-sheet')).toBeTruthy();
  expect(fixture.nativeElement.querySelector('.letter-sheet')).toBeNull();
});

it('emits one atom per body paragraph plus the fixed blocks', () => {
  // fixture letter with 3 body paragraphs:
  const ids = component.atoms().map((a) => a.id);
  expect(ids).toEqual([
    'address',
    'date',
    'subject',
    'greeting',
    'body:0',
    'body:1',
    'body:2',
    'closing',
    'signature',
  ]);
});
```

(If the fixture has no `subject`, omit `'subject'` — build the expected array from the fixture actually used.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx nx test desktop --test-path-pattern=cover-letter-detail.component`
Expected: FAIL.

- [ ] **Step 3: Add geometry + atoms builder to the letter component TS**

Copy the `geometry`, `blockOverflow`, `captionFn` members from Task 5. Add `continuationFn = (l: string) => l;`. Add TemplateRef viewChilds for each block, and:

```ts
readonly atoms = computed<SheetAtom[]>(() => {
  const c = /* the signal holding CoverLetterContent */;
  const out: SheetAtom[] = [];
  out.push({ id: 'address', tpl: this.addressTpl(), ctx: { $implicit: c.address } });
  out.push({ id: 'date', tpl: this.dateTpl(), ctx: { $implicit: c.date } });
  if (c.subject) out.push({ id: 'subject', tpl: this.subjectTpl(), ctx: { $implicit: c.subject } });
  out.push({ id: 'greeting', tpl: this.greetingTpl(), ctx: { $implicit: c.greeting } });
  c.bodyParagraphs.forEach((p, i) =>
    out.push({ id: `body:${i}`, tpl: this.bodyTpl(), ctx: { $implicit: p } }),
  );
  out.push({ id: 'closing', tpl: this.closingTpl(), ctx: { $implicit: c.closing } });
  out.push({ id: 'signature', tpl: this.signatureTpl(), ctx: { $implicit: c.signature } });
  return out;
});
```

Add `PaginatedSheetComponent` to the component `imports`. Remove the letter's own `pageVars`/`recomputePages`/`ResizeObserver`/`pageCount` machinery if present (mirror Task 5 Step 3).

- [ ] **Step 4: Replace the letter preview markup**

Replace the `.letter-sheet-viewport` → `.letter-sheet` block and the `.cvpreview__pagebar` row with the `<lib-paginated-sheet>` host + `<ng-template>`s carrying the existing letter block fragments (moved verbatim, classes kept). Keep the `.cvpreview__warning` for `blockOverflow`.

- [ ] **Step 5: Update the letter SCSS**

Delete the `.letter-sheet` sheet framing + `repeating-linear-gradient` (scss ~612–630), the `.cvpreview__pagebar` (597), and — since the CV component's copy is removed too — this `.cvpreview__warning` (603) may stay (letter still shows the warning). Keep block-content styles and `.letter-sheet-viewport`.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx nx test desktop --test-path-pattern=cover-letter-detail.component`
Expected: PASS.
Run: `npm run type-check`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cover-letter-detail/
git commit -m "feat(documents): cover-letter preview renders discrete page cards"
```

---

## Task 7: Global print block — cards to native flow

**Files:**

- Modify: `apps/desktop/src/styles.scss`

**Context:** The current `@media print` block (styles.scss:17–71) shows only `.cvpreview` / `.letter-sheet` and pins their paper colours inline. Those single sheets no longer exist; content now lives in `.page-card`s inside `lib-paginated-sheet`. Print must show the atoms in native browser flow (one continuous run the browser paginates via `@page`), hide the on-screen card framing + captions + the hidden measure column, and pin paper colours via the shared mixin.

- [ ] **Step 1: Rewrite the print block**

```scss
// apps/desktop/src/styles.scss
@use '../../../libs/ui/src/styles/paper' as paper;

@media print {
  // Hide everything, then reveal only the paginated sheet content.
  body.printing-cv * {
    visibility: hidden;
  }
  body.printing-cv lib-paginated-sheet,
  body.printing-cv lib-paginated-sheet * {
    visibility: visible;
  }

  // Drop the off-screen measure column and the on-screen card chrome so the
  // browser paginates the real content via @page.
  body.printing-cv .paginated-sheet__measure,
  body.printing-cv .page-card__caption {
    display: none !important;
  }

  body.printing-cv lib-paginated-sheet {
    @include paper.paper-light;
    position: absolute;
    inset: 0;
    display: block;
    gap: 0;
  }

  body.printing-cv .page-card-wrap,
  body.printing-cv .page-card {
    @include paper.paper-light;
    display: block;
    width: auto;
    height: auto;
    margin: 0;
    padding: 0; // @page supplies the real margins — avoid doubling
    border: 0;
    box-shadow: none;
    overflow: visible;
  }

  // Keep an atom from splitting across a printed page — matches the on-screen
  // packing so screen boundaries ≈ printed @page breaks.
  body.printing-cv .page-card__atom {
    break-inside: avoid;
  }
}
```

> Confirm the relative `@use` path to `libs/ui/src/styles/paper` from `apps/desktop/src/styles.scss` matches the existing `@use '../../../libs/ui/src/styles/global'` depth (same directory → same `../../../libs/ui/src/styles/` prefix).

- [ ] **Step 2: Build the desktop app (Angular build compiles the SCSS)**

Run: `npm run desktop:build`
Expected: build succeeds; no SCSS `@use`/mixin resolution errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles.scss
git commit -m "fix(documents): print paginated page cards as native @page flow"
```

---

## Task 8: Full verification + docs sync

**Files:**

- Modify: `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Run the full relevant test + lint + typecheck sweep**

```bash
npx nx test ui
npx nx test i18n
npx nx test desktop --test-path-pattern="cv-detail.component|cover-letter-detail.component"
npm run type-check
npm run lint
```

Expected: all green (one pre-existing unrelated failure, if any, noted — do not fix out of scope).

- [ ] **Step 2: Manual gate on a desktop dev build**

Run `npm run desktop:dev`. Verify, on the **dark** app theme:

1. CV preview shows discrete white cards, each captioned "Page 1 of N" / "Page 2 of N".
2. A long experience list splits between entries; the continuation card shows "Berufserfahrung (Fortsetzung)"/"Experience (cont.)" and no entry is cut mid-block.
3. Cover-letter preview shows white cards with per-paragraph splitting.
4. Cards are white in dark mode (screen == print).
5. Export PDF → the printed PDF's page breaks fall at the same atom boundaries as the on-screen cards (approximate — a one-line drift at an edge is acceptable).
6. An oversized single block shows the overflow warning.

Record the result (screenshots optional) in the PR description.

- [ ] **Step 3: Update CURRENT_STATE.md**

Under "Recently completed", add a one-line entry: discrete page-card preview (white cards, "Page i of N", entry-level splitting, shared `libs/ui` paginator, white sheet folded in) on `feat/preview-page-cards`, linking this plan + the spec. Update "Current branch / focus" and "Last updated".

- [ ] **Step 4: Commit**

```bash
git add docs/product/CURRENT_STATE.md
git commit -m "docs(documents): record page-card preview in current state"
```

---

## Self-Review Notes

- **Spec coverage:** measure→pack→render (T1, T3); entry-level atoms + glue + continuation (T1 glue, T3 continuation, T5 atom builder); oversized edge case (T1 stand-alone + T3 overflow output + T5/T6 warning); always-white cards + `%paper-light` dedupe (T2, T3, T7); print approximate/native + global-only rules (T7); shared `libs/ui` paginator (T3); both hosts (T5, T6); removes guides/pagebar (T5, T6); i18n EN+DE (T4); testing (pure T1, component T3, hosts T5/T6, manual T8). All spec sections mapped.
- **Print `@page` size/margins:** unchanged from PR #66 — `exportPdfWysiwyg()` still injects the `@page { size; margin }` rule and toggles `body.printing-cv`; this plan does not touch that method (only the CSS it relies on). Confirm during T5/T6 that the export button + `exportPdfWysiwyg()` stay intact.
- **Risk:** jsdom `offsetHeight === 0` means component specs can't assert real splitting — covered by the pure `paginate()` tests (T1) and the manual gate (T8), called out in T3.

import { resolvePageSettings } from '@applye/core';
import type { PageSettings } from '@applye/core';

/**
 * The WYSIWYG print protocol, shared by the CV and cover-letter editors.
 *
 * Both pages had this written out, and each carried a comment saying it mirrored
 * the other - which is the shape duplication takes just before it drifts. There
 * is exactly one protocol and it is fiddly in three places:
 *
 * 1. **The `@page` rule supplies the real margins.** The print stylesheet then
 *    zeroes each `.page-card`'s simulated padding and lets its height be
 *    content-driven, so the output has exact physical margins rather than
 *    full-bleed scaling, and a card that exactly filled a page does not round
 *    over into a trailing blank one.
 * 2. **The style element is reused, not appended.** A fresh `<style>` per export
 *    would leave one behind on every print.
 * 3. **`printing-cv` is cleared on `afterprint`, never synchronously.** Native
 *    macOS print through Tauri is async: `window.print()` returns before the page
 *    is rendered for print, so removing the class straight away strips the print
 *    styles before the snapshot and captures the whole app. Every
 *    `body.printing-cv` rule lives inside `@media print`, so a class left behind
 *    because `afterprint` never fired has no on-screen effect.
 *
 * `window.print` itself is deliberately the plain DOM call. Tauri's webview
 * plugin already overrides it on macOS to route through the native print command
 * (gated by the `core:webview:allow-print` capability); on Windows and Linux the
 * webview's built-in print is used directly. No `@tauri-apps/api` import is
 * needed or available for this in the installed SDK version.
 *
 * What is NOT here is anything about editors. The CV editor commits its inline
 * draft and waits for a stable frame before calling this, and clears its
 * selection on `beforeprint`; the cover-letter preview has no inline editing, so
 * it has neither. That asymmetry is correct rather than an omission.
 */

/** The element every print path reveals: the paginated sheet itself. */
export const PRINT_SUBTREE_SELECTOR = 'lib-paginated-sheet';

/**
 * The class marking each ancestor of the printed sheet, from its parent up to
 * `<body>`.
 *
 * **Why a class walked in code rather than a selector.** The print stylesheet
 * hid everything with `visibility: hidden` and revealed the sheet, and that
 * reveals but does not reclaim: `visibility` is defined to preserve layout, so
 * every hidden sibling of the sheet kept its full height in the printed flow.
 * While the sheet was pinned with `position: absolute` this cost nothing,
 * because it sat outside the flow entirely. The moment the flow was unclipped
 * so `@page` margins could reach every page, that borrowed height became real:
 * the first page's top inset was the page margin **plus** the height of the
 * hidden editor column above it, which is exactly what the native pass of
 * 2026-08-21 reported.
 *
 * `display: none` is what actually removes a box. The obstacle is that the
 * sheet sits deep in the tree, so hiding "everything else" has to spare its
 * ancestors, and the CSS way to say that is `:has()` - **which fails in the
 * wrong direction**. An engine that does not understand it drops the whole rule
 * and prints the entire application. Marking the chain here is deterministic,
 * needs no selector support, and can be asserted in jsdom, which none of the
 * layout behind this bug can.
 */
export const PRINT_PATH_CLASS = 'printing-path';

/**
 * Marks the sheet's ancestors so the stylesheet can drop everything else from
 * layout. Returns the undo, which the caller runs when printing ends.
 *
 * Total by design: with no sheet in the document nothing is marked and nothing
 * is hidden, because a print path that cannot find its subtree must leave the
 * page alone rather than blank it.
 */
export function markPrintPath(doc: Document = document): () => void {
  const sheet = doc.querySelector(PRINT_SUBTREE_SELECTOR);
  const marked: Element[] = [];
  for (let el = sheet?.parentElement; el; el = el.parentElement) {
    el.classList.add(PRINT_PATH_CLASS);
    marked.push(el);
  }
  return () => marked.forEach((el) => el.classList.remove(PRINT_PATH_CLASS));
}

const PAGE_RULE_ELEMENT_ID = 'wysiwyg-page-rule';
const PRINTING_BODY_CLASS = 'printing-cv';

/**
 * The `@page` declaration for these settings, in millimetres.
 *
 * **The margins belong here, and the round trip that proved it is worth
 * keeping.** `B4` reported the exported PDF ignoring the Style card's margins,
 * and the first attempt moved them into `.page-card`'s padding with
 * `margin: 0` here - on the reasoning that padding is ordinary box layout and
 * a page margin is a feature the renderer has to honour.
 *
 * That fixed page one and broke page two, and the native pass of 2026-08-21
 * showed why. `paginate.util.ts` packs content into
 * `pageHeightPx - marginTop - marginBottom`, so a card carrying the margins as
 * padding is **exactly one page tall**. Printed onto a sheet whose printable
 * area is smaller than the paper by any amount at all, it overflows, and
 * `break-inside: avoid` moves a whole section onto a second page - which has no
 * top inset, because padding belongs to a box and not to each page it spans.
 *
 * A page margin repeats on every page. That is the property this needs, and it
 * is why the tripwire that forbade `margin: 0` was right about the outcome even
 * though its stated reason described a different configuration.
 */
export function pageRuleFor(page: PageSettings | undefined): string {
  const r = resolvePageSettings(page);
  const m = r.margin;
  return (
    `@page { size: ${r.widthMm}mm ${r.heightMm}mm;` +
    ` margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`
  );
}

/**
 * Size the page, isolate the sheet, print. The caller is responsible for having
 * the document in its resting, printable state first - see the class note above.
 */
export function printWithPageRule(page: PageSettings | undefined): void {
  let el = document.getElementById(PAGE_RULE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = PAGE_RULE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  el.textContent = pageRuleFor(page);

  const unmarkPath = markPrintPath();
  const clearPrinting = (): void => {
    document.body.classList.remove(PRINTING_BODY_CLASS);
    unmarkPath();
    window.removeEventListener('afterprint', clearPrinting);
  };
  window.addEventListener('afterprint', clearPrinting);
  document.body.classList.add(PRINTING_BODY_CLASS);
  window.print();
}

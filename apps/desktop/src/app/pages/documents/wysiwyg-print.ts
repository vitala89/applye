/**
 * What the print paths do to the DOM before a snapshot is taken.
 *
 * The `@page` rule and the `window.print()` call that used to live here are
 * gone: both editors export through Rust now, which drives the print with the
 * document's own margins on `NSPrintInfo`, and a `@page` margin on top of that
 * was the same millimetres twice (`B4`). What is left is the one thing the
 * stylesheet cannot express on its own.
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

/**
 * Same marking as the hidden export windows, applied to a raw OS/browser
 * print (Cmd/Ctrl+P) in a live editor window. Without it the print stylesheet
 * never activates outside the two print routes, so a raw Cmd+P prints the
 * whole app shell instead of just the document. Returns the undo, which the
 * caller runs on `afterprint` - unlike the hidden windows, a live window has
 * an "after" to restore.
 */
export function beginLivePrint(doc: Document = document): () => void {
  const undoMark = markPrintPath(doc);
  doc.body.classList.add('printing-cv');
  return () => {
    doc.body.classList.remove('printing-cv');
    undoMark();
  };
}

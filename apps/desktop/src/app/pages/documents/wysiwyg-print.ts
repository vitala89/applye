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

const PAGE_RULE_ELEMENT_ID = 'wysiwyg-page-rule';
const PRINTING_BODY_CLASS = 'printing-cv';

/**
 * The `@page` declaration for these settings: the paper size, and **no page
 * margin at all**.
 *
 * It used to carry the four margins, and the exported PDF did not use them -
 * the content sat closer to the paper edge than the editor had shown (`B4`,
 * native gate walk of 2026-08-20). The engine that renders the export is
 * WebKit, and the printed output no longer asks it to honour a page margin:
 * the page is the whole sheet, and `.page-card` keeps the padding it already
 * draws on screen, so the inset is ordinary box layout that every engine has
 * always implemented.
 *
 * `resolvePageSettings` is still called for its size, and the margins it
 * resolves still reach the output - through the card, which is where the
 * preview gets them from too. That is the point: one source, not two.
 */
export function pageRuleFor(page: PageSettings | undefined): string {
  const r = resolvePageSettings(page);
  return `@page { size: ${r.widthMm}mm ${r.heightMm}mm; margin: 0; }`;
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

  const clearPrinting = (): void => {
    document.body.classList.remove(PRINTING_BODY_CLASS);
    window.removeEventListener('afterprint', clearPrinting);
  };
  window.addEventListener('afterprint', clearPrinting);
  document.body.classList.add(PRINTING_BODY_CLASS);
  window.print();
}

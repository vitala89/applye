/**
 * The wait between "the print window has its data" and "Rust may take the
 * snapshot", shared by the CV and cover-letter print routes.
 *
 * It was written twice, byte-identical in both components including this
 * comment, and the two print stores are what made that visible: once the data
 * load moved to `libs/application`, the only thing left in each component was
 * this (ADR-0005, amendment twenty-seven).
 *
 * **It lives in the app and not beside the stores** because every line of it
 * touches the DOM - `document.fonts`, `document.body` - and the application
 * layer owns state, not view timing.
 *
 * Plain timeouts throughout, never `requestAnimationFrame`: the print window is
 * off-screen and a hidden window may throttle frames to nothing, which would
 * hang the export rather than slow it. Every wait is capped for the same
 * reason.
 */
import { markPrintPath } from './wysiwyg-print';

export async function awaitPrintSettle(): Promise<void> {
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | void> =>
    Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

  if (document.fonts) {
    await withTimeout(document.fonts.ready, 3000);
  }
  // Two settle ticks for the paginated sheet's ResizeObserver measure pass.
  await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 250));
  // Same marking as the editor's own export: the print stylesheet drops from
  // layout everything that is not on the sheet's ancestor chain, and this
  // window has a chain too. Nothing un-marks it, deliberately - the window is
  // opened to be snapshotted and then closed, so there is no "after" to
  // restore, and an un-mark racing the snapshot could blank the export.
  markPrintPath();
  document.body.classList.add('printing-cv');
  await new Promise((r) => setTimeout(r, 50));
}

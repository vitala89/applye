import { awaitPrintSettle } from './print-settle.util';

describe('awaitPrintSettle', () => {
  afterEach(() => {
    document.body.classList.remove('printing-cv');
    jest.useRealTimers();
  });

  /**
   * Rust takes the snapshot of a body carrying `printing-cv`; without the class
   * the export renders the on-screen styling instead of the print sheet. This
   * is the one observable thing the wait does, and it now serves two routes.
   */
  it('marks the body printable once the waits are done', async () => {
    jest.useFakeTimers();
    const settled = awaitPrintSettle();
    await jest.runAllTimersAsync();
    await settled;
    expect(document.body.classList.contains('printing-cv')).toBe(true);
  });

  /**
   * The window is off-screen and a hidden window may never resolve
   * `document.fonts.ready`. The cap is what stops that hanging the export
   * rather than slowing it - this fails if the race is ever dropped.
   */
  it('gives up on fonts rather than waiting forever', async () => {
    jest.useFakeTimers();
    const original = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise(() => undefined) },
    });

    const settled = awaitPrintSettle();
    await jest.runAllTimersAsync();
    await expect(settled).resolves.toBeUndefined();

    if (original) Object.defineProperty(document, 'fonts', original);
    else delete (document as { fonts?: unknown }).fonts;
  });
});

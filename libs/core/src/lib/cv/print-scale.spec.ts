import { PRINT_PT_PER_PX, PRINT_PX_PER_MM, resolvePageSettings } from './cv-page.util';

/**
 * `B4`. These are not arithmetic checks - the arithmetic is one division. They
 * pin the two numbers that were **measured out of exported PDFs**, against the
 * printable boxes those same PDFs carry, so a later change to either has to
 * argue with the evidence rather than with a hunch.
 */
describe('the print scale', () => {
  // Both exports of the same CV carried this in every text matrix: one with
  // 20mm margins (0.8000236) and one with none (0.8008075). A tenth of a
  // percent apart while the printable box changed by 40mm in each direction,
  // which is what says "fixed mapping" rather than "shrink to fit".
  it('is the fixed pt-per-px mapping the exports show', () => {
    expect(PRINT_PT_PER_PX).toBeCloseTo(0.8, 5);
  });

  it('counts 90 CSS pixels to the inch, not the display convention of 96', () => {
    expect(PRINT_PX_PER_MM * 25.4).toBeCloseTo(90, 5);
    expect(PRINT_PX_PER_MM * 25.4).not.toBeCloseTo(96, 1);
  });

  // The measured numbers from the 20mm export: clip `56.69292 56.69292 481 728`
  // on A4, which is 481.6 x 728.6pt of printable area. Divided by the mapping
  // above that is 602.0 x 910.75 CSS px, and those are exactly the column the
  // paginator has to measure into and the height it has to pack.
  describe('an A4 page with 20mm margins, against the clip box of a real export', () => {
    const page = resolvePageSettings({
      size: 'a4',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    const px = PRINT_PX_PER_MM;

    it('gives the printable column width the export clipped to', () => {
      const columnPx = (page.widthMm - page.margin.left - page.margin.right) * px;

      expect(columnPx * PRINT_PT_PER_PX).toBeCloseTo(481.6, 0);
      expect(columnPx).toBeCloseTo(602.0, 0);
    });

    it('gives the usable height the export clipped to', () => {
      const usablePx = (page.heightMm - page.margin.top - page.margin.bottom) * px;

      expect(usablePx * PRINT_PT_PER_PX).toBeCloseTo(728.6, 0);
      expect(usablePx).toBeCloseTo(910.7, 0);
    });

    // What the bug was, kept as a number: the display convention models the
    // page 6.67% larger than the sheet, so the paginator packed 971px of
    // content where 911px could print and the rest was clipped away.
    it('is 6.67% shorter than the display convention that clipped the export', () => {
      const displayUsable = (page.heightMm - page.margin.top - page.margin.bottom) * (96 / 25.4);
      const printUsable = (page.heightMm - page.margin.top - page.margin.bottom) * px;

      expect(displayUsable / printUsable).toBeCloseTo(96 / 90, 5);
      expect(displayUsable - printUsable).toBeCloseTo(60.6, 0);
    });
  });

  it('maps a whole A4 sheet onto exactly A4 in points', () => {
    const page = resolvePageSettings({
      size: 'a4',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    expect(page.widthMm * PRINT_PX_PER_MM * PRINT_PT_PER_PX).toBeCloseTo(595.3, 0);
    expect(page.heightMm * PRINT_PX_PER_MM * PRINT_PT_PER_PX).toBeCloseTo(841.9, 0);
  });
});

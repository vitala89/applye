import { CV_STYLE_DEFAULT } from '@applye/core';
import { pageRuleFor, printWithPageRule } from './wysiwyg-print';

/**
 * The print protocol has three details that are each one line away from a broken
 * export, and none of them is visible in a passing build: the rule has to carry
 * the resolved millimetres, the `<style>` element has to be reused, and the body
 * class has to survive `window.print()` and be cleared on `afterprint`.
 */
describe('wysiwyg print', () => {
  let printed: number;
  const realPrint = window.print;

  beforeEach(() => {
    printed = 0;
    // jsdom does not implement window.print, so it must be replaced rather than
    // spied - calling through would throw "Not implemented".
    window.print = () => {
      printed += 1;
    };
    document.getElementById('wysiwyg-page-rule')?.remove();
    document.body.classList.remove('printing-cv');
  });

  afterEach(() => {
    window.print = realPrint;
    document.getElementById('wysiwyg-page-rule')?.remove();
    document.body.classList.remove('printing-cv');
  });

  describe('the @page rule', () => {
    // `B4`, and the round trip behind it. Moving the margins into the card's
    // padding with `margin: 0` here fixed page one and broke page two: the
    // paginator packs content into `pageHeight - margins`, so such a card is
    // exactly one page tall, overflows any printable area smaller than the
    // paper, and spills a section onto a page with no top inset. A page margin
    // repeats on every page; padding belongs to one box.
    it('carries the resolved size and all four margins, in millimetres', () => {
      const rule = pageRuleFor({
        size: 'a4',
        margin: { top: 1, right: 2, bottom: 3, left: 4 },
      });

      expect(rule).toContain('size: 210mm 297mm');
      expect(rule).toContain('margin: 1mm 2mm 3mm 4mm');
      expect(rule).not.toContain('margin: 0');
    });

    it('resolves defaults when the document carries no page settings', () => {
      const rule = pageRuleFor(undefined);

      expect(rule).toMatch(/^@page \{ size: \d+mm \d+mm; margin: (\d+mm ?){4}; \}$/);
    });

    it('follows the page size rather than hard-coding A4', () => {
      expect(pageRuleFor({ size: 'letter', margin: CV_STYLE_DEFAULT.page?.margin })).not.toContain(
        'size: 210mm 297mm',
      );
    });
  });

  describe('printing', () => {
    it('injects the rule, flags the body, and prints', () => {
      printWithPageRule({ size: 'a4', margin: { top: 5, right: 5, bottom: 5, left: 5 } });

      const el = document.getElementById('wysiwyg-page-rule') as HTMLStyleElement;
      expect(el).toBeTruthy();
      expect(el.textContent).toContain('margin: 5mm 5mm 5mm 5mm');
      expect(document.body.classList.contains('printing-cv')).toBe(true);
      expect(printed).toBe(1);
    });

    it('reuses the style element instead of appending one per export', () => {
      printWithPageRule({ size: 'a4', margin: { top: 5, right: 5, bottom: 5, left: 5 } });
      printWithPageRule({ size: 'a4', margin: { top: 9, right: 9, bottom: 9, left: 9 } });

      expect(document.querySelectorAll('#wysiwyg-page-rule')).toHaveLength(1);
      // ...and the second export's margins won, so the element is rewritten
      // rather than merely left in place.
      expect(document.getElementById('wysiwyg-page-rule')?.textContent).toContain(
        'margin: 9mm 9mm 9mm 9mm',
      );
    });

    it('keeps the body flagged past window.print, and clears it on afterprint', () => {
      printWithPageRule(undefined);
      // Native macOS print returns before the page is rendered, so clearing
      // synchronously would strip the print styles before the snapshot.
      expect(document.body.classList.contains('printing-cv')).toBe(true);

      window.dispatchEvent(new Event('afterprint'));
      expect(document.body.classList.contains('printing-cv')).toBe(false);
    });

    it('detaches its afterprint listener once it has run', () => {
      // Asserting the body class cannot see this: `clearPrinting` only removes a
      // class, so it is idempotent and a leaked listener leaves no trace in the
      // DOM. The property is that every handler this function attaches is
      // detached when it fires - otherwise each export adds one more, for the
      // life of the window. Counting is the only way to state it, which a
      // mutation removing the `removeEventListener` call proved by surviving a
      // class-based assertion.
      const added: EventListenerOrEventListenerObject[] = [];
      const removed: EventListenerOrEventListenerObject[] = [];
      const realAdd = window.addEventListener.bind(window);
      const realRemove = window.removeEventListener.bind(window);
      window.addEventListener = ((type: string, fn: EventListener, ...rest: unknown[]) => {
        if (type === 'afterprint') added.push(fn);
        return (realAdd as (...a: unknown[]) => void)(type, fn, ...rest);
      }) as typeof window.addEventListener;
      window.removeEventListener = ((type: string, fn: EventListener, ...rest: unknown[]) => {
        if (type === 'afterprint') removed.push(fn);
        return (realRemove as (...a: unknown[]) => void)(type, fn, ...rest);
      }) as typeof window.removeEventListener;

      try {
        printWithPageRule(undefined);
        window.dispatchEvent(new Event('afterprint'));
        printWithPageRule(undefined);
        window.dispatchEvent(new Event('afterprint'));

        expect(added).toHaveLength(2);
        expect(removed).toEqual(added);
      } finally {
        window.addEventListener = realAdd as typeof window.addEventListener;
        window.removeEventListener = realRemove as typeof window.removeEventListener;
      }
    });
  });
});

import * as fs from 'fs';
import * as path from 'path';

// Static guard for the document editors' disclosure animator
// (`app/pages/documents/editor-shell/_disclosure.scss`).
//
// `B2` from the native gate walk of 2026-08-20: the collapse animated
// `grid-template-rows` between `0fr` and `1fr`, WKWebView does not honour that
// transition, and a CV section that closed once would not re-open - an open
// chevron over an empty body. Tauri renders in WKWebView on macOS while every
// check in this repository runs in jsdom or Chrome, so **nothing here can
// reproduce the bug and nothing here can prove the fix.** Only a native pass
// can.
//
// What a test *can* do is stop the technique coming back. Angular unit tests
// never compile SCSS and jsdom has no layout, so this scans the source text -
// the same pattern `cv-print-css.spec.ts` and `followup-no-transmit.spec.ts`
// use for rules no fixture can reach.

const DISCLOSURE_PATH = path.join(__dirname, 'app/pages/documents/editor-shell/_disclosure.scss');

function disclosureCss(): string {
  return fs.readFileSync(DISCLOSURE_PATH, 'utf8');
}

/**
 * The declarations only. The comments in this partial name the technique they
 * replaced and the property they deliberately do not declare globally, so a
 * scan of the raw file matches its own explanation and every assertion below
 * would be testing the prose instead of the rules.
 */
function disclosureRules(): string {
  return disclosureCss()
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

/** The rule body of `.docedit-collapse`, without the modifier or the child rule. */
function collapseRule(): string {
  const css = disclosureRules();
  const start = css.indexOf('.docedit-collapse {');
  expect(start).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  expect(close).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

describe('the editor-shell disclosure animator', () => {
  // The regression itself. `fr` units in a transitioned `grid-template-rows` is
  // the exact construction WKWebView does not honour, and it reads as perfectly
  // correct in every engine this repository tests in.
  it('does not animate an fr-unit grid track', () => {
    const rules = disclosureRules();

    expect(rules).not.toContain('grid-template-rows');
    expect(rules).not.toContain('0fr');
    expect(rules).not.toContain('1fr');
  });

  it('collapses by height, which every engine lays out', () => {
    const rule = collapseRule();

    expect(rule).toContain('height: auto');
    expect(rule).toContain('transition: height');
    expect(disclosureRules()).toContain('.docedit-collapse--closed');
  });

  // Without this the closed content is visible rather than clipped, which is a
  // louder failure than the one being fixed.
  it('clips the closed content', () => {
    expect(collapseRule()).toContain('overflow: hidden');
  });

  // Scoped to the element rather than declared on `:root`: the property is
  // inherited, so a global declaration would quietly enable keyword
  // interpolation for every other transition in the app.
  it('enables keyword interpolation on the element, not globally', () => {
    expect(collapseRule()).toContain('interpolate-size: allow-keywords');
    expect(disclosureRules()).not.toContain(':root');
  });

  // The chevron already honoured it, and a collapse that keeps animating while
  // the chevron does not is the two halves disagreeing.
  it('still respects reduced motion', () => {
    const rules = disclosureRules();

    expect(rules).toContain('@media (prefers-reduced-motion: reduce)');
    expect(rules.match(/prefers-reduced-motion/g)?.length).toBe(2);
  });
});

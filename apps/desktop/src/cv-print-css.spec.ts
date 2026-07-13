import * as fs from 'fs';
import * as path from 'path';

// Static guard for the CV/cover-letter WYSIWYG print stylesheet
// (`apps/desktop/src/styles.scss`, `@media print { body.printing-cv ... }`).
// Angular unit tests never compile SCSS or render `@media print`, so there is
// no way to assert this behaviour through a component fixture — this test
// mirrors the `followup-no-transmit.spec.ts` pattern of scanning the actual
// source text instead. It locks in Task 6's verification requirement: export/
// print must contain no live-editor chrome (the contextual style panel) and
// no selection/scope-selector affordance (the click-to-select outline classes,
// including the per-element `.cvpreview__element-selected` dashed outline
// added in Phase D.2 — see the comment above this rule in styles.scss for why
// it is a defensive, currently-unreachable-in-practice guarantee rather than a
// fix for an observed leak: both print paths already clear the live selection
// before printing).

const STYLES_PATH = path.join(__dirname, 'styles.scss');

function printMediaBlock(content: string): string {
  const start = content.indexOf('@media print');
  expect(start).toBeGreaterThanOrEqual(0);
  // The print block is the last top-level rule in the file — slicing to the
  // end is sufficient and avoids a brace-matching parser for one test file.
  return content.slice(start);
}

/** Collapses all whitespace runs to a single space so the fixture regexes
 * don't have to hand-encode the file's exact line-wrapping. */
function normalize(css: string): string {
  return css.replace(/\s+/g, ' ');
}

describe('CV WYSIWYG print stylesheet hides all live-editor chrome', () => {
  const printBlock = normalize(printMediaBlock(fs.readFileSync(STYLES_PATH, 'utf-8')));

  it('hides the contextual live-style panel entirely', () => {
    expect(printBlock).toContain(
      'body.printing-cv .cvdetail__live-panel { display: none !important; }',
    );
  });

  it('strips the click-to-select, section-selected, AND per-element (Phase D.2) outlines in one shared rule', () => {
    // All three selection-chrome classes must share one `outline: none
    // !important` rule — a stray fourth rule that only covered a subset would
    // silently regress if a future edit missed one of them.
    expect(printBlock).toContain(
      'body.printing-cv .cvpreview__selectable, body.printing-cv .cvpreview__selected, ' +
        'body.printing-cv .cvpreview__element-selected { outline: none !important;',
    );
  });
});

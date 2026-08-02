import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The dragged card must sit under the pointer, not chase it.
 *
 * `.card` transitions `transform` for its hover lift. The CDK's drag preview is
 * a clone of that element moved by writing `transform: translate3d(...)` on
 * every pointer move, so the transition interpolated each write and the card
 * trailed 150ms behind the cursor. No unit test can see a frame of that - this
 * reads the stylesheets instead, and states the rule the fix depends on.
 */
const DIR = __dirname;

function read(file: string): string {
  return readFileSync(join(DIR, file), 'utf8');
}

/** The declarations of one top-level rule, by selector. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return '';
  return css.slice(at, css.indexOf('\n}', at));
}

describe('pipeline drag styles', () => {
  const board = read('pipeline.component.scss');
  const drag = read('_drag.scss');

  it('keeps the hover lift on the card', () => {
    expect(ruleBody(board, '.card')).toMatch(/transition:[\s\S]*transform/);
  });

  // The regression itself: given the rule above, the preview must opt out.
  it('cancels transitions on the drag preview', () => {
    expect(ruleBody(drag, '.cdk-drag-preview')).toMatch(/transition:\s*none/);
  });

  // Ordering is load-bearing: same specificity, so the later rule wins and the
  // drop animation survives `transition: none` on the preview.
  it('declares the drop animation after the preview', () => {
    expect(drag.indexOf('.cdk-drag-animating')).toBeGreaterThan(drag.indexOf('.cdk-drag-preview'));
    expect(ruleBody(drag, '.cdk-drag-animating')).toMatch(/transition:\s*transform/);
  });
});

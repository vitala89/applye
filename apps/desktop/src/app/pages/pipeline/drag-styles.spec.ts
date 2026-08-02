import { join } from 'node:path';
import { compile } from 'sass';

/**
 * The dragged card must sit under the pointer, not chase it.
 *
 * `.card` transitions `transform` for its hover lift. The CDK's drag preview is
 * a clone of that element moved by writing `transform: translate3d(...)` on
 * every pointer move, so the transition interpolated each write and the card
 * trailed 150ms behind the cursor, leaving an echo.
 *
 * The first attempt at this test asserted that `_drag.scss` contains
 * `transition: none` under `.cdk-drag-preview`. It passed, and the bug was still
 * there: `@use` must come first in a Sass file, so that rule was emitted
 * *before* `.card`, and at equal specificity the later rule wins. A text search
 * cannot see a cascade. This one compiles the stylesheet and resolves which
 * declaration actually wins for an element carrying both classes.
 */
const SHEET = join(__dirname, 'pipeline.component.scss');

interface Rule {
  selector: string;
  body: string;
  order: number;
}

/** Top-level rules of the compiled sheet, in source order. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  // Comments first: Sass emits `/* ... */` verbatim, and a comment sitting above
  // a rule would otherwise be read as part of its selector.
  const re = /([^{}]+)\{([^{}]*)\}/g;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let m: RegExpExecArray | null;
  let order = 0;
  while ((m = re.exec(css))) {
    for (const selector of m[1].split(',')) {
      out.push({ selector: selector.trim(), body: m[2], order: order++ });
    }
  }
  return out;
}

/**
 * Whether a class-only selector matches a standalone element with `classes`.
 * Selectors with combinators, elements or pseudos cannot, so they are skipped -
 * none of them apply to the preview, which the CDK moves out to the body.
 */
function matchesStandalone(selector: string, classes: Set<string>): boolean {
  if (!/^(\.[A-Za-z0-9_-]+)+$/.test(selector)) return false;
  return selector
    .split('.')
    .filter(Boolean)
    .every((c) => classes.has(c));
}

/** The declaration that wins for `property`: highest specificity, then latest. */
function winner(css: string, classes: string[], property: string): string | null {
  const set = new Set(classes);
  const candidates = rules(css)
    .filter((rule) => matchesStandalone(rule.selector, set))
    .flatMap((rule) => {
      const decl = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(rule.body);
      if (!decl) return [];
      // Class-only selectors, so specificity is just how many classes deep it is.
      const specificity = rule.selector.split('.').filter(Boolean).length;
      return [{ value: decl[1].trim(), specificity, order: rule.order }];
    })
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order);

  return candidates.at(-1)?.value ?? null;
}

describe('pipeline drag styles', () => {
  const css = compile(SHEET).css;

  it('keeps the hover lift on a card sitting in a column', () => {
    expect(winner(css, ['card'], 'transition')).toContain('transform');
  });

  // The regression, at the level it actually lives: the cascade.
  it('leaves the dragged preview with no transition at all', () => {
    expect(winner(css, ['card', 'cdk-drag-preview'], 'transition')).toBe('none');
  });

  // The drop animation is the one transform transition that is wanted, because
  // by then the pointer is gone.
  it('animates the drop, while the preview is still on screen', () => {
    expect(winner(css, ['card', 'cdk-drag-preview', 'cdk-drag-animating'], 'transition')).toContain(
      'transform',
    );
  });
});

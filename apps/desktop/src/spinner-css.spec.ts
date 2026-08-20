import * as fs from 'fs';
import * as path from 'path';

// Static guard for the rotating loader icons.
//
// `B10` from the native gate walk of 2026-08-20: the "still running" chip's
// circle did not rotate around its own centre, it wandered. The cause is a
// mechanism this repository had already measured once, in
// `libs/ui/src/styles/_button.scss`: a `<lucide-icon>` wrapper is a **line
// box**, so it reserves descender space below the baseline - about 1.84px,
// whatever the icon measures. The animation sits on that wrapper, so a 16px
// glyph rotated about the centre of a 17.84px box, roughly 0.92px off its own.
//
// The fix is a box that equals the glyph: a flex box blockifies the inline
// `<svg>`, and the line box goes away. That is invisible to a unit test - jsdom
// has no layout, and these are `@media`-free component stylesheets that Angular
// never compiles here - so this scans the source text instead, the same pattern
// `cv-print-css.spec.ts`, `disclosure-css.spec.ts` and
// `followup-no-transmit.spec.ts` use for rules no fixture can reach.
//
// **It is a guard, not evidence.** Whether the circle now turns on its centre
// is a thing only a screen can say.

/** Every rotating icon that sits on a `<lucide-icon>` wrapper, and its rule. */
const SPINNERS = [
  {
    file: 'app/layout/shell-layout.component.scss',
    selector: '&__spin',
    what: 'the resume-tailoring chip, the one the walk reported',
  },
  {
    file: 'app/shared/job-identity-prompt/job-identity-badge.component.scss',
    selector: '&__spin',
    what: 'the job-identity badge',
  },
  {
    file: 'app/pages/settings/settings-danger-zone/settings-danger-zone.component.scss',
    selector: '.spin',
    what: 'the factory-reset button',
  },
] as const;

function ruleAfter(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  expect(close).toBeGreaterThan(open);
  return css
    .slice(open + 1, close)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('the rotating loader icons', () => {
  it.each(SPINNERS)('$what rotates on a box that is its glyph', ({ file, selector }) => {
    const css = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const rule = ruleAfter(css, selector);

    expect(rule).toContain('animation:');
    // `inline-flex` rather than `block`: these sit beside text, and a flex box
    // is what stops the inline svg reserving a line box's descender space.
    expect(rule).toContain('display: inline-flex');
  });

  // The onboarding spinner is deliberately absent from the list above: it is a
  // bordered `<span>` with an explicit 14px square, so its box already is the
  // circle it draws. Asserted rather than left to memory, because "why is that
  // one not in the list" is the question a later reader will have.
  it('leaves the bordered-span spinner alone, because its box already is its circle', () => {
    const css = fs.readFileSync(
      path.join(__dirname, 'app/core/onboarding/_onboarding-shell.scss'),
      'utf8',
    );
    const rule = ruleAfter(css, '.ob__spinner');

    expect(rule).toContain('width: 14px');
    expect(rule).toContain('height: 14px');
    expect(rule).toContain('border-radius: 50%');
  });
});

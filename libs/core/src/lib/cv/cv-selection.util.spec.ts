import { leafPath } from './cv-selection.util';

describe('leafPath', () => {
  // Regression (Phase D.2 review fix): the preview template used to spell
  // each leaf's path out as a raw string literal at two independent call
  // sites (`leafDraft('<path>', ...)` and `selectLeaf(..., '<path>')`),
  // risking silent drift between the transient draft key and the emitted/
  // persisted `elementPath`. `leafPath` is now the single source of truth
  // both call sites build from - asserted here against the exact strings
  // already persisted in `elementStyles` and used as draft ids.
  it('returns the canonical string for the representative leaves', () => {
    expect(leafPath('summary')).toBe('summary');
    expect(leafPath('exp', 1, 'role')).toBe('exp.1.role');
    expect(leafPath('exp', 1, 'bullet', 0)).toBe('exp.1.bullet.0');
    expect(leafPath('skills', 0, 'values')).toBe('skills.0.values');
    expect(leafPath('lang', 0, 'language')).toBe('lang.0.language');
  });

  it('also covers the pd.<field> and edu.<i>.<field> shapes', () => {
    expect(leafPath('pd', 'fullName')).toBe('pd.fullName');
    expect(leafPath('edu', 0, 'degree')).toBe('edu.0.degree');
  });
});

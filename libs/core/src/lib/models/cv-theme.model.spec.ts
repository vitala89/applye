import {
  CV_THEME_CLASSIC,
  CV_THEME_AURORA,
  getBuiltinTheme,
  themeStyleSeed,
  themeCssVars,
} from './cv-theme.model';

describe('cv-theme model', () => {
  it('exposes stable built-in ids', () => {
    expect(CV_THEME_CLASSIC.id).toBe(1);
    expect(CV_THEME_AURORA.id).toBe(2);
  });

  it('getBuiltinTheme falls back to Classic for undefined/unknown', () => {
    expect(getBuiltinTheme(undefined).id).toBe(1);
    expect(getBuiltinTheme(999).id).toBe(1);
    expect(getBuiltinTheme(2).id).toBe(2);
  });

  it('Aurora style seed carries teal accent + Lato', () => {
    const seed = themeStyleSeed(CV_THEME_AURORA);
    expect(seed.accentColorHex).toBe('#1B7464');
    expect(seed.fontFamily).toBe('Lato');
  });

  it('Classic css vars are visually neutral (no rules, inherit company)', () => {
    const v = themeCssVars(CV_THEME_CLASSIC);
    expect(v['--cv-company-color']).toBe('inherit');
    expect(v['--cv-header-rule-width']).toBe('0pt');
    expect(v['--cv-role-style']).toBe('normal');
  });

  it('Aurora css vars apply accent rules + italic role', () => {
    const v = themeCssVars(CV_THEME_AURORA);
    expect(v['--cv-company-color']).toBe('var(--cv-accent)');
    expect(v['--cv-role-style']).toBe('italic');
    expect(v['--cv-section-rule-width']).toBe('0.8pt');
    expect(v['--cv-accent']).toBe('#1B7464');
  });
});

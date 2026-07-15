import type { CvFontWeight, CvStyle } from './document.model';

export interface CvThemeTokens {
  accentHex: string;
  mutedHex: string;
  fontFamily: string;
  baseSizePt: number;
  fontWeight: CvFontWeight;
}

export interface CvThemeHeader {
  titleColor: 'accent' | 'text';
  contactLayout: 'inline-pipe' | 'stacked';
  ruleWeightPt: number;
  ruleColor: 'accent' | 'muted' | 'none';
}

export interface CvThemeSectionHeader {
  case: 'upper' | 'none';
  color: 'accent' | 'text';
  ruleWeightPt: number;
  ruleColor: 'accent' | 'muted' | 'none';
}

export interface CvThemeEntry {
  companyColor: 'accent' | 'text';
  roleItalic: boolean;
  showIndustry: boolean;
  ruleWeightPt: number;
  ruleColor: 'accent' | 'muted' | 'none';
}

export interface CvThemeBullets {
  marker: 'disc' | 'textbullet';
}

/** A CV visual theme — pure typed data, no CSS/HTML/JS. Renders via
 * `themeCssVars` (custom properties) + `themeStyleSeed` (CvStyle defaults). */
export interface CvThemeDescriptor {
  id: number;
  name: string;
  version: number;
  tokens: CvThemeTokens;
  header: CvThemeHeader;
  sectionHeader: CvThemeSectionHeader;
  entry: CvThemeEntry;
  bullets: CvThemeBullets;
}

export const CV_THEME_CLASSIC: CvThemeDescriptor = {
  id: 1,
  name: 'Classic',
  version: 1,
  tokens: {
    accentHex: '#333333',
    mutedHex: '#666666',
    fontFamily: 'Calibri',
    baseSizePt: 11,
    fontWeight: 400,
  },
  header: { titleColor: 'text', contactLayout: 'stacked', ruleWeightPt: 0, ruleColor: 'none' },
  sectionHeader: { case: 'upper', color: 'text', ruleWeightPt: 0, ruleColor: 'none' },
  entry: {
    companyColor: 'text',
    roleItalic: false,
    showIndustry: false,
    ruleWeightPt: 0,
    ruleColor: 'none',
  },
  bullets: { marker: 'disc' },
};

export const CV_THEME_AURORA: CvThemeDescriptor = {
  id: 2,
  name: 'Aurora',
  version: 1,
  tokens: {
    accentHex: '#1B7464',
    mutedHex: '#666666',
    fontFamily: 'Lato',
    baseSizePt: 10,
    fontWeight: 400,
  },
  header: {
    titleColor: 'accent',
    contactLayout: 'inline-pipe',
    ruleWeightPt: 0.8,
    ruleColor: 'accent',
  },
  sectionHeader: { case: 'upper', color: 'accent', ruleWeightPt: 0.8, ruleColor: 'accent' },
  entry: {
    companyColor: 'accent',
    roleItalic: true,
    showIndustry: true,
    ruleWeightPt: 0.4,
    ruleColor: 'muted',
  },
  bullets: { marker: 'textbullet' },
};

export const CV_THEMES_BUILTIN: Record<number, CvThemeDescriptor> = {
  [CV_THEME_CLASSIC.id]: CV_THEME_CLASSIC,
  [CV_THEME_AURORA.id]: CV_THEME_AURORA,
};

export function getBuiltinTheme(id: number | undefined): CvThemeDescriptor {
  return (id != null && CV_THEMES_BUILTIN[id]) || CV_THEME_CLASSIC;
}

export function themeStyleSeed(
  theme: CvThemeDescriptor,
): Pick<CvStyle, 'fontFamily' | 'fontSizePt' | 'fontWeight' | 'accentColorHex'> {
  return {
    fontFamily: theme.tokens.fontFamily,
    fontSizePt: theme.tokens.baseSizePt,
    fontWeight: theme.tokens.fontWeight,
    accentColorHex: theme.tokens.accentHex,
  };
}

/** The section-title rule a theme draws by itself, as concrete values, or
 * `null` when the theme draws none (Classic) and the neutral CSS default
 * applies instead.
 *
 * Concrete numbers — not the `--cv-*` vars `themeCssVars` emits — because the
 * live-style panel has to SHOW this as the line's size/colour when the user
 * hasn't set their own. It stays theme data only: the neutral fallback lives in
 * CSS tokens (`_paper.scss`, which forbids forking its values), so a title with
 * no theme rule and no override reads as Inherit rather than a copied hex. */
export function themeTitleRule(
  theme: CvThemeDescriptor,
): { widthPt: number; colorHex: string } | null {
  const sh = theme.sectionHeader;
  if (sh.ruleColor === 'none') return null;
  return {
    widthPt: sh.ruleWeightPt,
    colorHex: sh.ruleColor === 'accent' ? theme.tokens.accentHex : theme.tokens.mutedHex,
  };
}

function colorVar(c: 'accent' | 'muted' | 'text' | 'none'): string {
  switch (c) {
    case 'accent':
      return 'var(--cv-accent)';
    case 'muted':
      return 'var(--cv-muted)';
    case 'text':
      return 'inherit';
    case 'none':
      return 'transparent';
  }
}

function ruleWidth(weightPt: number, color: 'accent' | 'muted' | 'none'): string {
  return color === 'none' ? '0pt' : `${weightPt}pt`;
}

/** CSS custom properties for one theme, applied on the preview viewport and
 * inherited into every page card. Classic's values equal the SCSS defaults so
 * Classic renders unchanged. */
export function themeCssVars(theme: CvThemeDescriptor): Record<string, string> {
  const t = theme;
  return {
    '--cv-accent': t.tokens.accentHex,
    '--cv-muted': t.tokens.mutedHex,
    '--cv-section-case': t.sectionHeader.case === 'upper' ? 'uppercase' : 'none',
    '--cv-section-rule-width': ruleWidth(t.sectionHeader.ruleWeightPt, t.sectionHeader.ruleColor),
    '--cv-section-rule-color': colorVar(t.sectionHeader.ruleColor),
    '--cv-header-rule-width': ruleWidth(t.header.ruleWeightPt, t.header.ruleColor),
    '--cv-header-rule-color': colorVar(t.header.ruleColor),
    '--cv-title-color': colorVar(t.header.titleColor),
    '--cv-company-color': colorVar(t.entry.companyColor),
    '--cv-role-style': t.entry.roleItalic ? 'italic' : 'normal',
    '--cv-entry-rule-width': ruleWidth(t.entry.ruleWeightPt, t.entry.ruleColor),
    '--cv-entry-rule-color': colorVar(t.entry.ruleColor),
  };
}

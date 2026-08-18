// Page geometry shared by both document kinds: size, margins and their preset.
// Portrait only, millimetres, clamped at the boundary rather than in the model.

export type PageSize = 'a4' | 'letter';
export type PageMarginPreset = 'narrow' | 'normal' | 'wide';

/** Four-side page margins in millimetres. Each side clamped to [0,50] at
 * resolve time (see resolvePageSettings). */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Page geometry for CV / cover-letter export + preview. Portrait only.
 * Stored inside `style_json`; absent resolves to A4 / 20mm margins.
 * Legacy `style_json` may hold `margin` as a `PageMarginPreset` string -
 * the read path (resolvePageSettings) maps it to mm. */
export interface PageSettings {
  size: PageSize;
  margin: PageMargins;
}

export const PAGE_SETTINGS_DEFAULT: PageSettings = {
  size: 'a4',
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
};

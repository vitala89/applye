import { TranslationMap } from './types';

/**
 * Layers a partially translated locale over English.
 *
 * The merge is deep on purpose. A shallow spread replaces a whole section, so
 * a locale that translates ten of a section's eleven keys loses the eleventh
 * entirely - and `resolve()` renders a missing key as the key itself, so the
 * user sees `actions.close` where a label should be. Deep merging means a
 * partial locale only ever overrides the leaves it actually translates, and a
 * key added to `en` later keeps working in every locale until it is translated.
 */
export function stub(base: TranslationMap, overrides: Partial<TranslationMap>): TranslationMap {
  const merged: TranslationMap = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] =
      isPlainObject(current) && isPlainObject(value) ? stub(current, value) : (value as unknown);
  }
  return merged;
}

function isPlainObject(value: unknown): value is TranslationMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

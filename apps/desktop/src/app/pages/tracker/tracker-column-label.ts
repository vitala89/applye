import { TrackerColumnDef } from '@applye/application';

/**
 * A column's name in the **UI** language.
 *
 * This cannot live in `TrackerColumnsStore`: the store deliberately holds no
 * `TranslateService`, because the same column is named in the UI language on
 * this screen and in the report's own language on the exported sheet
 * (ADR-0005, amendment eight). So the store holds the column and the caller
 * supplies the words - `t` is passed in rather than injected.
 *
 * It lives here, next to the page, rather than in `libs/application`, because
 * three components under `pages/tracker/` need it and nothing outside does.
 * Widening a library's public surface for that would be a bigger change than
 * the problem, and one that goes through the decision gate; a local module does
 * not (ADR-0005, amendment twenty-two).
 */
export function trackerColumnLabel(col: TrackerColumnDef, t: (key: string) => string): string {
  return col.custom ? (col.label ?? '') : t(col.labelKey ?? '');
}

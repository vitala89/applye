/**
 * Selecting a leaf in the live CV preview, and reading its text back.
 *
 * Split out of `cv-content.util.ts`, which was 596 lines against a 400 budget
 * and held three unrelated jobs. This one is the identity of a click target:
 * `leafPath` builds the canonical id and `cvLeafText` is its inverse. The same
 * string is both the inline-edit draft key and the `elementStyles` override
 * key, which is what keeps "which leaf is this" answered in one place.
 */
import type {
  CvEducationSection,
  CvExperienceEntry,
  CvExperienceSection,
  CvLanguagesSection,
  CvPersonalDetailsSection,
  CvSection,
  CvSectionKey,
  CvSkillsSection,
  CvSummarySection,
} from '../models/cv-content.model';
import type { CvBorderStyle, CvElementStyle } from '../models/cv-style.model';

import { buildContactLine } from './cv-page.util';

/** A semantic click target in the live CV preview: which section, which
 * styling scope (body text vs. section title), and - for a body click that
 * landed on a specific leaf - which element the user selected. Consumed by
 * the contextual `CvLiveStylePanelComponent`.
 *
 * `elementPath` is additive on top of section-level gating: it is the SAME
 * transient draft-id string already passed to `CvPreviewComponent.leafDraft`
 * for that leaf (e.g. `'summary'`, `'exp.1.role'`, `'exp.1.bullet.0'`,
 * `'skills.0.values'`, `'lang.0.language'`) - one string, reused as both the
 * inline-edit draft key and the `elementStyles` override key, so there is a
 * single source of truth for "which leaf is this" with no separate mapping
 * table to keep in sync. It is only ever set alongside `part: 'body'`; a
 * section-title selection never carries one. Absence means the whole
 * section body is the target (no single leaf singled out), matching the
 * pre-existing (Phase D) behaviour. */
export interface CvPreviewSelection {
  sectionKey: CvSectionKey;
  part: 'body' | 'title';
  elementPath?: string;
}

/** The three body styling scopes offered by the live panel, narrowing from
 * most specific to least. For a title selection only two are used:
 * `section` = "this title" (per-section title override), `document` = "all
 * titles" (the document-wide `titleStyle`). */
export type CvStyleScope = 'element' | 'section' | 'document' | 'bullets';

/** A scope-tagged change emitted by `CvLiveStylePanelComponent`. The parent
 * maps `(selection.part, scope)` to the correct write target/reducer (see the
 * plan's mapping table). `patch` carries the cleaned body/title font fields
 * (`colorHex` only when the user actually picked a colour - the no-accent-leak
 * rule); `titleBorder` (title selections only) carries the section-title
 * underline, with `null` meaning inherit/clear; `titleRuleWidth` /
 * `titleRuleColor` (title selections only) carry the underline thickness (pt)
 * and colour, `null` meaning inherit/clear; `reset` requests a per-scope
 * reset. Exactly one of `patch` / `titleBorder` / `titleRuleWidth` /
 * `titleRuleColor` / `reset` is meaningful per emission. */
export interface CvStylePanelChange {
  scope: CvStyleScope;
  patch?: Partial<CvElementStyle>;
  titleBorder?: CvBorderStyle | null;
  titleRuleWidth?: number | null;
  titleRuleColor?: string | null;
  /** Section BODY-rule (divider) thickness/colour - carried on body
   * selections for sections that draw a rule (personal details, experience);
   * always written at section scope. `null` clears back to the theme. */
  bodyRuleWidth?: number | null;
  bodyRuleColor?: string | null;
  /** Section BODY-rule style - `'none'` turns the divider off, `null` clears
   * back to the theme's rule. Section scope, same as the width/colour above. */
  bodyBorder?: CvBorderStyle | null;
  /** In-line item separator (e.g. the `|` between languages) colour and size
   * (pt); section-level, `null` clears back to the default. */
  separatorColor?: string | null;
  separatorSize?: number | null;
  reset?: boolean;
}

/** Builds the canonical leaf-path string - the single source of truth for a
 * leaf's identity, consumed at every place that currently spells the same
 * path out as a raw template literal: `leafDraft`/`onLeafInput`/
 * `onLeafEscape` (the transient draft key) and `selectLeaf`/`selectPart`/
 * `onSelectKey` (the emitted `CvPreviewSelection.elementPath`, i.e. the
 * persisted `elementStyles` override key). Segments are joined with `.`,
 * reproducing every leaf id already in use, byte-for-byte:
 * `leafPath('summary')` → `'summary'`; `leafPath('pd', 'fullName')` →
 * `'pd.fullName'`; `leafPath('exp', 1, 'role')` → `'exp.1.role'`;
 * `leafPath('exp', 1, 'bullet', 0)` → `'exp.1.bullet.0'`;
 * `leafPath('edu', 0, 'degree')` → `'edu.0.degree'`;
 * `leafPath('skills', 0, 'values')` → `'skills.0.values'`;
 * `leafPath('lang', 0, 'language')` → `'lang.0.language'`. */
export function leafPath(kind: string, ...parts: (string | number)[]): string {
  return [kind, ...parts].join('.');
}

/** Plain text of the leaf a `CvPreviewSelection.elementPath` targets - the
 * inverse of `leafPath`, used to preview the SELECTED content in the live-style
 * panel's sample swatch. Returns '' for a pathless (whole-part) selection or a
 * title (the parent resolves a title's text from its section label instead). */
export function cvLeafText(sections: CvSection[], sel: CvPreviewSelection | null): string {
  if (!sel || sel.part === 'title' || !sel.elementPath) return '';
  const section = sections.find((s) => s.key === sel.sectionKey);
  if (!section) return '';
  const seg = sel.elementPath.split('.');
  switch (seg[0]) {
    case 'summary':
      return (section as CvSummarySection).text ?? '';
    case 'pd': {
      const pd = section as CvPersonalDetailsSection;
      return seg[1] === 'fullName'
        ? (pd.fullName ?? '')
        : seg[1] === 'title'
          ? (pd.title ?? '')
          : seg[1] === 'contact'
            ? buildContactLine(pd, { includeBirthdate: false, includeMaritalStatus: false })
            : '';
    }
    case 'exp': {
      const entry = (section as CvExperienceSection).entries[Number(seg[1])];
      if (!entry) return '';
      if (seg[2] === 'bullet') return entry.bullets?.[Number(seg[3])] ?? '';
      return (entry[seg[2] as keyof CvExperienceEntry] as string | undefined) ?? '';
    }
    case 'skills': {
      const group = (section as CvSkillsSection).groups[Number(seg[1])];
      if (!group) return '';
      return seg[2] === 'label' ? group.label : group.values.join(', ');
    }
    case 'lang': {
      const items = (section as CvLanguagesSection).items;
      // `lang` (no index) is the whole languages line; `lang.<i>.language` is
      // one entry.
      return seg.length === 1
        ? items.map((it) => it.language).join(', ')
        : (items[Number(seg[1])]?.language ?? '');
    }
    case 'edu': {
      const entry = (section as CvEducationSection).entries[Number(seg[1])];
      if (!entry) return '';
      switch (seg[2]) {
        case 'degree':
          return entry.degree ?? '';
        case 'institution':
          return entry.institution ?? '';
        case 'startDate':
          return entry.startDate ?? '';
        case 'endDate':
          return entry.endDate ?? '';
        default:
          return [entry.degree, entry.institution].filter(Boolean).join(', ');
      }
    }
    default:
      return '';
  }
}

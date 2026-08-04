import {
  CvBorderStyle,
  CvContent,
  CvEducationSection,
  CvElementStyle,
  CvExperienceEntry,
  CvExperienceSection,
  CvLanguagesSection,
  CvParsedContent,
  CvPersonalDetailsSection,
  CvSection,
  CvSectionKey,
  CvSkillGroup,
  CvSkillsSection,
  CvSummarySection,
  CvTemplate,
  PageMargins,
  PageSettings,
} from '@applye/core';

// Style editing, entry editing and skill-response parsing live in their own
// files - this module was 1245 lines against a 400 budget and held four
// unrelated jobs. They are re-exported here rather than imported directly by
// every consumer, because splitting a module costs each consumer one import
// line and three of them are already over budget: the size gate refused that
// version, which is the whole reason those files are separate now. Import from
// the specific module in new code.
export * from './cv-style.util';
export * from './cv-entry.util';
export * from './cv-parse.util';

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

/** Fallback order when a template has no `sectionsJson` (should not happen
 * for the seeded built-ins, but keeps the builder total). */
const DEFAULT_SECTION_ORDER: CvSectionKey[] = [
  'personal_details',
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
];

/** Visible sections in display order - what the preview (and the real
 * export) actually renders, as opposed to the constructor's full
 * edit-everything list. */
export function orderedVisibleSections(sections: CvSection[]): CvSection[] {
  return sections
    .filter((s) => s.visible)
    .slice()
    .sort((a, b) => a.order - b.order);
}

/**
 * Returns the content with the profile photo applied to its photo section:
 * visible, carrying `dataUri`, keeping whatever placement was already chosen.
 * Most templates seed no photo section at all, so one is created and pinned
 * ahead of everything else (a photo belongs at the top of the identity block).
 * Pure - the caller decides whether to persist the result.
 */
export function withCvPhoto(content: CvContent, dataUri: string): CvContent {
  const existing = content.sections.find((s) => s.key === 'photo');
  if (existing) {
    return {
      sections: content.sections.map((s) =>
        s.key === 'photo' ? { ...s, visible: true, dataUri } : s,
      ),
    };
  }
  const minOrder = content.sections.reduce((min, s) => Math.min(min, s.order), 0);
  const photo: Extract<CvSection, { key: 'photo' }> = {
    key: 'photo',
    order: minOrder - 1,
    visible: true,
    dataUri,
  };
  return { sections: [photo, ...content.sections] };
}

export function templateSectionOrder(template: CvTemplate | null): CvSectionKey[] {
  if (!template?.sectionsJson) return DEFAULT_SECTION_ORDER;
  try {
    const keys = JSON.parse(template.sectionsJson) as CvSectionKey[];
    return keys.length ? keys : DEFAULT_SECTION_ORDER;
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
}

/** Builds a full `CvContent` from a `cv-import`/`cv-generate-baseline`
 * parse result, laid out per the chosen template's section order and
 * photo toggle. Layout/order is deterministic code; only the field content
 * came from the AI (or the user's own upload). */
export function buildCvContent(parsed: CvParsedContent, template: CvTemplate | null): CvContent {
  const order = templateSectionOrder(template);
  // personal_details is identity, not layout - guarantee it regardless of the
  // template's section list (some built-ins omit it). Force it first.
  const keys: CvSectionKey[] = order.includes('personal_details')
    ? order
    : ['personal_details', ...order];
  const sections: CvSection[] = keys.map((key, index) => sectionFor(key, index, parsed, template));
  return { sections };
}

function sectionFor(
  key: CvSectionKey,
  order: number,
  parsed: CvParsedContent,
  template: CvTemplate | null,
): CvSection {
  switch (key) {
    case 'photo':
      return { key: 'photo', order, visible: !!template?.includePhoto };
    case 'personal_details':
      return {
        key: 'personal_details',
        order,
        visible: true,
        fullName: parsed.personalDetails.fullName ?? '',
        title: parsed.personalDetails.title ?? undefined,
        email: parsed.personalDetails.email ?? undefined,
        phone: parsed.personalDetails.phone ?? undefined,
        address: parsed.personalDetails.address ?? undefined,
        website: parsed.personalDetails.website ?? undefined,
        linkedin: parsed.personalDetails.linkedin ?? undefined,
        birthDate: undefined,
        maritalStatus: undefined,
      };
    case 'summary':
      return { key: 'summary', order, visible: true, text: parsed.summary ?? '' };
    case 'experience':
      return {
        key: 'experience',
        order,
        visible: true,
        entries: parsed.experience.map((e) => ({
          company: e.company,
          role: e.role,
          startDate: e.startDate ?? '',
          endDate: e.endDate ?? undefined,
          location: e.location ?? undefined,
          bullets: e.bullets,
        })),
      };
    case 'education':
      return {
        key: 'education',
        order,
        visible: true,
        entries: parsed.education.map((e) => ({
          institution: e.institution,
          degree: e.degree,
          startDate: e.startDate ?? '',
          endDate: e.endDate ?? undefined,
        })),
      };
    case 'skills': {
      const groups: CvSkillGroup[] = parsed.skillGroups?.length
        ? parsed.skillGroups
        : parsed.skills.length
          ? [{ label: 'Skills', values: parsed.skills }]
          : [];
      return { key: 'skills', order, visible: true, groups };
    }
    case 'languages':
      return { key: 'languages', order, visible: true, items: parsed.languages };
  }
}

export interface CvFieldToggles {
  includePhoto: boolean;
  includeBirthdate: boolean;
  includeMaritalStatus: boolean;
}

/** Deterministic, 0-token ATS-risk notes for the constructor's field
 * toggles. Distinct from the (1d) font/colour `check_style_safety` note -
 * this one is about which facts appear on the page at all. DE traditional
 * CVs conventionally include all three; other markets commonly flag them
 * (photo/age/marital-status bias, and some ATS parsers choke on an
 * embedded photo). Returns i18n keys, not rendered strings. */
export function cvFieldAtsNoteKeys(
  toggles: CvFieldToggles,
  regionTag: string | undefined,
): string[] {
  const isDe = (regionTag ?? '').toLowerCase() === 'de';
  const keys: string[] = [];
  if (toggles.includePhoto && !isDe) keys.push('documents.cv_ats_note_photo');
  if (toggles.includeBirthdate && !isDe) keys.push('documents.cv_ats_note_birthdate');
  if (toggles.includeMaritalStatus && !isDe) keys.push('documents.cv_ats_note_marital');
  return keys;
}

const SECTION_LABEL_KEYS: Record<CvSectionKey, string> = {
  photo: 'documents.cv_section_photo',
  personal_details: 'documents.cv_section_personal_details',
  summary: 'documents.cv_section_summary',
  experience: 'documents.cv_section_experience',
  education: 'documents.cv_section_education',
  skills: 'documents.cv_section_skills',
  languages: 'documents.cv_section_languages',
};

export function sectionLabelKey(key: CvSectionKey): string {
  return SECTION_LABEL_KEYS[key];
}

/** Sections a per-section "regenerate" button makes sense for - factual
 * identity fields (photo, personal details) are user-edited, not
 * AI-authored, so they're excluded. */
export const REGENERATABLE_SECTION_KEYS: CvSectionKey[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
];

/** Merges a targeted single-section regenerate result into an existing
 * `CvContent`, updating only that section's content fields (and
 * `sourceHash`) - every other section is untouched. */
export function mergeRegeneratedSection(
  content: CvContent,
  key: CvSectionKey,
  parsed: CvParsedContent,
  sourceHash: string,
): CvContent {
  const template = null;
  const sections = content.sections.map((section) => {
    if (section.key !== key) return section;
    const fresh = sectionFor(key, section.order, parsed, template);
    return { ...fresh, order: section.order, visible: section.visible, sourceHash };
  });
  return { sections };
}

/** Filename convention (ROADMAP §16.6) - DE follows the market convention
 * `Lastname_Vorname_Lebenslauf.ext` when a full name is available; every
 * other region/fallback case is a plain slug of the label. Not a full
 * `market-conventions/{region}.json` config yet - that's future growth
 * once a third consumer needs it (§16.2), 0 tokens either way. */
export function suggestCvFilename(
  item: { label?: string; regionTag?: string; contentJson?: string },
  format: string,
): string {
  if ((item.regionTag ?? '').toLowerCase() === 'de' && item.contentJson) {
    try {
      const content = JSON.parse(item.contentJson) as CvContent;
      const personal = content.sections.find(
        (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
      );
      const parts = (personal?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const nachname = parts[parts.length - 1];
        const vorname = parts.slice(0, -1).join('_');
        return `${nachname}_${vorname}_Lebenslauf.${format}`;
      }
    } catch {
      // fall through to the generic slug below
    }
  }
  const slug = (item.label ?? 'cv').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${slug}.${format}`;
}

/** Converts a structured CV back into markdown so it can be passed to
 * the AI tailoring skill as a baseline profile. */
export function cvContentToMd(content: CvContent): string {
  const sections = orderedVisibleSections(content.sections);
  const parts: string[] = [];

  for (const s of sections) {
    if (s.key === 'personal_details') {
      const p = s as Extract<CvSection, { key: 'personal_details' }>;
      parts.push(`# ${p.fullName}`);
      if (p.title) parts.push(`_${p.title}_`);
      const contact = [p.email, p.phone, p.address, p.website, p.linkedin]
        .filter(Boolean)
        .join(' | ');
      if (contact) parts.push(contact);
    } else if (s.key === 'summary') {
      const p = s as Extract<CvSection, { key: 'summary' }>;
      if (p.text) parts.push(`## Summary\n${p.text}`);
    } else if (s.key === 'experience') {
      const p = s as Extract<CvSection, { key: 'experience' }>;
      if (p.entries.length) {
        parts.push('## Experience');
        for (const e of p.entries) {
          let heading = `### ${e.role} at ${e.company}`;
          if (e.startDate) {
            heading += ` (${e.startDate} - ${e.endDate || 'Present'})`;
          }
          if (e.location) heading += ` | ${e.location}`;
          parts.push(heading);
          for (const b of e.bullets) parts.push(`- ${b}`);
        }
      }
    } else if (s.key === 'education') {
      const p = s as Extract<CvSection, { key: 'education' }>;
      if (p.entries.length) {
        parts.push('## Education');
        for (const e of p.entries) {
          let heading = `### ${e.degree} at ${e.institution}`;
          if (e.startDate) {
            heading += ` (${e.startDate} - ${e.endDate || 'Present'})`;
          }
          parts.push(heading);
        }
      }
    } else if (s.key === 'skills') {
      const p = s as Extract<CvSection, { key: 'skills' }>;
      const groups = p.groups.filter((g) => g.values.length);
      if (groups.length) {
        parts.push('## Skills');
        for (const g of groups) parts.push(`**${g.label}:** ${g.values.join(', ')}`);
      }
    } else if (s.key === 'languages') {
      const p = s as Extract<CvSection, { key: 'languages' }>;
      if (p.items.length) {
        const langs = p.items.map((l) => `${l.language} (${l.level})`).join(', ');
        parts.push(`## Languages\n${langs}`);
      }
    }
  }
  return parts.join('\n\n');
}

export function markdownToCvContentFallback(markdown: string, fullName = ''): CvContent {
  const text = markdown.trim();
  return {
    sections: [
      {
        key: 'personal_details',
        order: 0,
        visible: true,
        fullName,
      },
      {
        key: 'summary',
        order: 1,
        visible: true,
        text,
      },
      {
        key: 'experience',
        order: 2,
        visible: true,
        entries: [],
      },
      {
        key: 'education',
        order: 3,
        visible: true,
        entries: [],
      },
      {
        key: 'skills',
        order: 4,
        visible: true,
        groups: [],
      },
      {
        key: 'languages',
        order: 5,
        visible: true,
        items: [],
      },
    ],
  };
}

/** Migrates a stored CvContent to the current shape without rewriting content
 * the user authored. Currently: a legacy `items: string[]` skills section
 * becomes a single `{ label: 'Skills', values }` group. Idempotent. */
export function normalizeCvContent(content: CvContent): CvContent {
  const sections = content.sections.map((section) => {
    if (section.key !== 'skills') return section;
    const legacy = section as unknown as {
      key: 'skills';
      order: number;
      visible: boolean;
      sourceHash?: string;
      items?: string[];
      groups?: CvSkillGroup[];
    };
    if (legacy.groups) return section;
    const migrated: CvSkillsSection = {
      key: 'skills',
      order: legacy.order,
      visible: legacy.visible,
      sourceHash: legacy.sourceHash,
      groups: [{ label: 'Skills', values: legacy.items ?? [] }],
    };
    return migrated;
  });
  const hasPersonal = sections.some((s) => s.key === 'personal_details');
  if (!hasPersonal) {
    const shifted = sections.map((s) => ({ ...s, order: s.order + 1 }));
    const personal: CvSection = { key: 'personal_details', order: 0, visible: true, fullName: '' };
    return { sections: [personal, ...shifted] };
  }
  return { sections };
}

/** Reference-order single-line contact string: location · phone · email ·
 * website · linkedin, then optionally birthdate/marital. Empty fields drop out
 * with no dangling ` | `. */
export function buildContactLine(
  p: CvPersonalDetailsSection,
  opts: { includeBirthdate: boolean; includeMaritalStatus: boolean },
): string {
  return [
    p.address,
    p.phone,
    p.email,
    p.website,
    p.linkedin,
    opts.includeBirthdate ? p.birthDate : undefined,
    opts.includeMaritalStatus ? p.maritalStatus : undefined,
  ]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(' | ');
}

/** Contact fields addressable as individual inline-edit leaves - the same
 * fields, same order, as `buildContactLine`. */
export type CvContactFieldKey =
  'address' | 'phone' | 'email' | 'website' | 'linkedin' | 'birthDate' | 'maritalStatus';

export interface CvContactFieldLeaf {
  field: CvContactFieldKey;
  value: string;
}

/** The contact fields that currently render in `buildContactLine`'s output,
 * as individually addressable leaves (same order). The five base fields
 * (address/phone/email/website/linkedin) only become a leaf once they already
 * carry a value - matching what's actually visible in the resting contact
 * line, since this task doesn't add an "add a new contact field" affordance.
 * `birthDate`/`maritalStatus` become a leaf whenever their toggle is on, value
 * or not - mirroring the sidebar editor, which shows the input as soon as the
 * toggle is enabled so the user can fill it in for the first time. */
export function visiblePersonalContactFields(
  p: CvPersonalDetailsSection,
  opts: { includeBirthdate: boolean; includeMaritalStatus: boolean },
): CvContactFieldLeaf[] {
  const hasText = (v: string | undefined): v is string => !!v && v.trim().length > 0;
  const out: CvContactFieldLeaf[] = [];
  if (hasText(p.address)) out.push({ field: 'address', value: p.address });
  if (hasText(p.phone)) out.push({ field: 'phone', value: p.phone });
  if (hasText(p.email)) out.push({ field: 'email', value: p.email });
  if (hasText(p.website)) out.push({ field: 'website', value: p.website });
  if (hasText(p.linkedin)) out.push({ field: 'linkedin', value: p.linkedin });
  if (opts.includeBirthdate) out.push({ field: 'birthDate', value: p.birthDate ?? '' });
  if (opts.includeMaritalStatus) {
    out.push({ field: 'maritalStatus', value: p.maritalStatus ?? '' });
  }
  return out;
}

export interface ResolvedPage {
  widthMm: number;
  heightMm: number;
  /** Clamped 4-side margins in mm. */
  margin: { top: number; right: number; bottom: number; left: number };
  /** Each side as a % of the relevant page dimension - resolution-independent
   * padding for the preview (top/bottom of height, left/right of width). */
  marginPct: { top: number; right: number; bottom: number; left: number };
}

const PRESET_MM: Record<string, number> = { narrow: 12.7, normal: 20, wide: 30 };
const clampMm = (v: number): number => Math.min(50, Math.max(0, Number.isFinite(v) ? v : 20));

/** Normalises the stored margin (new 4-side object, legacy preset string, or
 * absent) into clamped 4-side mm. */
function normalizeMargins(margin: unknown): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (typeof margin === 'string') {
    const mm = PRESET_MM[margin] ?? 20;
    return { top: mm, right: mm, bottom: mm, left: mm };
  }
  if (margin && typeof margin === 'object') {
    const m = margin as Partial<PageMargins>;
    return {
      top: clampMm(m.top ?? 20),
      right: clampMm(m.right ?? 20),
      bottom: clampMm(m.bottom ?? 20),
      left: clampMm(m.left ?? 20),
    };
  }
  return { top: 20, right: 20, bottom: 20, left: 20 };
}

/** Resolves `PageSettings` (new or legacy) to concrete mm + %. Single source of
 * truth for the preview; the Rust `resolve_page` mirrors these numbers for
 * DOCX export. */
export function resolvePageSettings(page: PageSettings | undefined): ResolvedPage {
  const size = page?.size === 'letter' ? 'letter' : 'a4';
  const [widthMm, heightMm] = size === 'letter' ? [215.9, 279.4] : [210, 297];
  const margin = normalizeMargins(page?.margin);
  return {
    widthMm,
    heightMm,
    margin,
    marginPct: {
      top: (margin.top / heightMm) * 100,
      bottom: (margin.bottom / heightMm) * 100,
      left: (margin.left / widthMm) * 100,
      right: (margin.right / widthMm) * 100,
    },
  };
}

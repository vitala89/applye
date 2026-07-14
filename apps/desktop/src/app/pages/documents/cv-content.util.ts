import {
  CvBorderStyle,
  CvContent,
  CvEducationEntry,
  CvEducationSection,
  CvElementStyle,
  CvExperienceEntry,
  CvExperienceSection,
  CvFontWeight,
  CvLanguagesSection,
  CvParsedContent,
  CvPersonalDetailsSection,
  CvSection,
  CvSectionKey,
  CvSectionStyle,
  CvSkillGroup,
  CvSkillsSection,
  CvStyle,
  CvSummarySection,
  CvTemplate,
  CoverLetterBlockKey,
  CoverLetterStyle,
  CvTextStyle,
  PageMargins,
  PageSettings,
} from '@applye/core';

/** A semantic click target in the live CV preview: which section, which
 * styling scope (body text vs. section title), and — for a body click that
 * landed on a specific leaf — which element the user selected. Consumed by
 * the contextual `CvLiveStylePanelComponent`.
 *
 * `elementPath` is additive on top of section-level gating: it is the SAME
 * transient draft-id string already passed to `CvPreviewComponent.leafDraft`
 * for that leaf (e.g. `'summary'`, `'exp.1.role'`, `'exp.1.bullet.0'`,
 * `'skills.0.values'`, `'lang.0.language'`) — one string, reused as both the
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
 * (`colorHex` only when the user actually picked a colour — the no-accent-leak
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
  /** Section BODY-rule (divider) thickness/colour — carried on body
   * selections for sections that draw a rule (personal details, experience);
   * always written at section scope. `null` clears back to the theme. */
  bodyRuleWidth?: number | null;
  bodyRuleColor?: string | null;
  /** In-line item separator (e.g. the `|` between languages) colour and size
   * (pt); section-level, `null` clears back to the default. */
  separatorColor?: string | null;
  separatorSize?: number | null;
  reset?: boolean;
}

/** Builds the canonical leaf-path string — the single source of truth for a
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

/** Plain text of the leaf a `CvPreviewSelection.elementPath` targets — the
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

/** Visible sections in display order — what the preview (and the real
 * export) actually renders, as opposed to the constructor's full
 * edit-everything list. */
export function orderedVisibleSections(sections: CvSection[]): CvSection[] {
  return sections
    .filter((s) => s.visible)
    .slice()
    .sort((a, b) => a.order - b.order);
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
  // personal_details is identity, not layout — guarantee it regardless of the
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
 * toggles. Distinct from the (1d) font/colour `check_style_safety` note —
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

/** Sections a per-section "regenerate" button makes sense for — factual
 * identity fields (photo, personal details) are user-edited, not
 * AI-authored, so they're excluded. */
export const REGENERATABLE_SECTION_KEYS: CvSectionKey[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
];

/** Parses a `cv-import`/`cv-generate-baseline` skill response (JSON, possibly
 * fenced) into `CvParsedContent`. Throws with the raw text on invalid JSON
 * so the caller can surface a real error instead of a silent empty draft. */
export function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  if (cleaned.startsWith('`')) cleaned = cleaned.substring(1);
  if (cleaned.endsWith('`')) cleaned = cleaned.substring(0, cleaned.length - 1);
  return cleaned.trim();
}

/** Closes any open string and open braces/brackets of `s`, or returns null if
 * `s` ends on a separator/colon that cannot be closed into valid JSON. */
function closeOpenStructures(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (!stack.length) return null;
      stack.pop();
    }
  }
  let out = s.replace(/\s+$/, '');
  if (!inStr && /[,:]$/.test(out)) return null; // dangling separator outside a string
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/** Best-effort recovery of a JSON object from a response truncated mid-value
 * (an output-token cap cutting the model off). Trims from the end to the
 * longest prefix that becomes valid once open strings/brackets are closed.
 * Pure, never throws, bounded to the input length. Returns a parseable JSON
 * string or null. */
export function repairTruncatedJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const body = raw.slice(start);
  try {
    JSON.parse(body);
    return body;
  } catch {
    // fall through to trim-and-close
  }
  for (let end = body.length; end > 0; end--) {
    const closed = closeOpenStructures(body.slice(0, end));
    if (closed === null) continue;
    try {
      JSON.parse(closed);
      return closed;
    } catch {
      // keep trimming
    }
  }
  return null;
}

function tryParseParsed(s: string): Partial<CvParsedContent> | null {
  try {
    return JSON.parse(s) as Partial<CvParsedContent>;
  } catch {
    return null;
  }
}

export function parseCvSkillResponse(text: string): CvParsedContent {
  const raw = cleanJsonText(text);
  let parsed = tryParseParsed(raw);
  if (!parsed) {
    const repaired = repairTruncatedJson(raw);
    if (repaired) parsed = tryParseParsed(repaired);
  }
  if (!parsed) {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
  const p: Partial<CvParsedContent['personalDetails']> = parsed.personalDetails ?? {};
  return {
    personalDetails: {
      fullName: p.fullName ?? null,
      title: p.title ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      address: p.address ?? null,
      website: p.website ?? null,
      linkedin: p.linkedin ?? null,
    },
    summary: parsed.summary ?? null,
    experience: parsed.experience ?? [],
    education: parsed.education ?? [],
    skills: parsed.skills ?? [],
    skillGroups: parsed.skillGroups,
    languages: parsed.languages ?? [],
    lowConfidenceNotes: parsed.lowConfidenceNotes ?? [],
  };
}

/** Merges a targeted single-section regenerate result into an existing
 * `CvContent`, updating only that section's content fields (and
 * `sourceHash`) — every other section is untouched. */
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

/** Filename convention (ROADMAP §16.6) — DE follows the market convention
 * `Lastname_Vorname_Lebenslauf.ext` when a full name is available; every
 * other region/fallback case is a plain slug of the label. Not a full
 * `market-conventions/{region}.json` config yet — that's future growth
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

/** Contact fields addressable as individual inline-edit leaves — the same
 * fields, same order, as `buildContactLine`. */
export type CvContactFieldKey =
  | 'address'
  | 'phone'
  | 'email'
  | 'website'
  | 'linkedin'
  | 'birthDate'
  | 'maritalStatus';

export interface CvContactFieldLeaf {
  field: CvContactFieldKey;
  value: string;
}

/** The contact fields that currently render in `buildContactLine`'s output,
 * as individually addressable leaves (same order). The five base fields
 * (address/phone/email/website/linkedin) only become a leaf once they already
 * carry a value — matching what's actually visible in the resting contact
 * line, since this task doesn't add an "add a new contact field" affordance.
 * `birthDate`/`maritalStatus` become a leaf whenever their toggle is on, value
 * or not — mirroring the sidebar editor, which shows the input as soon as the
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

/** Applies an immutable per-section style patch while keeping the persisted
 * override tree minimal. Nested title fields are deep-merged; inherited
 * (`undefined`/`null`) values, empty title objects, empty section overrides,
 * and an empty `sectionStyles` map are removed. */
export function patchCvSectionStyle(
  style: CvStyle,
  key: CvSectionKey,
  patch: Partial<CvSectionStyle>,
): CvStyle {
  const current = style.sectionStyles?.[key] ?? {};
  const normalizedPatch = { ...patch };
  if ('lineHeight' in patch && !isValidCvLineHeight(patch.lineHeight)) {
    normalizedPatch.lineHeight = undefined;
  }
  const title =
    normalizedPatch.title === undefined
      ? current.title
      : Object.fromEntries(
          Object.entries({ ...(current.title ?? {}), ...normalizedPatch.title }).filter(
            ([, value]) => value != null,
          ),
        );
  // Deep-merge the shared bullet style (the "all achievements" scope), same as
  // `title`: inherited (null/undefined) keys are dropped so an emptied override
  // disappears.
  const bulletStyle =
    normalizedPatch.bulletStyle === undefined
      ? current.bulletStyle
      : Object.fromEntries(
          Object.entries({ ...(current.bulletStyle ?? {}), ...normalizedPatch.bulletStyle }).filter(
            ([, value]) => value != null,
          ),
        );
  const merged = Object.fromEntries(
    Object.entries({ ...current, ...normalizedPatch, title, bulletStyle }).filter(
      ([, value]) => value != null && !(typeof value === 'object' && !Object.keys(value).length),
    ),
  ) as CvSectionStyle;
  const sectionStyles = { ...(style.sectionStyles ?? {}) };
  if (Object.keys(merged).length) sectionStyles[key] = merged;
  else delete sectionStyles[key];
  return {
    ...style,
    sectionStyles: Object.keys(sectionStyles).length ? sectionStyles : undefined,
  };
}

/** Leaf-path prefix for a section (`exp`, `edu`, `skills`, `pd`, `lang`,
 * `summary`) — the head of every `elementStyles` key inside that section. */
function sectionPathPrefix(key: CvSectionKey): string | null {
  switch (key) {
    case 'personal_details':
      return 'pd';
    case 'experience':
      return 'exp';
    case 'education':
      return 'edu';
    case 'skills':
      return 'skills';
    case 'languages':
      return 'lang';
    case 'summary':
      return 'summary';
    default:
      return null;
  }
}

/** Drops per-element overrides inside a section so a section-wide change ("All
 * experiences", "All achievements") applies UNIFORMLY — an individual entry's
 * override no longer wins and silently gets skipped. `bullets: true` targets
 * only that section's bullet overrides (the "All achievements" scope);
 * otherwise it targets the heads/fields (everything except bullets). Sibling
 * sections and the section/document styles are untouched. */
export function clearSectionElementOverrides(
  style: CvStyle,
  key: CvSectionKey,
  bullets = false,
): CvStyle {
  const prefix = sectionPathPrefix(key);
  if (!prefix || !style.elementStyles) return style;
  const next = Object.fromEntries(
    Object.entries(style.elementStyles).filter(([path]) => {
      const inSection = path === prefix || path.startsWith(prefix + '.');
      if (!inSection) return true;
      const isBullet = path.includes('.bullet.');
      return !(bullets ? isBullet : !isBullet);
    }),
  );
  return { ...style, elementStyles: Object.keys(next).length ? next : undefined };
}

/** Removes one complete per-section override and omits the map when it becomes
 * empty. Document defaults and sibling section overrides are preserved. */
export function resetCvSectionStyle(style: CvStyle, key: CvSectionKey): CvStyle {
  const sectionStyles = { ...(style.sectionStyles ?? {}) };
  delete sectionStyles[key];
  return {
    ...style,
    sectionStyles: Object.keys(sectionStyles).length ? sectionStyles : undefined,
  };
}

export function effectiveSectionStyle(
  style: CvStyle,
  key: CvSectionKey,
): {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: CvFontWeight;
  colorHex: string;
  lineHeight?: number;
} {
  const o = style.sectionStyles?.[key] ?? {};
  return {
    fontFamily: o.fontFamily ?? style.fontFamily,
    fontSizePt: o.fontSizePt ?? style.fontSizePt,
    fontWeight: o.fontWeight ?? style.fontWeight,
    colorHex: o.colorHex ?? style.accentColorHex,
    lineHeight: isValidCvLineHeight(o.lineHeight) ? o.lineHeight : undefined,
  };
}

function isValidCvLineHeight(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 1 && value <= 2;
}

/** Applies an immutable per-element style patch while keeping the persisted
 * override tree minimal. Mirrors `patchCvSectionStyle` at the leaf level:
 * inherited (`undefined`/`null`) values, an emptied element override, and an
 * emptied `elementStyles` map are all removed; sibling paths are untouched. */
export function patchCvElementStyle(
  style: CvStyle,
  path: string,
  patch: Partial<CvElementStyle>,
): CvStyle {
  const current = style.elementStyles?.[path] ?? {};
  const normalizedPatch = { ...patch };
  if ('lineHeight' in patch && !isValidCvLineHeight(patch.lineHeight)) {
    normalizedPatch.lineHeight = undefined;
  }
  const merged = Object.fromEntries(
    Object.entries({ ...current, ...normalizedPatch }).filter(([, value]) => value != null),
  ) as CvElementStyle;
  const elementStyles = { ...(style.elementStyles ?? {}) };
  if (Object.keys(merged).length) elementStyles[path] = merged;
  else delete elementStyles[path];
  return {
    ...style,
    elementStyles: Object.keys(elementStyles).length ? elementStyles : undefined,
  };
}

/** Removes one complete per-element override and omits the map when it
 * becomes empty. Document defaults, section overrides, and sibling element
 * overrides are preserved. */
export function resetCvElementStyle(style: CvStyle, path: string): CvStyle {
  const elementStyles = { ...(style.elementStyles ?? {}) };
  delete elementStyles[path];
  return {
    ...style,
    elementStyles: Object.keys(elementStyles).length ? elementStyles : undefined,
  };
}

/** Applies an element-style patch onto the `CvStyle` root/document-wide body
 * fields (`fontFamily`/`fontSizePt`/`fontWeight`/`bodyColorHex`) — the
 * least-specific layer of the cascade. Only the provided keys are written;
 * `sectionStyles`/`elementStyles`/`titleStyle` are left untouched.
 * `colorHex` maps to `bodyColorHex` — the document-wide BODY text colour —
 * NOT `accentColorHex` (the accent/title/rule colour body text never reads;
 * writing `accentColorHex` here was the Phase D.2 bug this fixes, since it
 * recoloured titles instead of the body it was meant to target).
 * `lineHeight` has no document-body root field, so it is intentionally
 * ignored here. */
export function patchCvDocumentBody(style: CvStyle, patch: Partial<CvElementStyle>): CvStyle {
  const next: CvStyle = { ...style };
  if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily;
  if (patch.fontSizePt !== undefined) next.fontSizePt = patch.fontSizePt;
  if (patch.fontWeight !== undefined) next.fontWeight = patch.fontWeight;
  if (patch.colorHex !== undefined) next.bodyColorHex = patch.colorHex;
  return next;
}

/** Resolved style for a single body leaf: `elementStyles[elementPath]`
 * layered over `effectiveSectionStyle(style, key)` — element → section →
 * document → none, most-specific first. An absent `elementPath` (or one with
 * no override) resolves to the section/document colour cascade unchanged.
 * `colorHex` stays `undefined` unless explicitly overridden at the element,
 * section, OR document (`bodyColorHex`) scope — it must NOT fall back to
 * `accentColorHex` (the no-accent-leak rule from `015c2e3`); un-overridden
 * body text keeps its inherited/theme colour. `lineHeight` is validated
 * 1.0–2.0, falling back to the section's (already-validated) value when the
 * element override is out of range. */
export function effectiveLeafStyle(
  style: CvStyle,
  key: CvSectionKey,
  elementPath: string | undefined,
): {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: CvFontWeight;
  colorHex?: string;
  lineHeight?: number;
} {
  const section = effectiveSectionStyle(style, key);
  const sectionOverride = style.sectionStyles?.[key] ?? {};
  const element: CvElementStyle = (elementPath && style.elementStyles?.[elementPath]) || {};
  return {
    fontFamily: element.fontFamily ?? section.fontFamily,
    fontSizePt: element.fontSizePt ?? section.fontSizePt,
    fontWeight: element.fontWeight ?? section.fontWeight,
    colorHex: element.colorHex ?? sectionOverride.colorHex ?? style.bodyColorHex ?? undefined,
    lineHeight: isValidCvLineHeight(element.lineHeight) ? element.lineHeight : section.lineHeight,
  };
}

/** Resolved title style for a section: per-section title override, then the
 * document-wide `titleStyle`, then the document body defaults as the ultimate
 * fallback so every property is a concrete value. */
export function effectiveTitleStyle(
  style: CvStyle,
  key: CvSectionKey,
): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string } {
  const t: CvTextStyle = style.sectionStyles?.[key]?.title ?? {};
  const d: CvTextStyle = style.titleStyle ?? {};
  return {
    fontFamily: t.fontFamily ?? d.fontFamily ?? style.fontFamily,
    fontSizePt: t.fontSizePt ?? d.fontSizePt ?? style.fontSizePt,
    fontWeight: t.fontWeight ?? d.fontWeight ?? style.fontWeight,
    colorHex: t.colorHex ?? d.colorHex ?? style.accentColorHex,
  };
}

/** Resolved title underline: per-section, then document-wide, then 'solid'. */
export function effectiveTitleBorder(style: CvStyle, key: CvSectionKey): CvBorderStyle {
  return style.sectionStyles?.[key]?.titleBorder ?? style.titleBorder ?? 'solid';
}

/** Effective title-underline thickness (pt) for a section: per-section, then
 * document. `undefined` means "no user override" — the renderer falls back to
 * the active theme's rule weight (or the neutral default). */
export function effectiveTitleRuleWidth(style: CvStyle, key: CvSectionKey): number | undefined {
  return style.sectionStyles?.[key]?.titleRuleWidthPt ?? style.titleRuleWidthPt;
}

/** Effective title-underline colour for a section: per-section, then document.
 * `undefined` means "no user override" — the renderer falls back to the theme
 * rule colour (accent/muted) or the neutral default. */
export function effectiveTitleRuleColor(style: CvStyle, key: CvSectionKey): string | undefined {
  return style.sectionStyles?.[key]?.titleRuleColorHex ?? style.titleRuleColorHex;
}

export interface ResolvedPage {
  widthMm: number;
  heightMm: number;
  /** Clamped 4-side margins in mm. */
  margin: { top: number; right: number; bottom: number; left: number };
  /** Each side as a % of the relevant page dimension — resolution-independent
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

/** Effective per-block cover-letter style — the block's override merged over
 * the document-wide style. Mirrors `effectiveSectionStyle` for CVs. */
export function effectiveCoverLetterBlockStyle(
  style: CoverLetterStyle,
  key: CoverLetterBlockKey,
): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string } {
  const o = style.sectionStyles?.[key] ?? {};
  return {
    fontFamily: o.fontFamily ?? style.fontFamily,
    fontSizePt: o.fontSizePt ?? style.fontSizePt,
    fontWeight: o.fontWeight ?? style.fontWeight,
    colorHex: o.colorHex ?? style.accentColorHex,
  };
}

/** Effective style for a single body paragraph — its `body_<i>` override
 * merged over the `body` block style, merged over the document-wide style. */
export function effectiveCoverLetterParagraphStyle(
  style: CoverLetterStyle,
  index: number,
): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string } {
  const base = effectiveCoverLetterBlockStyle(style, 'body');
  const o = style.sectionStyles?.[`body_${index}`] ?? {};
  return {
    fontFamily: o.fontFamily ?? base.fontFamily,
    fontSizePt: o.fontSizePt ?? base.fontSizePt,
    fontWeight: o.fontWeight ?? base.fontWeight,
    colorHex: o.colorHex ?? base.colorHex,
  };
}

/** Blank rows for the "add entry" affordance in the CV editor. */
export function blankExperienceEntry(): CvExperienceEntry {
  return { company: '', role: '', startDate: '', endDate: '', location: '', bullets: [''] };
}

export function blankEducationEntry(): CvEducationEntry {
  return { institution: '', degree: '', startDate: '', endDate: '' };
}

// --- Immutable nested-leaf replacement (CV preview inline editing) --------
//
// Each helper replaces exactly one field/index inside a section's nested
// array, producing fresh objects at every mutated level (the array itself,
// the mutated entry/group/item) while every *other* entry/group/item keeps
// its original object identity — the array `.map` only allocates a new
// object for the matched index.

/** Immutably replaces one field of one experience entry by index. Every
 * other entry (and the section/array wrapping it) is a fresh reference only
 * at the mutated level — sibling entries keep their original identity. */
export function replaceExperienceEntryField<K extends keyof CvExperienceEntry>(
  section: CvExperienceSection,
  index: number,
  field: K,
  value: CvExperienceEntry[K],
): CvExperienceSection {
  return {
    ...section,
    entries: section.entries.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry,
    ),
  };
}

/** Immutably replaces one bullet string of one experience entry by index.
 * Only the targeted entry's `bullets` array is replaced; every other entry
 * and every other bullet keeps its original reference. */
export function replaceExperienceBullet(
  section: CvExperienceSection,
  entryIndex: number,
  bulletIndex: number,
  value: string,
): CvExperienceSection {
  return {
    ...section,
    entries: section.entries.map((entry, i) =>
      i === entryIndex
        ? { ...entry, bullets: entry.bullets.map((b, bi) => (bi === bulletIndex ? value : b)) }
        : entry,
    ),
  };
}

/** Immutably replaces one field of one education entry by index. */
export function replaceEducationEntryField<K extends keyof CvEducationEntry>(
  section: CvEducationSection,
  index: number,
  field: K,
  value: CvEducationEntry[K],
): CvEducationSection {
  return {
    ...section,
    entries: section.entries.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry,
    ),
  };
}

/** Immutably replaces one skill group's label by index. */
export function replaceSkillGroupLabel(
  section: CvSkillsSection,
  groupIndex: number,
  label: string,
): CvSkillsSection {
  return {
    ...section,
    groups: section.groups.map((g, i) => (i === groupIndex ? { ...g, label } : g)),
  };
}

/** Parses a comma-separated values editor string back into a trimmed,
 * non-empty string array — the inverse of `group.values.join(', ')`. */
export function parseSkillValues(text: string): string[] {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Immutably replaces one skill group's values array by index. */
export function replaceSkillGroupValues(
  section: CvSkillsSection,
  groupIndex: number,
  values: string[],
): CvSkillsSection {
  return {
    ...section,
    groups: section.groups.map((g, i) => (i === groupIndex ? { ...g, values } : g)),
  };
}

/** Immutably replaces one language entry's visible `language` value by
 * index — the (currently non-rendered) `level` field is left untouched. */
export function replaceLanguageValue(
  section: CvLanguagesSection,
  index: number,
  language: string,
): CvLanguagesSection {
  return {
    ...section,
    items: section.items.map((item, i) => (i === index ? { ...item, language } : item)),
  };
}

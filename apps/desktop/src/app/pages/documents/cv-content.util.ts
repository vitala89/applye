import { CvContent, CvParsedContent, CvSection, CvSectionKey, CvTemplate } from '@applye/core';

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
  const sections: CvSection[] = order.map((key, index) => sectionFor(key, index, parsed, template));
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
        email: parsed.personalDetails.email ?? undefined,
        phone: parsed.personalDetails.phone ?? undefined,
        address: parsed.personalDetails.address ?? undefined,
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
    case 'skills':
      return { key: 'skills', order, visible: true, items: parsed.skills };
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

function emptyParsedContent(): CvParsedContent {
  return {
    personalDetails: { fullName: null, email: null, phone: null, address: null },
    summary: null,
    experience: [],
    education: [],
    skills: [],
    languages: [],
    lowConfidenceNotes: [],
  };
}

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

export function parseCvSkillResponse(text: string): CvParsedContent {
  const raw = cleanJsonText(text);
  let parsed: Partial<CvParsedContent>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
  return { ...emptyParsedContent(), ...parsed };
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

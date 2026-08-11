import type {
  CvContent,
  CvParsedContent,
  CvSection,
  CvSectionKey,
  CvSkillGroup,
  CvSkillsSection,
  CvTemplate,
} from '../models/document.model';

/**
 * Building a CV document and rendering it back out: the section order a
 * template implies, the enriched content a parse produces, the markdown a
 * tailoring run reads, and the normalisation every load runs through.
 *
 * Style editing, entry editing, skill-response parsing, preview-leaf selection
 * and the page/contact helpers each live in their own file - this module was
 * 1245 lines against a 400 budget and held four unrelated jobs, then 596 and
 * three. It used to re-export them, because splitting a module cost each
 * consumer an import line and several consumers were over budget. That barrel
 * is gone: `@applye/core` is the single specifier now, so every one of them is
 * one import either way.
 */

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

// `suggestCvFilename` moved to `@applye/application` (`cv-filename.ts`), next to
// its cover-letter twin: the save dialog belongs to the page, but the name it
// proposes is a document fact, and this file was 652 lines against a 400 budget.

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

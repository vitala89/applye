// Immutable edits to the entries inside a CV section: experience, education,
// skills and languages.
//
// Split out of `cv-content.util.ts` alongside `cv-style.util.ts`. These change
// content where those change presentation, and they share the same shape -
// take a section, return a new one, never mutate what was passed in.

import {
  CvEducationEntry,
  CvEducationSection,
  CvExperienceEntry,
  CvExperienceSection,
  CvLanguagesSection,
  CvSkillsSection,
} from '@applye/core';

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
// its original object identity - the array `.map` only allocates a new
// object for the matched index.

/** Immutably replaces one field of one experience entry by index. Every
 * other entry (and the section/array wrapping it) is a fresh reference only
 * at the mutated level - sibling entries keep their original identity. */
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
 * non-empty string array - the inverse of `group.values.join(', ')`. */
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
 * index - the (currently non-rendered) `level` field is left untouched. */
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

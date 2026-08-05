import { EducationEntry, ExperienceEntry, LanguageEntry, ProfileForm } from '@applye/core';

/**
 * Tolerant shape of the `profile-import` skill's JSON output. Every field is
 * optional and nullable, since the AI omits or nulls anything it did not find
 * in the raw text; the functions below are what turn that into the
 * non-nullable strings `ProfileForm` and the section entries expect.
 */
export interface ParsedProfile {
  name?: string | null;
  title?: string | null;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  experience?: {
    role?: string;
    company?: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    bullets?: string[];
  }[];
  skills?: string[];
  languages?: { language?: string; level?: string | null }[];
  education?: {
    title?: string;
    institution?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }[];
  lowConfidenceNotes?: string[];
}

/** Nullable, possibly-absent AI output to a trimmed string. */
function str(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** The scalar contact fields the parse can fill.
 *
 * A blank parse **keeps what the form already has**: the AI omitting a phone
 * number is not the user saying they have none. This is the opposite rule from
 * the sections below, and the difference is deliberate. */
export function parsedContactPatch(
  parsed: ParsedProfile,
  current: ProfileForm,
): Pick<ProfileForm, 'name' | 'title' | 'location' | 'email' | 'phone' | 'website' | 'linkedin'> {
  return {
    name: str(parsed.name) || current.name,
    title: str(parsed.title) || current.title,
    location: str(parsed.location) || current.location,
    email: str(parsed.email) || current.email,
    phone: str(parsed.phone) || current.phone,
    website: str(parsed.website) || current.website,
    linkedin: str(parsed.linkedin) || current.linkedin,
  };
}

/* The structured sections are replaced wholesale rather than merged. Applying
 * the preview is an explicit action on something the user has just read, so
 * what it shows is what they get - a merge would silently keep rows that are
 * not in the preview at all. */

export function parsedExperienceEntries(parsed: ParsedProfile): ExperienceEntry[] {
  return (parsed.experience ?? []).map((e) => ({
    role: str(e.role),
    company: str(e.company),
    location: str(e.location),
    startDate: str(e.startDate),
    endDate: str(e.endDate),
    bullets: (e.bullets ?? []).map((b) => b.trim()).filter(Boolean),
  }));
}

/** Drops entries with no language name: a level on its own names nothing. */
export function parsedLanguageEntries(parsed: ParsedProfile): LanguageEntry[] {
  return (parsed.languages ?? [])
    .map((l) => ({ language: str(l.language), level: str(l.level) }))
    .filter((l) => l.language);
}

export function parsedEducationEntries(parsed: ParsedProfile): EducationEntry[] {
  return (parsed.education ?? []).map((e) => ({
    title: str(e.title),
    institution: str(e.institution),
    startDate: str(e.startDate),
    endDate: str(e.endDate),
  }));
}

export function parsedSkills(parsed: ParsedProfile): string[] {
  return (parsed.skills ?? []).map((sk) => sk.trim()).filter(Boolean);
}

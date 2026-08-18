// The import model: text extracted from an uploaded CV file, and the parsed
// shape both `cv-import.md` and `cv-generate-baseline.md` return before it
// becomes a `CvContent`.

import { CvSkillGroup } from './cv-content.model';

/** Plain text extracted from an uploaded CV file (DOCX/PDF), ready for the
 * `cv-import` skill. Mirrors Rust `CvImportFile`. */
export interface CvImportFile {
  text: string;
  fileType: 'docx' | 'pdf';
  inputHash: string;
}

export interface CvParsedExperienceEntry {
  company: string;
  role: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  bullets: string[];
}

export interface CvParsedEducationEntry {
  institution: string;
  degree: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CvParsedLanguageEntry {
  language: string;
  level: string;
}

/** Shared output shape of both `cv-import.md` and `cv-generate-baseline.md`
 * - structure detection and market-baseline generation feed the same
 * `CvContent` builder. Any field is empty/null when that section wasn't
 * produced (e.g. a targeted per-section regenerate). */
export interface CvParsedContent {
  personalDetails: {
    /** The display name, used as the CV document's title. Canonical. */
    fullName: string | null;
    /** The structured parts of the name. Optional on the type because many
     * test fixtures and older stored parses predate them; `parseCvSkillResponse`
     * always populates all three, so anything that came through the normalizer
     * has them. */
    firstName?: string | null;
    lastName?: string | null;
    /** False when the split was guessed rather than read off the CV, which is
     * what makes the onboarding review step ask the user to confirm it. */
    nameSplitConfident?: boolean;
    title: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    website: string | null;
    linkedin: string | null;
  };
  summary: string | null;
  experience: CvParsedExperienceEntry[];
  education: CvParsedEducationEntry[];
  skills: string[];
  skillGroups?: CvSkillGroup[];
  languages: CvParsedLanguageEntry[];
  lowConfidenceNotes: string[];
}

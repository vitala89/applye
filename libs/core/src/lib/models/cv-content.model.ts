// The CV content model: the seven section shapes `document_library.content_json`
// holds when `docType === 'cv'`, and nothing about how any of them is styled.
//
// Split out of `document.model.ts` (504/400) along the seams that were already
// in it. Every symbol still reaches consumers through `@applye/core`'s barrel,
// which is why no call site moved: nothing outside `libs/core` ever imported
// the file path.

export type CvSectionKey =
  'photo' | 'personal_details' | 'summary' | 'experience' | 'education' | 'skills' | 'languages';

interface CvSectionBase {
  key: CvSectionKey;
  order: number;
  visible: boolean;
  /** Hash of the inputs used to last (re)generate this section's content -
   * lets "regenerate this section" skip a repeat AI call when nothing that
   * feeds it has changed. Absent on sections that were never AI-generated
   * (e.g. hand-edited or imported as-is). */
  sourceHash?: string;
}

export type PhotoPlacement = 'above_left' | 'above_center' | 'above_right';

export interface CvPhotoSection extends CvSectionBase {
  key: 'photo';
  /** Cropped photo as a JPEG data URI: `data:image/jpeg;base64,...`. */
  dataUri?: string;
  /** Legacy/unused; retained for back-compat with older documents. */
  filePath?: string;
  /** Header slot for the photo. Absent → `above_left` (legacy inline top box). */
  placement?: PhotoPlacement;
}

export interface CvPersonalDetailsSection extends CvSectionBase {
  key: 'personal_details';
  fullName: string;
  title?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  linkedin?: string;
  birthDate?: string;
  maritalStatus?: string;
}

export interface CvSummarySection extends CvSectionBase {
  key: 'summary';
  text: string;
}

export interface CvExperienceEntry {
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  location?: string;
  /** Optional industry / domain tag, shown by themes whose entry layout
   * surfaces it (e.g. Aurora "Company - Industry"); ignored by others. */
  industry?: string;
  bullets: string[];
}

export interface CvExperienceSection extends CvSectionBase {
  key: 'experience';
  entries: CvExperienceEntry[];
}

export interface CvEducationEntry {
  institution: string;
  degree: string;
  startDate: string;
  endDate?: string;
}

export interface CvEducationSection extends CvSectionBase {
  key: 'education';
  entries: CvEducationEntry[];
}

export interface CvSkillGroup {
  label: string;
  values: string[];
}

export interface CvSkillsSection extends CvSectionBase {
  key: 'skills';
  groups: CvSkillGroup[];
}

export interface CvLanguageEntry {
  language: string;
  level: string;
}

export interface CvLanguagesSection extends CvSectionBase {
  key: 'languages';
  items: CvLanguageEntry[];
}

export type CvSection =
  | CvPhotoSection
  | CvPersonalDetailsSection
  | CvSummarySection
  | CvExperienceSection
  | CvEducationSection
  | CvSkillsSection
  | CvLanguagesSection;

/** Typed shape of `document_library.content_json` when `docType === 'cv'`. */
export interface CvContent {
  sections: CvSection[];
}

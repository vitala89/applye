export interface Profile {
  id: number;
  fullMd: string;
  scoringJson?: string;
  scoringHash?: string;
  pitchMd?: string;
  pitchHash?: string;
  targetArchetypes?: string;
  /** Cropped applicant photo as a JPEG data URI, reusable across CVs. Written
   * only through `setProfilePhoto` — an ordinary profile save leaves it alone. */
  photoDataUri?: string;
  updatedAt: string;
}

export interface StoryBank {
  id: number;
  title: string;
  starSituation: string;
  starTask: string;
  starAction: string;
  starResult: string;
  starReflection: string;
  tagsJson: string;
  createdAt: string;
}

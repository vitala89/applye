export interface Profile {
  id: number;
  fullMd: string;
  scoringJson?: string;
  scoringHash?: string;
  pitchMd?: string;
  pitchHash?: string;
  targetArchetypes?: string;
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

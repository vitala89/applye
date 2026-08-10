import { Profile, Settings } from '@applye/core';

/** The two artefacts the profile page generates from `fullMd`. */
export type ProfileArtifact = 'scoring' | 'pitch';

/** Which skill to render, with which variables, in which language. */
export interface ArtifactPrompt {
  skill: string;
  vars: Record<string, string>;
  language: string;
}

/** The row columns an artefact write touches. */
export type ArtifactPatch = Partial<
  Pick<
    Profile,
    'fullMd' | 'scoringJson' | 'scoringHash' | 'pitchMd' | 'pitchHash' | 'targetArchetypes'
  >
>;

/** The message shown when the saved artefact already covers the current text. */
export const ARTIFACT_CACHED_KEY: Record<ProfileArtifact, string> = {
  scoring: 'profile.scoring_cached',
  pitch: 'profile.pitch_cached',
};

/**
 * True when the saved row already holds this artefact for exactly this text.
 *
 * Both halves matter. A matching hash with no artefact behind it is a row that
 * recorded a generation that did not land, and treating that as cached would
 * leave the user with a button that reports success and produces nothing.
 */
export function artifactCached(
  kind: ProfileArtifact,
  profile: Profile | null,
  hash: string,
): boolean {
  return kind === 'scoring'
    ? hash === profile?.scoringHash && !!profile?.scoringJson
    : hash === profile?.pitchHash && !!profile?.pitchMd;
}

/**
 * What to render for an artefact.
 *
 * Scoring is pinned to English on purpose: it is machine-read when matching a
 * job, never shown to the user, and a scoring profile in the user's own
 * language would not compare against job text the matcher reads in English.
 * The pitch is the opposite - the user reads it aloud - so it follows the
 * configured document language.
 */
export function artifactPrompt(
  kind: ProfileArtifact,
  md: string,
  settings: Settings,
): ArtifactPrompt {
  if (kind === 'scoring') {
    return { skill: 'profile-compress', vars: { profile_md: md }, language: 'en' };
  }
  const language = settings.defaultDocLanguage ?? 'en';
  return {
    skill: 'pitch',
    vars: { profile_md: md, duration: '60s', language },
    language,
  };
}

/**
 * The whole-row input for an artefact write.
 *
 * `db_upsert_profile` overwrites every column it names, so the columns this
 * artefact does not own have to be carried over from the saved row or the write
 * wipes them - generating a pitch would clear the scoring profile and vice
 * versa. `fullMd` is the text the artefact was generated from, captured before
 * the call, not whatever the editor holds by the time it returns.
 */
export function artifactPatch(
  kind: ProfileArtifact,
  profile: Profile | null,
  fullMd: string,
  text: string,
  hash: string,
): ArtifactPatch {
  const carried = {
    fullMd,
    targetArchetypes: profile?.targetArchetypes,
  };
  return kind === 'scoring'
    ? {
        ...carried,
        scoringJson: text,
        scoringHash: hash,
        pitchMd: profile?.pitchMd,
        pitchHash: profile?.pitchHash,
      }
    : {
        ...carried,
        scoringJson: profile?.scoringJson,
        scoringHash: profile?.scoringHash,
        pitchMd: text,
        pitchHash: hash,
      };
}

/**
 * Freshness of a cached AI artefact (the scoring profile) against the profile markdown it was
 * generated from.
 *
 * The artefact is generated from `fullMd` and stored alongside `scoringHash`, the hash of the
 * markdown at generation time. It goes stale whenever `fullMd` changes, which is invisible to a
 * plain "has the form been edited" check: saving an edited profile clears the edited flag but
 * does not regenerate the artefact, so the artefact is at its most stale exactly when the form
 * looks clean.
 */
export type ScoringState =
  /** No artefact generated yet. */
  | 'none'
  /** Markdown edited but not saved; the artefact matches neither the saved nor the edited text. */
  | 'unsaved'
  /** Saved markdown no longer hashes to the hash the artefact was generated from. */
  | 'stale'
  /** Artefact was generated from exactly the markdown currently saved. */
  | 'fresh';

export interface ScoringStateInput {
  /** Whether a scoring profile exists at all. */
  hasScoringJson: boolean;
  /** Whether the in-memory markdown differs from the saved markdown. */
  mdDirty: boolean;
  /** Hash of the saved markdown, or null when unknown (not yet computed, or empty markdown). */
  savedMdHash: string | null;
  /** Hash the stored scoring profile was generated from. */
  scoringHash: string | null | undefined;
}

/**
 * Both hashes must be hashes of the same normalisation of the markdown (trimmed), or they never
 * compare equal and every profile reads as stale.
 *
 * An unknown hash on either side resolves to 'fresh', not 'stale': claiming a good artefact is
 * out of date pushes the user into a paid regeneration they did not need.
 */
function artefactState(
  hasArtefact: boolean,
  mdDirty: boolean,
  savedMdHash: string | null,
  artefactHash: string | null | undefined,
): ScoringState {
  if (!hasArtefact) return 'none';
  if (mdDirty) return 'unsaved';
  if (savedMdHash && artefactHash && savedMdHash !== artefactHash) return 'stale';
  return 'fresh';
}

export function scoringState(input: ScoringStateInput): ScoringState {
  return artefactState(input.hasScoringJson, input.mdDirty, input.savedMdHash, input.scoringHash);
}

export interface PitchStateInput {
  /** Whether a pitch exists at all. */
  hasPitch: boolean;
  /** Whether the in-memory markdown differs from the saved markdown. */
  mdDirty: boolean;
  /** Hash of the saved markdown, or null when unknown (not yet computed, or empty markdown). */
  savedMdHash: string | null;
  /** Hash the stored pitch was generated from. */
  pitchHash: string | null | undefined;
}

/**
 * Freshness of the cached elevator pitch. Same rule as {@link scoringState} but keyed on the
 * pitch's own hash: the pitch and the scoring profile go stale independently, so the pitch must
 * carry the hash of the markdown it was actually written from rather than borrowing the scoring
 * profile's - regenerating one must not silently mark the other fresh.
 */
export function pitchState(input: PitchStateInput): ScoringState {
  return artefactState(input.hasPitch, input.mdDirty, input.savedMdHash, input.pitchHash);
}

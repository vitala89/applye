import { Profile, Settings } from '@applye/core';
import {
  ARTIFACT_CACHED_KEY,
  artifactCached,
  artifactPatch,
  artifactPrompt,
} from './profile-artifact.util';

function row(over: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    fullMd: '# Mira',
    scoringJson: '{"seniority":"senior"}',
    scoringHash: 'score-hash',
    pitchMd: 'old pitch',
    pitchHash: 'pitch-hash',
    targetArchetypes: '[{"name":"Staff Engineer"}]',
    updatedAt: '2026-08-05',
    ...over,
  };
}

const SETTINGS = { defaultDocLanguage: 'de' } as unknown as Settings;

describe('artifactCached', () => {
  it('is cached only when the hash matches and the artefact is there', () => {
    expect(artifactCached('scoring', row(), 'score-hash')).toBe(true);
    expect(artifactCached('pitch', row(), 'pitch-hash')).toBe(true);
  });

  it('is not cached when the text has moved on', () => {
    expect(artifactCached('scoring', row(), 'other')).toBe(false);
    expect(artifactCached('pitch', row(), 'other')).toBe(false);
  });

  /** A row that recorded a generation which never landed. Calling that cached
   * gives the user a button that reports success and produces nothing. */
  it('is not cached when the hash matches but the artefact is missing', () => {
    expect(artifactCached('scoring', row({ scoringJson: undefined }), 'score-hash')).toBe(false);
    expect(artifactCached('pitch', row({ pitchMd: undefined }), 'pitch-hash')).toBe(false);
  });

  /** Each artefact is keyed on its own hash. Sharing one would report the pitch
   * as fresh because the scoring profile happened to be. */
  it('does not accept the other artefact hash', () => {
    expect(artifactCached('scoring', row(), 'pitch-hash')).toBe(false);
    expect(artifactCached('pitch', row(), 'score-hash')).toBe(false);
  });

  it('is never cached with no saved row', () => {
    expect(artifactCached('scoring', null, 'score-hash')).toBe(false);
    expect(artifactCached('pitch', null, 'pitch-hash')).toBe(false);
  });

  it('has its own message per artefact', () => {
    expect(ARTIFACT_CACHED_KEY.scoring).not.toBe(ARTIFACT_CACHED_KEY.pitch);
  });
});

describe('artifactPrompt', () => {
  /** Machine-read when matching a job, never shown to the user. In the user's
   * own language it would not compare against job text read in English. */
  it('pins scoring to English regardless of the document language', () => {
    expect(artifactPrompt('scoring', '# Mira', SETTINGS)).toEqual({
      skill: 'profile-compress',
      vars: { profile_md: '# Mira' },
      language: 'en',
    });
  });

  /** The opposite: the user reads the pitch aloud. */
  it('renders the pitch in the configured document language', () => {
    expect(artifactPrompt('pitch', '# Mira', SETTINGS)).toEqual({
      skill: 'pitch',
      vars: { profile_md: '# Mira', duration: '60s', language: 'de' },
      language: 'de',
    });
  });

  it('falls back to English when no document language is set', () => {
    const p = artifactPrompt('pitch', '# Mira', {} as Settings);
    expect(p.language).toBe('en');
    expect(p.vars['language']).toBe('en');
  });
});

describe('artifactPatch', () => {
  /** `db_upsert_profile` overwrites every column it names, so anything this
   * artefact does not own has to be carried over or the write wipes it. */
  it('writes scoring and carries the pitch across untouched', () => {
    const patch = artifactPatch('scoring', row(), '# New', 'fresh json', 'new-hash');

    expect(patch.scoringJson).toBe('fresh json');
    expect(patch.scoringHash).toBe('new-hash');
    expect(patch.pitchMd).toBe('old pitch');
    expect(patch.pitchHash).toBe('pitch-hash');
  });

  it('writes the pitch and carries scoring across untouched', () => {
    const patch = artifactPatch('pitch', row(), '# New', 'fresh pitch', 'new-hash');

    expect(patch.pitchMd).toBe('fresh pitch');
    expect(patch.pitchHash).toBe('new-hash');
    expect(patch.scoringJson).toBe('{"seniority":"senior"}');
    expect(patch.scoringHash).toBe('score-hash');
  });

  it('carries the target archetypes across for either artefact', () => {
    expect(artifactPatch('scoring', row(), '# New', 't', 'h').targetArchetypes).toBe(
      '[{"name":"Staff Engineer"}]',
    );
    expect(artifactPatch('pitch', row(), '# New', 't', 'h').targetArchetypes).toBe(
      '[{"name":"Staff Engineer"}]',
    );
  });

  /** The text the artefact was generated from, not whatever the editor holds by
   * the time the call returns - otherwise the row describes markdown that was
   * never analysed. */
  it('writes the markdown it was given rather than the saved one', () => {
    expect(artifactPatch('scoring', row(), '# New', 't', 'h').fullMd).toBe('# New');
  });

  it('writes the first artefact of an empty row without inventing the other', () => {
    const patch = artifactPatch('pitch', null, '# New', 'fresh pitch', 'new-hash');

    expect(patch.pitchMd).toBe('fresh pitch');
    expect(patch.scoringJson).toBeUndefined();
    expect(patch.scoringHash).toBeUndefined();
    expect(patch.targetArchetypes).toBeUndefined();
  });
});

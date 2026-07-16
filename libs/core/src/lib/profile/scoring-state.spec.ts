import { scoringState, ScoringStateInput } from './scoring-state';

const FRESH: ScoringStateInput = {
  hasScoringJson: true,
  mdDirty: false,
  savedMdHash: 'h1',
  scoringHash: 'h1',
};

describe('scoringState', () => {
  it('reports none when no scoring profile has been generated', () => {
    expect(scoringState({ ...FRESH, hasScoringJson: false })).toBe('none');
  });

  it('reports none even when the hashes disagree, if there is nothing to be stale', () => {
    expect(scoringState({ ...FRESH, hasScoringJson: false, scoringHash: 'other' })).toBe('none');
  });

  it('reports unsaved while the markdown is edited but not saved', () => {
    expect(scoringState({ ...FRESH, mdDirty: true })).toBe('unsaved');
  });

  it('reports fresh when the saved markdown still hashes to the generation hash', () => {
    expect(scoringState(FRESH)).toBe('fresh');
  });

  // The regression this type exists for: saving an edited profile clears mdDirty without
  // regenerating the artefact, so a hash-blind check reports the artefact as cached precisely
  // when it has just gone stale.
  it('reports stale after a save changed the markdown, even though nothing is dirty', () => {
    expect(scoringState({ ...FRESH, savedMdHash: 'h2', scoringHash: 'h1' })).toBe('stale');
  });

  it('does not claim stale when the saved hash is not yet known', () => {
    expect(scoringState({ ...FRESH, savedMdHash: null })).toBe('fresh');
  });

  it('does not claim stale when the artefact carries no generation hash', () => {
    expect(scoringState({ ...FRESH, scoringHash: null })).toBe('fresh');
    expect(scoringState({ ...FRESH, scoringHash: undefined })).toBe('fresh');
  });

  it('prefers unsaved over stale when the markdown is both edited and out of date', () => {
    expect(scoringState({ ...FRESH, mdDirty: true, savedMdHash: 'h2', scoringHash: 'h1' })).toBe(
      'unsaved',
    );
  });
});

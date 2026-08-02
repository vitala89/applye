import { currentPhaseKey, tailorPhases } from './tailor-phases';

const states = (done: number, running: boolean) => tailorPhases(done, running).map((p) => p.state);

describe('tailorPhases', () => {
  it('offers only the first pass before anything has run', () => {
    expect(states(0, false)).toEqual(['ready', 'pending', 'pending']);
  });

  it('never offers a later pass as ready, because they run in order', () => {
    // Three ready buttons for a sequence that must run in order is the bug this
    // distinction exists to prevent.
    expect(states(1, false).filter((s) => s === 'ready')).toHaveLength(1);
    expect(states(0, false).filter((s) => s === 'ready')).toHaveLength(1);
  });

  it('marks the running pass while the earlier ones stay done', () => {
    expect(states(1, true)).toEqual(['done', 'running', 'pending']);
  });

  it('offers the next pass once the run stops between passes', () => {
    expect(states(1, false)).toEqual(['done', 'ready', 'pending']);
  });

  it('leaves nothing ready or running when all three are finished', () => {
    expect(states(3, false)).toEqual(['done', 'done', 'done']);
  });

  it('does not invent a fourth pass when the count runs past the end', () => {
    expect(states(4, false)).toEqual(['done', 'done', 'done']);
  });

  it('gives every phase a status key that matches its state', () => {
    expect(tailorPhases(1, true).map((p) => p.statusKey)).toEqual([
      'jobs.wizard.phase_done',
      'jobs.wizard.phase_running',
      'jobs.wizard.phase_pending',
    ]);
  });
});

describe('currentPhaseKey', () => {
  it('names the pass about to be generated', () => {
    expect(currentPhaseKey(0)).toBe('jobs.wizard.phase_xyz');
    expect(currentPhaseKey(1)).toBe('jobs.wizard.phase_critique');
    expect(currentPhaseKey(2)).toBe('jobs.wizard.phase_build');
  });

  it('clamps to the last pass rather than returning undefined', () => {
    // The count reaches three the moment the run finishes, and the line is
    // still on screen for a frame.
    expect(currentPhaseKey(3)).toBe('jobs.wizard.phase_build');
    expect(currentPhaseKey(99)).toBe('jobs.wizard.phase_build');
  });
});

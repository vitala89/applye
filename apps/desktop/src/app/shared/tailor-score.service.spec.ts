import { TestBed } from '@angular/core/testing';
import { ScoringCache } from '@applye/core';
import { TailorScoreService } from './tailor-score.service';

function scoreFor(jobId: number, score: number): ScoringCache {
  return {
    id: -1,
    jobId,
    profileHash: 'ph',
    jdHash: 'jh',
    language: 'en',
    score,
    dimensionsJson: '[]',
    missingKeywordsJson: '[]',
    redFlagsJson: '[]',
    atsPass: true,
    atsNotes: '',
    summary: '',
    beforeYouSubmitJson: '[]',
    modelUsed: 'economy',
    tokensInput: 1,
    tokensOutput: 2,
  };
}

describe('TailorScoreService', () => {
  function make(): TailorScoreService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(TailorScoreService);
  }

  it('begin() marks the job running and clears prior result', () => {
    const s = make();
    s.begin(7);
    expect(s.isRunningFor(7)).toBe(true);
    expect(s.running()).toBe(true);
    expect(s.runningJobId()).toBe(7);
    expect(s.resultFor(7)).toBeNull();
    expect(s.isErrorFor(7)).toBe(false);
  });

  it('succeed() stores the result and stops running', () => {
    const s = make();
    s.begin(7);
    s.succeed(7, scoreFor(7, 88), 'Updated');
    expect(s.isRunningFor(7)).toBe(false);
    expect(s.running()).toBe(false);
    expect(s.resultFor(7)?.score).toBe(88);
    expect(s.statusFor(7)).toBe('Updated');
  });

  it('fail() flags error but keeps a prior result', () => {
    const s = make();
    s.begin(7);
    s.succeed(7, scoreFor(7, 88), 'Updated');
    s.begin(7);
    s.fail(7, 'boom');
    // begin() cleared the result, so fail keeps null here
    expect(s.isErrorFor(7)).toBe(true);
    expect(s.isRunningFor(7)).toBe(false);
    expect(s.statusFor(7)).toBe('boom');
  });

  it('state is scoped per job - a different job reads empty', () => {
    const s = make();
    s.succeed(7, scoreFor(7, 88), 'Updated');
    expect(s.resultFor(8)).toBeNull();
    expect(s.isRunningFor(8)).toBe(false);
    expect(s.statusFor(8)).toBe('');
  });

  it('clear(jobId) only clears the matching job', () => {
    const s = make();
    s.succeed(7, scoreFor(7, 88), 'Updated');
    s.clear(8);
    expect(s.resultFor(7)?.score).toBe(88);
    s.clear(7);
    expect(s.resultFor(7)).toBeNull();
  });
});

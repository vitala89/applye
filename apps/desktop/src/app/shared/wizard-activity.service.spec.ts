import { TestBed } from '@angular/core/testing';
import { WizardActivityService } from './wizard-activity.service';

describe('WizardActivityService', () => {
  function make(): WizardActivityService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(WizardActivityService);
  }

  it('begin() records the running step for a job', () => {
    const s = make();
    s.begin(7, 'tailoring');
    expect(s.runningActivityFor(7)).toBe('tailoring');
    expect(s.isRunning(7, 'tailoring')).toBe(true);
    expect(s.active()).toEqual({ jobId: 7, activity: 'tailoring' });
  });

  it('only one step is tracked at a time - begin replaces', () => {
    const s = make();
    s.begin(7, 'tailoring');
    s.begin(7, 'scoring');
    expect(s.isRunning(7, 'tailoring')).toBe(false);
    expect(s.isRunning(7, 'scoring')).toBe(true);
  });

  it('is scoped per job', () => {
    const s = make();
    s.begin(7, 'reviewing');
    expect(s.runningActivityFor(8)).toBeNull();
    expect(s.isRunning(8, 'reviewing')).toBe(false);
  });

  it('end() clears only the matching (job, activity)', () => {
    const s = make();
    s.begin(7, 'scoring');
    s.end(7, 'tailoring'); // wrong activity - no-op
    expect(s.isRunning(7, 'scoring')).toBe(true);
    s.end(8, 'scoring'); // wrong job - no-op
    expect(s.isRunning(7, 'scoring')).toBe(true);
    s.end(7, 'scoring');
    expect(s.active()).toBeNull();
  });

  it('clear(jobId) only clears the matching job', () => {
    const s = make();
    s.begin(7, 'tailoring');
    s.clear(8);
    expect(s.isRunning(7, 'tailoring')).toBe(true);
    s.clear(7);
    expect(s.active()).toBeNull();
  });
});

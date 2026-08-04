import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobTailorStepComponent } from './job-tailor-step.component';
import { TailoringService } from '../../../shared/tailoring.service';
import { WizardActivityService } from '../../../shared/wizard-activity.service';

const JOB = { id: 7, title: 'Senior Frontend Engineer' } as Job;

/** The pieces of the injected services the step actually reads. */
function stubs() {
  return {
    tailor: {
      results: signal<{ pass: number }[]>([]),
      cancelled: signal(false),
      status: signal(''),
      error: signal(false),
      allChanges: signal<string[]>([]),
      allGaps: signal<string[]>([]),
    },
    /** Signal-backed, because `tailoring` is a computed: a plain Set would
     * never invalidate it and the test would read a stale false. */
    running: signal<string[]>([]),
  };
}

function setup(s: ReturnType<typeof stubs>) {
  TestBed.configureTestingModule({
    imports: [JobTailorStepComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: TailoringService, useValue: s.tailor },
      {
        provide: WizardActivityService,
        useValue: {
          isRunning: (id: number, activity: string) => s.running().includes(`${id}:${activity}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(JobTailorStepComponent);
  fixture.componentRef.setInput('job', JOB);
  fixture.componentRef.setInput('matchingCvs', []);
  fixture.componentRef.setInput('hasProfileText', true);
  fixture.componentRef.setInput('selectedBaseCvId', null);
  fixture.detectChanges();
  return fixture;
}

describe('JobTailorStepComponent', () => {
  /// The select hands back a string. An empty one means "tailor from the
  /// profile", and a bare `+''` would turn that into the document id 0 - a
  /// base CV that does not exist, chosen without the user asking for it.
  it('reads an empty base-CV choice as tailoring from the profile, not as id 0', () => {
    const s = stubs();
    const fixture = setup(s);
    const cmp = fixture.componentInstance as unknown as {
      onBaseCvChange: (v: string | number | null) => void;
    };
    const seen: (number | null)[] = [];
    fixture.componentInstance.baseCvChange.subscribe((v) => seen.push(v));

    cmp.onBaseCvChange('');
    cmp.onBaseCvChange(null);
    cmp.onBaseCvChange('11');

    expect(seen).toEqual([null, null, 11]);
  });

  /// The phase cards and the "AI thinking" line both read whether a tailoring
  /// run is in flight *for this job*. Another job's run must not animate this
  /// one, which is why the activity lookup is keyed by the job id.
  it('reports tailoring only while this job has a run in flight', () => {
    const s = stubs();
    const fixture = setup(s);
    const cmp = fixture.componentInstance as unknown as {
      tailoring: () => boolean;
      tailorPhases: () => { state: string }[];
    };

    expect(cmp.tailoring()).toBe(false);
    expect(cmp.tailorPhases().map((p) => p.state)).toEqual(['ready', 'pending', 'pending']);

    s.running.set(['99:tailoring']);
    expect(cmp.tailoring()).toBe(false);

    s.running.set(['99:tailoring', '7:tailoring']);
    expect(cmp.tailoring()).toBe(true);
    expect(cmp.tailorPhases().map((p) => p.state)).toEqual(['running', 'pending', 'pending']);
  });

  /// The step renders the service's state directly rather than through page
  /// aliases; a finished pass has to reach the phase cards and the thinking
  /// line without the page passing anything down.
  it('follows the tailoring service as passes complete', () => {
    const s = stubs();
    const fixture = setup(s);
    const cmp = fixture.componentInstance as unknown as {
      tailorPhases: () => { state: string }[];
      currentPhaseKey: () => string;
    };

    expect(cmp.currentPhaseKey()).toBe('jobs.wizard.phase_xyz');

    s.tailor.results.set([{ pass: 1 }, { pass: 2 }]);
    expect(cmp.tailorPhases().map((p) => p.state)).toEqual(['done', 'done', 'ready']);
    expect(cmp.currentPhaseKey()).toBe('jobs.wizard.phase_build');
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobTailorStepComponent } from './job-tailor-step.component';
import { TailoringService } from '@applye/application';
import { WizardActivityService } from '@applye/application';

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

function setup(s: ReturnType<typeof stubs>, matchingCvs: { id: number }[] = []) {
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
  fixture.componentRef.setInput('matchingCvs', matchingCvs);
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

  /// A pass that fails after at least one landed used to leave the step with no
  /// button at all: not the from-scratch picker (results are non-empty), not
  /// the "AI thinking" row (not running), not the tailored badge (fewer than
  /// three). The retry button is what closes that gap.
  it('offers a retry that re-emits startTailoring when a later pass fails', () => {
    const s = stubs();
    s.tailor.results.set([{ pass: 1 }]);
    s.tailor.error.set(true);
    s.tailor.status.set('Pass 2 returned invalid JSON');
    const fixture = setup(s);

    const seen: void[] = [];
    fixture.componentInstance.startTailoring.subscribe(() => seen.push(undefined));

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const retryBtn = buttons.find((b) => b.textContent?.includes('common.retry'));
    expect(retryBtn).toBeTruthy();

    retryBtn?.click();
    expect(seen).toHaveLength(1);
  });

  /**
   * The reported dead end (F1): a user with no explicit way to skip tailoring
   * landed at Review documents with Generate CV disabled and no linked CV.
   * "Use an existing resume" is the step-2 half of the fix - only offered
   * when there is a library CV to jump toward.
   */
  describe('use an existing resume', () => {
    it('offers it once the library has a CV to fall back on', () => {
      const s = stubs();
      const fixture = setup(s, [{ id: 11 }]);

      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );
      const useExistingBtn = buttons.find((b) =>
        b.textContent?.includes('jobs.wizard.tailor_use_existing'),
      );
      expect(useExistingBtn).toBeTruthy();

      const seen: void[] = [];
      fixture.componentInstance.useExisting.subscribe(() => seen.push(undefined));
      useExistingBtn?.click();

      expect(seen).toHaveLength(1);
    });

    it('stays hidden with no library CV to jump toward', () => {
      const s = stubs();
      const fixture = setup(s, []);

      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );
      expect(buttons.some((b) => b.textContent?.includes('jobs.wizard.tailor_use_existing'))).toBe(
        false,
      );
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocumentLibraryItem, Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobExportApplyStepComponent } from './job-export-apply-step.component';
import { DocumentExportService } from '@applye/application';
import { JobActionsService } from '@applye/application';
import { LinkedDocumentsService } from '@applye/application';
import { WizardActivityService } from '@applye/application';

const JOB = { id: 7, title: 'Senior Frontend Engineer' } as Job;
const CV = { id: 3, kind: 'cv' } as DocumentLibraryItem;
const COVER_LETTER = { id: 4, kind: 'cover_letter' } as DocumentLibraryItem;

/** The pieces of the injected services the step actually reads or calls. */
function stubs() {
  const runs: { kind: string; format: string; item: DocumentLibraryItem | null }[] = [];
  const commits: string[] = [];
  return {
    runs,
    commits,
    exportSvc: {
      exporting: signal<string | false>(false),
      status: signal(''),
      error: signal(false),
      lastExport: signal<{ filePath: string } | null>(null),
      run: async (
        kind: string,
        format: string,
        item: DocumentLibraryItem | null,
        onExported: (k: string) => Promise<void>,
      ) => {
        runs.push({ kind, format, item });
        await onExported(kind);
      },
      openFile: (path: string) => commits.push(`open:${path}`),
      revealFile: (path: string) => commits.push(`reveal:${path}`),
    },
    linkedDocs: {
      cv: signal<DocumentLibraryItem | null>(CV),
      coverLetter: signal<DocumentLibraryItem | null>(COVER_LETTER),
      commit: async (kind: string) => {
        commits.push(`commit:${kind}`);
      },
    },
    /** Signal-backed, because `tailoring` is a computed: a plain Set would
     * never invalidate it and the test would read a stale false. */
    running: signal<string[]>([]),
  };
}

function setup(s: ReturnType<typeof stubs>) {
  TestBed.configureTestingModule({
    imports: [JobExportApplyStepComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: DocumentExportService, useValue: s.exportSvc },
      { provide: LinkedDocumentsService, useValue: s.linkedDocs },
      { provide: JobActionsService, useValue: { message: signal('') } },
      {
        provide: WizardActivityService,
        useValue: {
          isRunning: (id: number, activity: string) => s.running().includes(`${id}:${activity}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(JobExportApplyStepComponent);
  fixture.componentRef.setInput('job', JOB);
  fixture.detectChanges();
  return fixture;
}

type Internals = {
  tailoring: () => boolean;
  doExport: (kind: string, format: string) => Promise<void>;
  openExportedFile: (path: string) => void;
  revealExportedFile: (path: string) => void;
};

describe('JobExportApplyStepComponent', () => {
  /// The export half is hidden while a tailoring run is in flight, because the
  /// documents it would write out are the ones being rewritten. Another job's
  /// run must not hide this one, which is why the lookup is keyed by job id.
  it('reports tailoring only while this job has a run in flight', () => {
    const s = stubs();
    const cmp = setup(s).componentInstance as unknown as Internals;

    expect(cmp.tailoring()).toBe(false);

    s.running.set(['99:tailoring']);
    expect(cmp.tailoring()).toBe(false);

    s.running.set(['99:tailoring', '7:tailoring']);
    expect(cmp.tailoring()).toBe(true);
  });

  /// Two buttons call the same method and only the kind tells them apart. If
  /// the cover-letter button ever exported the CV, the user would get the wrong
  /// document under the right filename, which nothing downstream would catch.
  it('exports the linked document that matches the requested kind', async () => {
    const s = stubs();
    const cmp = setup(s).componentInstance as unknown as Internals;

    await cmp.doExport('cv', 'pdf');
    await cmp.doExport('cover_letter', 'pdf');

    expect(s.runs.map((r) => [r.kind, r.item])).toEqual([
      ['cv', CV],
      ['cover_letter', COVER_LETTER],
    ]);
    expect(s.commits).toEqual(['commit:cv', 'commit:cover_letter']);
  });

  /// The step renders the export service's state directly rather than through
  /// page aliases, so a status the service sets has to reach it with nothing
  /// passed down.
  it('follows the export service without the page passing anything down', () => {
    const s = stubs();
    const fixture = setup(s);

    s.exportSvc.lastExport.set({ filePath: '/tmp/cv.pdf' });
    s.exportSvc.status.set('jobs.exporting');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('/tmp/cv.pdf');

    const cmp = fixture.componentInstance as unknown as Internals;
    cmp.openExportedFile('/tmp/cv.pdf');
    cmp.revealExportedFile('/tmp/cv.pdf');
    expect(s.commits).toEqual(['open:/tmp/cv.pdf', 'reveal:/tmp/cv.pdf']);
  });

  /// Start over resets tailoring, the score and the export state and then moves
  /// the wizard back to step 1. All of that is page state, so the step emits.
  it('emits start over instead of resetting anything itself', () => {
    const s = stubs();
    const fixture = setup(s);
    let emitted = 0;
    fixture.componentInstance.startOver.subscribe(() => (emitted += 1));

    const button: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('.export-startover');
    expect(button).not.toBeNull();
    button?.click();

    expect(emitted).toBe(1);
    expect(s.exportSvc.status()).toBe('');
  });
});

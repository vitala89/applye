import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Application, DocumentLibraryItem, Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobDocumentsStepComponent } from './job-documents-step.component';
import { CvGapDialogService } from '../../../shared/cv-gap-dialog.service';
import { DocumentReviewTargetsService } from '../../../shared/document-review-targets.service';
import { DocumentGenService } from '../../../shared/document-gen.service';
import { DocumentReviewStatusService } from '../../../shared/document-review-status.service';
import { DocumentRegionTag, FinalChecksService } from '../../../shared/final-checks.service';
import { LinkedDocumentsService } from '../../../shared/linked-documents.service';
import { CvPhotoPromptService } from '../cv-photo-prompt.service';

const JOB = { id: 7, title: 'Senior Frontend Engineer' } as Job;

function stubs() {
  const regionsChosen: DocumentRegionTag[] = [];
  const outdated = signal(false);
  const finalChecks = {
    checks: signal<{ inputHash: string } | null>({ inputHash: 'h' }),
    outdated,
    statusKey: (status: string) => `jobs.wizard.final_check_${status}`,
    needRetailor: () => false,
  };
  return {
    regionsChosen,
    outdated,
    finalChecks,
    gapSvc: {
      analyzing: signal(false),
      open: signal(false),
      questions: signal<{ id: string; prompt: string }[]>([]),
    },
    photoPrompt: {
      onRegionChosen: (region: DocumentRegionTag) => regionsChosen.push(region),
    },
    linkedDocs: {
      cv: signal<DocumentLibraryItem | null>(null),
      coverLetter: signal<DocumentLibraryItem | null>(null),
    },
    /** Only reached through the nested document cards, which this step renders
     * for real so the forwarding test exercises the actual outputs. */
    docGen: { isPreparing: () => false, anyPreparing: () => false },
    reviewStatus: {
      chooseCvOpen: signal(false),
      chooseCoverLetterOpen: signal(false),
      status: signal(''),
      error: signal(false),
    },
  };
}

function setup(s: ReturnType<typeof stubs>) {
  TestBed.configureTestingModule({
    imports: [JobDocumentsStepComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: FinalChecksService, useValue: s.finalChecks },
      { provide: LinkedDocumentsService, useValue: s.linkedDocs },
      { provide: CvGapDialogService, useValue: s.gapSvc },
      { provide: CvPhotoPromptService, useValue: s.photoPrompt },
      { provide: DocumentGenService, useValue: s.docGen },
      { provide: DocumentReviewStatusService, useValue: s.reviewStatus },
      // The real service: the staleness rule it owns is the point of the two
      // selects, and stubbing it would leave that rule untested.
      DocumentReviewTargetsService,
    ],
  });
  const fixture = TestBed.createComponent(JobDocumentsStepComponent);
  fixture.componentRef.setInput('job', JOB);
  fixture.componentRef.setInput('application', null as Application | null);
  fixture.componentRef.setInput('matchingCvs', [] as DocumentLibraryItem[]);
  fixture.componentRef.setInput('coverLetters', [] as DocumentLibraryItem[]);
  fixture.componentRef.setInput('finalTailoredCvMd', '');
  fixture.componentRef.setInput('tailoring', false);
  fixture.detectChanges();
  return fixture;
}

type Internals = {
  onRegionChange: (region: DocumentRegionTag) => void;
  onLanguageChange: (language: 'de' | 'en') => void;
};

describe('JobDocumentsStepComponent', () => {
  /// Both selects stale a stored final-checks result, which used to be written
  /// twice - once in a page method and once inline in the template. Either path
  /// missing the rule leaves a green tick standing over changed documents.
  it('stales the final checks from either select', () => {
    const s = stubs();
    const cmp = setup(s).componentInstance as unknown as Internals;

    cmp.onRegionChange('de');
    expect(s.outdated()).toBe(true);

    s.outdated.set(false);
    cmp.onLanguageChange('de');
    expect(s.outdated()).toBe(true);
  });

  /// With no stored result there is nothing to flag stale, and setting the flag
  /// anyway would render an "outdated" banner over a card that never ran.
  it('does not flag anything stale when no result is stored', () => {
    const s = stubs();
    s.finalChecks.checks.set(null);
    const cmp = setup(s).componentInstance as unknown as Internals;

    cmp.onRegionChange('de');
    expect(s.outdated()).toBe(false);
  });

  /// The German market is the only one that raises the photo prompt, and the
  /// prompt itself is rendered by the page - so the step tells the service and
  /// stops there.
  it('tells the photo prompt which market was chosen', () => {
    const s = stubs();
    const cmp = setup(s).componentInstance as unknown as Internals;

    cmp.onRegionChange('de');
    cmp.onRegionChange('generic');

    expect(s.regionsChosen).toEqual(['de', 'generic']);
  });

  /// Every card action continues into page orchestration - navigation into the
  /// document editor, drafting, linking. The step forwards them unchanged.
  it('forwards the document-card actions to the page', () => {
    const s = stubs();
    const fixture = setup(s);
    const seen: string[] = [];
    fixture.componentInstance.openCv.subscribe((id) => seen.push(`openCv:${id}`));
    fixture.componentInstance.createCoverLetter.subscribe(() => seen.push('createCoverLetter'));
    fixture.componentInstance.chooseDocument.subscribe((r) =>
      seen.push(`choose:${r.kind}:${r.id}`),
    );

    const cards = fixture.debugElement.children.find(
      (c) => c.nativeElement.tagName.toLowerCase() === 'app-job-document-cards',
    );
    cards?.componentInstance.openCv.emit(3);
    cards?.componentInstance.createCoverLetter.emit();
    cards?.componentInstance.chooseDocument.emit({ kind: 'cv', id: 9 });

    expect(seen).toEqual(['openCv:3', 'createCoverLetter', 'choose:cv:9']);
  });

  /// The gap dialog is mounted by this step but answered by the page, which
  /// writes the answers into the profile and restarts the blocked draft.
  it('mounts the gap dialog only while it is open and forwards its result', () => {
    const s = stubs();
    const fixture = setup(s);
    expect(fixture.nativeElement.querySelector('app-cv-gap-dialog')).toBeNull();

    s.gapSvc.open.set(true);
    s.gapSvc.questions.set([{ id: 'q1', prompt: 'Which stack?' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-cv-gap-dialog')).not.toBeNull();

    let cancelled = 0;
    fixture.componentInstance.gapCancel.subscribe(() => (cancelled += 1));
    const dialog = fixture.debugElement.children.find(
      (c) => c.nativeElement.tagName.toLowerCase() === 'app-cv-gap-dialog',
    );
    dialog?.componentInstance.cancel.emit();
    expect(cancelled).toBe(1);
  });
});

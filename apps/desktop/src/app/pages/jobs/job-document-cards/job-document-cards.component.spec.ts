import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Application, DocumentLibraryItem, Job } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { JobDocumentCardsComponent } from './job-document-cards.component';
import { DocumentGenService } from '@applye/application';
import { CvGapDialogService } from '@applye/application';
import { FinalChecksService } from '../../../shared/final-checks.service';
import { LinkedDocumentsService } from '@applye/application';
import { DocumentReviewStatusService } from '../../../shared/document-review-status.service';

const JOB = { id: 7, title: 'Senior Frontend Engineer' } as Job;
const CV = { id: 11, label: 'Tailored CV' } as DocumentLibraryItem;
const LETTER = { id: 12, label: 'Tailored Letter' } as DocumentLibraryItem;

/** The pieces of the injected services the cards actually read. */
function stubs() {
  return {
    linked: { cv: signal<DocumentLibraryItem | null>(null), coverLetter: signal(null) },
    review: {
      status: signal(''),
      error: signal(false),
      chooseCvOpen: signal(false),
      chooseCoverLetterOpen: signal(false),
    },
    finalChecks: { checks: signal<{ inputHash?: string } | null>(null), outdated: signal(false) },
    gap: { open: signal(false) },
    docGen: { preparing: new Set<string>() },
  };
}

function setup(s: ReturnType<typeof stubs>, application: Application | null = null) {
  TestBed.configureTestingModule({
    imports: [JobDocumentCardsComponent],
    providers: [
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
      { provide: LinkedDocumentsService, useValue: s.linked },
      { provide: DocumentReviewStatusService, useValue: s.review },
      { provide: FinalChecksService, useValue: s.finalChecks },
      { provide: CvGapDialogService, useValue: s.gap },
      {
        provide: DocumentGenService,
        useValue: {
          isPreparing: (id: number, kind: string) => s.docGen.preparing.has(`${id}:${kind}`),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(JobDocumentCardsComponent);
  fixture.componentRef.setInput('job', JOB);
  fixture.componentRef.setInput('application', application);
  fixture.componentRef.setInput('matchingCvs', [CV]);
  fixture.componentRef.setInput('coverLetters', [LETTER]);
  fixture.componentRef.setInput('finalTailoredCvMd', '# CV');
  fixture.detectChanges();
  return fixture;
}

describe('JobDocumentCardsComponent', () => {
  it('reports a missing CV until one is linked, then ready once checks have run', () => {
    const s = stubs();
    const fixture = setup(s);
    const cmp = fixture.componentInstance as unknown as { cvReviewStatus: () => string };

    expect(cmp.cvReviewStatus()).toBe('missing');

    s.linked.cv.set(CV);
    expect(cmp.cvReviewStatus()).toBe('linked');

    s.finalChecks.checks.set({ inputHash: 'abc' });
    expect(cmp.cvReviewStatus()).toBe('ready');

    s.finalChecks.outdated.set(true);
    expect(cmp.cvReviewStatus()).toBe('needs_review');
  });

  /// A CV draft parked on the gap dialog must not read as a working one: the
  /// badge is the only thing telling the user why nothing is happening.
  it('shows a blocked CV draft as needs_input rather than generating', () => {
    const s = stubs();
    s.docGen.preparing.add('7:cv');
    const fixture = setup(s);
    const cmp = fixture.componentInstance as unknown as { cvReviewStatus: () => string };

    expect(cmp.cvReviewStatus()).toBe('generating');

    s.gap.open.set(true);
    expect(cmp.cvReviewStatus()).toBe('needs_input');
  });

  /// The cover letter has no gap dialog, so a preparing draft is always
  /// `generating` - the CV's `awaitingInput` must not leak across the cards.
  it('never marks the cover letter as needs_input', () => {
    const s = stubs();
    s.docGen.preparing.add('7:cover_letter');
    s.gap.open.set(true);
    const fixture = setup(s);
    const cmp = fixture.componentInstance as unknown as {
      coverLetterReviewStatus: () => string;
    };

    expect(cmp.coverLetterReviewStatus()).toBe('generating');
  });

  it('emits the document the choose-existing select picked, keyed by kind', () => {
    const s = stubs();
    s.review.chooseCvOpen.set(true);
    const fixture = setup(s);
    let emitted: { kind: string; id: number | null } | null = null;
    fixture.componentInstance.chooseDocument.subscribe((e) => (emitted = e));

    const select: HTMLSelectElement = fixture.nativeElement.querySelector(
      '.document-review-card__select',
    );
    select.value = String(CV.id);
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(emitted).toEqual({ kind: 'cv', id: CV.id });
  });

  /// The page owns every one of these flows; the cards only ask for them.
  it('emits create and review requests without acting on them', () => {
    const s = stubs();
    s.linked.cv.set(CV);
    const fixture = setup(s);
    const seen: string[] = [];
    fixture.componentInstance.openCv.subscribe((id) => seen.push(`open:${id}`));
    fixture.componentInstance.createCv.subscribe(() => seen.push('create'));

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.document-review-card__actions button'),
    );
    buttons[0].click();
    buttons[1].click();

    expect(seen).toEqual([`open:${CV.id}`, 'create']);
  });
});

import { TestBed } from '@angular/core/testing';
import { CvGapDialog } from './cv-gap-dialog.component';
import { TranslateService } from '@applye/i18n';

import type { CvGapQuestion } from '@applye/core';

function setup(questions: CvGapQuestion[], analyzing = false, kind: 'cv' | 'cover_letter' = 'cv') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CvGapDialog],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture = TestBed.createComponent(CvGapDialog);
  fixture.componentRef.setInput('questions', questions);
  fixture.componentRef.setInput('analyzing', analyzing);
  fixture.componentRef.setInput('kind', kind);
  fixture.detectChanges();
  return fixture;
}

const QS: CvGapQuestion[] = [
  { id: 'q1', category: 'skill', question: 'Kubernetes?', hint: null },
  { id: 'q2', category: 'language', question: 'German level?', hint: null },
];

describe('CvGapDialog', () => {
  it('collects answers and emits them with saveToProfile on submit', () => {
    const fixture = setup(QS);
    const cmp = fixture.componentInstance as unknown as {
      setAnswer: (t: string) => void;
      next: () => void;
      toggleSaveToProfile: (v: boolean) => void;
      doSubmit: () => void;
    };
    let emitted: { answers: unknown[]; saveToProfile: boolean } | null = null;
    fixture.componentInstance.submit.subscribe((e) => (emitted = e));

    cmp.setAnswer('2 years');
    cmp.next(); // -> q2
    cmp.setAnswer('B2');
    cmp.next(); // -> review
    cmp.toggleSaveToProfile(true);
    cmp.doSubmit();

    expect(emitted).toEqual({
      answers: [
        { id: 'q1', question: 'Kubernetes?', answer: '2 years' },
        { id: 'q2', question: 'German level?', answer: 'B2' },
      ],
      saveToProfile: true,
    });
  });

  it('records an empty answer when a question is skipped', () => {
    const fixture = setup(QS);
    const cmp = fixture.componentInstance as unknown as {
      skip: () => void;
      setAnswer: (t: string) => void;
      next: () => void;
      doSubmit: () => void;
    };
    let emitted: { answers: { answer: string }[] } | null = null;
    fixture.componentInstance.submit.subscribe((e) => (emitted = e));

    cmp.skip(); // q1 -> ''
    cmp.setAnswer('B2');
    cmp.next(); // q2 -> review
    cmp.doSubmit();

    expect(emitted!.answers).toEqual([
      { id: 'q1', question: 'Kubernetes?', answer: '' },
      { id: 'q2', question: 'German level?', answer: 'B2' },
    ]);
  });

  /**
   * The reported bug: the CV and cover-letter flows share this one dialog,
   * and its copy stayed hardcoded to the CV ("Checking your CV against this
   * job...", "Add these to your CV?", "Generate CV") even while it was
   * filling gaps for a cover letter. `kind` is what the copy keys off now.
   */
  describe('kind-specific copy', () => {
    it('shows CV keys by default, while analyzing and at review', () => {
      const analyzingFixture = setup(QS, true);
      expect(analyzingFixture.nativeElement.textContent).toContain('jobs.gap.analyzing');
      expect(analyzingFixture.nativeElement.textContent).not.toContain(
        'jobs.gap.analyzing_cover_letter',
      );

      const reviewFixture = setup([], false);
      expect(reviewFixture.nativeElement.textContent).toContain('jobs.gap.review_title');
      expect(reviewFixture.nativeElement.textContent).toContain('jobs.gap.generate');
      expect(reviewFixture.nativeElement.textContent).not.toContain(
        'jobs.gap.review_title_cover_letter',
      );
    });

    it('switches to cover-letter keys when kind is cover_letter', () => {
      const analyzingFixture = setup(QS, true, 'cover_letter');
      expect(analyzingFixture.nativeElement.textContent).toContain(
        'jobs.gap.analyzing_cover_letter',
      );

      const reviewFixture = setup([], false, 'cover_letter');
      expect(reviewFixture.nativeElement.textContent).toContain(
        'jobs.gap.review_title_cover_letter',
      );
      expect(reviewFixture.nativeElement.textContent).toContain('jobs.gap.generate_cover_letter');
    });
  });
});

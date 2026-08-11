import { TestBed } from '@angular/core/testing';
import { CvGapDialog } from './cv-gap-dialog.component';
import { TranslateService } from '@applye/i18n';

import type { CvGapQuestion } from '@applye/core';

function setup(questions: CvGapQuestion[], analyzing = false) {
  TestBed.configureTestingModule({
    imports: [CvGapDialog],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture = TestBed.createComponent(CvGapDialog);
  fixture.componentRef.setInput('questions', questions);
  fixture.componentRef.setInput('analyzing', analyzing);
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
});

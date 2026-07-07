import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY_FORM, ProfileForm } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ScoringSummaryComponent } from './scoring-summary.component';

const form: ProfileForm = {
  ...EMPTY_FORM,
  name: 'Vitalii',
  title: 'Senior FE',
  location: 'Germany',
  skills: ['React'],
};

function setup(scoringJson: string | null, f: ProfileForm = form) {
  TestBed.configureTestingModule({
    imports: [ScoringSummaryComponent],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture: ComponentFixture<ScoringSummaryComponent> =
    TestBed.createComponent(ScoringSummaryComponent);
  fixture.componentRef.setInput('scoringJson', scoringJson);
  fixture.componentRef.setInput('form', f);
  fixture.detectChanges();
  return fixture;
}

describe('ScoringSummaryComponent', () => {
  it('derives strengths from parsed scoring skills + domains + seniority', () => {
    const f = setup(
      '```json\n{"seniority":"senior","skills":["React","TS"],"domains":["Frontend"]}\n```',
    );
    const c = f.componentInstance;
    expect(c.strengths()).toEqual(['senior', 'React', 'TS', 'Frontend']);
  });

  it('computes completeness and gaps from the form, not the JSON', () => {
    const f = setup('```json\n{}\n```');
    const c = f.componentInstance;
    expect(c.completeness()).toBe(profileFilledPercent());
    expect(c.gaps()).toEqual(['experience', 'education', 'languages']);
  });

  it('falls back to raw JSON display when scoringJson is malformed', () => {
    const f = setup('not-json');
    const c = f.componentInstance;
    expect(c.scoring()).toBeNull();
    expect(c.prettyJson()).toBe('not-json');
  });

  it('emits addField when a gap add-link is clicked', () => {
    const f = setup('```json\n{}\n```');
    const c = f.componentInstance;
    const emitted: string[] = [];
    c.addField.subscribe((k) => emitted.push(k));
    c.onAdd('experience');
    expect(emitted).toEqual(['experience']);
  });
});

// form has title, location, skills filled (3 of 6) → 50%
function profileFilledPercent(): number {
  return 50;
}

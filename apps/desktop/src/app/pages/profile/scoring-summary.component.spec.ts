import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { ScoringSummaryComponent } from './scoring-summary.component';

function setup(scoringJson: string | null) {
  TestBed.configureTestingModule({
    imports: [ScoringSummaryComponent],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture: ComponentFixture<ScoringSummaryComponent> =
    TestBed.createComponent(ScoringSummaryComponent);
  fixture.componentRef.setInput('scoringJson', scoringJson);
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

  it('derives metaLine from the scoring profile only', () => {
    const f = setup(
      '```json\n{"seniority":"senior","location":"Berlin","domains":["Frontend"]}\n```',
    );
    const c = f.componentInstance;
    expect(c.metaLine()).toBe('senior · Berlin · Frontend');
  });

  it('falls back to raw JSON display when scoringJson is malformed', () => {
    const f = setup('not-json');
    const c = f.componentInstance;
    expect(c.scoring()).toBeNull();
    expect(c.prettyJson()).toBe('not-json');
  });
});

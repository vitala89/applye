import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoreGauge } from './score-gauge';

describe('ScoreGauge', () => {
  let component: ScoreGauge;
  let fixture: ComponentFixture<ScoreGauge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScoreGauge],
    }).compileComponents();

    fixture = TestBed.createComponent(ScoreGauge);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('score', 82);
    fixture.componentRef.setInput('verdict', 'Strong match');
    fixture.componentRef.setInput('cached', true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the score number', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge__number')?.textContent?.trim()).toBe('82');
  });

  it('shows the cache chip when cached is true', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge__cache-chip')).toBeTruthy();
  });

  it('bands the score correctly at the high threshold', () => {
    fixture.componentRef.setInput('score', 82);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge--high')).toBeTruthy();
  });
});

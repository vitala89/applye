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

  it('defaults to the large size (132px diameter)', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const root = el.querySelector('.score-gauge') as HTMLElement;
    expect(root.style.width).toBe('132px');
  });

  it('renders the small size when requested', () => {
    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const root = el.querySelector('.score-gauge') as HTMLElement;
    expect(root.style.width).toBe('76px');
  });

  it('bands the score correctly at the high threshold', () => {
    fixture.componentRef.setInput('score', 82);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge--high')).toBeTruthy();
  });

  it('bands a mid-range score as mid', () => {
    fixture.componentRef.setInput('score', 60);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge--mid')).toBeTruthy();
  });

  it('bands a low score as low', () => {
    fixture.componentRef.setInput('score', 15);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.score-gauge--low')).toBeTruthy();
  });
});

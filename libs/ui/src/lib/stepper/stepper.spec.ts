import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Stepper } from './stepper';

describe('Stepper', () => {
  let component: Stepper;
  let fixture: ComponentFixture<Stepper>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stepper],
    }).compileComponents();

    fixture = TestBed.createComponent(Stepper);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('steps', ['One', 'Two', 'Three']);
    fixture.componentRef.setInput('activeIndex', 1);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders one marker per step', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.stepper__marker').length).toBe(3);
  });

  it('renders a checkmark for done steps and a number for the rest', () => {
    fixture.detectChanges();
    const markers = fixture.nativeElement.querySelectorAll('.stepper__marker');
    expect(markers[0].textContent.trim()).toBe('✓');
    expect(markers[1].textContent.trim()).toBe('2');
    expect(markers[2].textContent.trim()).toBe('3');
  });

  it('marks the active step distinctly from done and pending', () => {
    fixture.detectChanges();
    const markers = fixture.nativeElement.querySelectorAll('.stepper__marker');
    expect(markers[0].classList.contains('stepper__marker--done')).toBe(true);
    expect(markers[1].classList.contains('stepper__marker--active')).toBe(true);
    expect(markers[2].classList.contains('stepper__marker--done')).toBe(false);
    expect(markers[2].classList.contains('stepper__marker--active')).toBe(false);
  });

  it('renders one fewer connector than steps', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.stepper__connector').length).toBe(2);
  });
});

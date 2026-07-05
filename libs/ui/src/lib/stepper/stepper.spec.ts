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

  it('renders one dot per step', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.stepper__dot').length).toBe(3);
  });

  it('emits next when Next is clicked', () => {
    fixture.detectChanges();
    let emitted = false;
    component.next.subscribe(() => (emitted = true));
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn--primary');
    btn.click();
    expect(emitted).toBe(true);
  });

  it('emits back when Back is clicked', () => {
    fixture.detectChanges();
    let emitted = false;
    component.back.subscribe(() => (emitted = true));
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-ghost');
    btn.click();
    expect(emitted).toBe(true);
  });

  it('disables Back on the first step', () => {
    fixture.componentRef.setInput('activeIndex', 0);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-ghost');
    expect(btn.disabled).toBe(true);
  });
});

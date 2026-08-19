import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AiService, DbService, DocumentsGateway, JobsGateway } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { OnboardingTargetingStore } from '@applye/application';
import { OnboardingTargetingStepComponent } from './onboarding-targeting-step.component';

describe('OnboardingTargetingStepComponent', () => {
  let fixture: ComponentFixture<OnboardingTargetingStepComponent>;
  let targeting: OnboardingTargetingStore;

  function chips(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.ob__role-chip'));
  }

  beforeEach(() => {
    // One stub, two tokens - the style check comes from `DocumentsGateway` now.
    const dbStub = {};
    TestBed.configureTestingModule({
      imports: [OnboardingTargetingStepComponent],
      providers: [
        OnboardingTargetingStore,
        TranslateService,
        { provide: DbService, useValue: dbStub },
        { provide: JobsGateway, useValue: dbStub },
        { provide: DocumentsGateway, useValue: dbStub },
        { provide: AiService, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(OnboardingTargetingStepComponent);
    targeting = TestBed.inject(OnboardingTargetingStore);
    fixture.detectChanges();
  });

  it('draws every offered role and marks the selected ones', () => {
    targeting.suggestedRoles.set(['Staff FE', 'Tech Lead']);
    targeting.archetypes.set(['Tech Lead']);
    fixture.detectChanges();

    expect(chips().map((c) => c.textContent?.trim())).toEqual(['Staff FE', 'Tech Lead']);
    expect(chips()[0].classList.contains('ob__role-chip--on')).toBe(false);
    expect(chips()[1].classList.contains('ob__role-chip--on')).toBe(true);
  });

  it('toggles a role through the store', () => {
    targeting.suggestedRoles.set(['Staff FE']);
    fixture.detectChanges();

    chips()[0].click();
    expect(targeting.archetypes()).toEqual(['Staff FE']);

    fixture.detectChanges();
    chips()[0].click();
    expect(targeting.archetypes()).toEqual([]);
  });

  it('adds a typed role on Enter and clears the field', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.ob__role-add');
    input.value = '  Principal FE  ';

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(targeting.archetypes()).toEqual(['Principal FE']);
    expect(input.value).toBe('');
  });

  /** The call needs the resume text and the wizard's AI dispatch, neither of
   * which is this step's to know. */
  it('asks the wizard to re-suggest rather than calling anything itself', () => {
    let asked = 0;
    fixture.componentInstance.suggestRequested.subscribe(() => asked++);

    const suggest: HTMLButtonElement = fixture.nativeElement.querySelector('.ob__section button');
    suggest.click();

    expect(asked).toBe(1);
  });

  it('disables the suggest button while one is running', () => {
    targeting.suggesting.set(true);
    fixture.detectChanges();

    const suggest: HTMLButtonElement = fixture.nativeElement.querySelector('.ob__section button');
    expect(suggest.disabled).toBe(true);
  });

  it('writes the comp range through the store, marking it hand-edited', () => {
    const numbers: HTMLInputElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.ob__comp-number'),
    );
    numbers[0].value = '95';
    numbers[0].dispatchEvent(new Event('input'));

    expect(targeting.compMin()).toBe(95);
    expect(targeting.compTouched()).toBe(true);
  });

  /** The band runs 50-300K, so 100-250K insets the fill by a fifth on each
   * side. The store's own value keeps one decimal; the DOM normalises it, so
   * both are asserted rather than guessing which one this test is about. */
  it('draws the track from the current range', () => {
    targeting.compMin.set(100);
    targeting.compMax.set(250);
    fixture.detectChanges();

    expect(targeting.compLeft()).toBe('20.0%');
    expect(targeting.compRight()).toBe('20.0%');

    const fill: HTMLElement = fixture.nativeElement.querySelector('.ob__comp-track-fill');
    expect(fill.style.left).toBe('20%');
    expect(fill.style.right).toBe('20%');
  });

  it('clamps the fill when the range runs past the band', () => {
    targeting.compMin.set(10);
    targeting.compMax.set(900);
    fixture.detectChanges();

    expect(targeting.compLeft()).toBe('0.0%');
    expect(targeting.compRight()).toBe('0.0%');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { CompletenessHeroComponent } from './completeness-hero.component';

function setup(completeness: number, gaps: string[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CompletenessHeroComponent],
    providers: [{ provide: TranslateService, useValue: { t: () => (k: string) => k } }],
  });
  const fixture: ComponentFixture<CompletenessHeroComponent> =
    TestBed.createComponent(CompletenessHeroComponent);
  fixture.componentRef.setInput('completeness', completeness);
  fixture.componentRef.setInput('gaps', gaps);
  fixture.componentRef.setInput('name', 'Vitalii');
  fixture.componentRef.setInput('subtitle', 'senior · Germany');
  fixture.detectChanges();
  return fixture;
}

describe('CompletenessHeroComponent', () => {
  it('encodes completeness in the ring dash (0 and 100 differ)', () => {
    expect(setup(0, ['title']).componentInstance.ringDash()).not.toBe(
      setup(100, []).componentInstance.ringDash(),
    );
  });

  it('renders one gap pill per gap', () => {
    const f = setup(50, ['title', 'skills']);
    const pills = f.nativeElement.querySelectorAll('.hero__gap');
    expect(pills.length).toBe(2);
  });

  it('emits addField when a gap pill is clicked', () => {
    const f = setup(50, ['skills']);
    const emitted: string[] = [];
    f.componentInstance.addField.subscribe((k) => emitted.push(k));
    f.componentInstance.onAdd('skills');
    expect(emitted).toEqual(['skills']);
  });

  it('shows the done state when there are no gaps', () => {
    const f = setup(100, []);
    expect(f.nativeElement.querySelector('.hero__done')).toBeTruthy();
    expect(f.nativeElement.querySelector('.hero__gap')).toBeNull();
  });
});

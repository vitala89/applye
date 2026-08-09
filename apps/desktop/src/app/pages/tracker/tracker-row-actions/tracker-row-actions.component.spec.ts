import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { TrackerRowActionsComponent } from './tracker-row-actions.component';

describe('TrackerRowActionsComponent', () => {
  let fixture: ComponentFixture<TrackerRowActionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrackerRowActionsComponent],
      providers: [{ provide: TranslateService, useValue: { t: signal((k: string) => k) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(TrackerRowActionsComponent);
  });

  it('shows the kebab when the row is not being edited', () => {
    fixture.componentRef.setInput('editing', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.jt-menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.jt-actbtns')).toBeNull();
  });

  it('shows save and cancel while the row is being edited', () => {
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.jt-actbtns .jt-icon')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.jt-menu')).toBeNull();
  });

  it('disables save while a save is in flight, and leaves cancel alone', () => {
    fixture.componentRef.setInput('editing', true);
    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();

    const [save, cancel] = fixture.nativeElement.querySelectorAll(
      '.jt-actbtns .jt-icon',
    ) as NodeListOf<HTMLButtonElement>;
    expect(save.disabled).toBe(true);
    expect(cancel.disabled).toBe(false);
  });

  // The page anchors the popup to this button's bounding box. It used to read
  // that from `event.currentTarget`, which is only set while the event is being
  // dispatched; emitting the element instead is what makes the binding safe
  // across the component boundary rather than safe by accident.
  it('emits the kebab element itself, not the event', () => {
    fixture.componentRef.setInput('editing', false);
    fixture.detectChanges();

    let emitted: HTMLElement | undefined;
    fixture.componentInstance.menuToggled.subscribe((el) => (emitted = el));

    const kebab = fixture.nativeElement.querySelector('.jt-menu .jt-icon') as HTMLElement;
    kebab.click();

    expect(emitted).toBe(kebab);
    expect(emitted).toBeInstanceOf(HTMLElement);
  });

  it('reports the open menu through aria-expanded', () => {
    fixture.componentRef.setInput('editing', false);
    fixture.componentRef.setInput('menuOpen', true);
    fixture.detectChanges();

    const kebab = fixture.nativeElement.querySelector('.jt-menu .jt-icon') as HTMLElement;
    expect(kebab.getAttribute('aria-expanded')).toBe('true');
    expect(kebab.classList.contains('is-open')).toBe(true);
  });
});

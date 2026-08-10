import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsDangerZoneComponent } from './settings-danger-zone.component';

describe('SettingsDangerZoneComponent', () => {
  let fixture: ComponentFixture<SettingsDangerZoneComponent>;

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SettingsDangerZoneComponent] });
    fixture = TestBed.createComponent(SettingsDangerZoneComponent);
    fixture.detectChanges();
  });

  it('shows one quiet trigger and no confirmation at rest', () => {
    expect(buttons().length).toBe(1);
    expect(buttons()[0].classList.contains('btn--danger')).toBe(true);
    expect(fixture.nativeElement.querySelector('.confirm')).toBeNull();
  });

  /** The page owns the flag, so the confirmation can be closed from there when
   * a reset fails. */
  it('asks the page to open and close the confirmation rather than deciding', () => {
    const seen: boolean[] = [];
    fixture.componentInstance.confirmingChanged.subscribe((v) => seen.push(v));

    buttons()[0].click();
    expect(seen).toEqual([true]);
    // Still closed: the page has not said otherwise.
    expect(fixture.nativeElement.querySelector('.confirm')).toBeNull();

    fixture.componentRef.setInput('confirming', true);
    fixture.detectChanges();
    buttons()[1].click();
    expect(seen).toEqual([true, false]);
  });

  it('only fires the reset from the confirmation step', () => {
    let resets = 0;
    fixture.componentInstance.resetConfirmed.subscribe(() => resets++);

    buttons()[0].click();
    expect(resets).toBe(0);

    fixture.componentRef.setInput('confirming', true);
    fixture.detectChanges();
    buttons()[0].click();
    expect(resets).toBe(1);
  });

  it('disables both confirmation controls while the reset runs', () => {
    fixture.componentRef.setInput('confirming', true);
    fixture.componentRef.setInput('resetting', true);
    fixture.detectChanges();

    expect(buttons().every((b) => b.disabled)).toBe(true);
    expect(fixture.nativeElement.querySelector('.spin')).not.toBeNull();
  });
});

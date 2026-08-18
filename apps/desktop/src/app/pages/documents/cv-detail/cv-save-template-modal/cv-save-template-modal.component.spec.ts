import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';

import { CvSaveTemplateModalComponent } from './cv-save-template-modal.component';

/**
 * The dialog's two buttons rendered **unstyled**, and nothing could see it.
 *
 * The stylesheet opened by stating that `.btn-ghost` and `.btn-primary` are
 * "global, from `libs/ui`". They are not: `libs/ui/src/styles/_button.scss`
 * declares the `.btn--ghost` BEM family, a different vocabulary. Only two
 * component sheets declare the hyphenated names and both are encapsulated, so
 * neither reaches here; the one match in the built global sheet is
 * `.profile .btn-ghost`, nested where this dialog can never satisfy it.
 * `.btn-primary` has no global declaration at all.
 *
 * A class name that matches nothing fails silently - no error, no failing test,
 * just a browser-default button. So the property asserted here is not "the
 * button has a class", it is **"the button carries the design-system classes
 * the global sheet actually declares"**, which is what `ButtonDirective` emits.
 * Asserting the absence of the dead names as well is what makes this a
 * regression test rather than a restatement: re-adding `class="btn-primary"`
 * beside the directive would pass the first half.
 */
describe('CvSaveTemplateModalComponent buttons', () => {
  let fixture: ComponentFixture<CvSaveTemplateModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvSaveTemplateModalComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvSaveTemplateModalComponent);
    fixture.componentRef.setInput('name', 'Aurora');
    fixture.componentRef.setInput('saving', false);
    fixture.detectChanges();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    );
  }

  it('renders exactly two buttons, and both carry the design-system base class', () => {
    const all = buttons();
    expect(all.length).toBe(2);
    for (const b of all) expect(b.classList.contains('btn')).toBe(true);
  });

  it('the cancel button is the ghost variant and the confirm button is the primary one', () => {
    const [cancel, confirm] = buttons();
    expect(cancel.classList.contains('btn--ghost')).toBe(true);
    expect(confirm.classList.contains('btn--primary')).toBe(true);
    // Counted in both directions: one component, two call sites, and the
    // variants must not be interchangeable.
    expect(cancel.classList.contains('btn--primary')).toBe(false);
    expect(confirm.classList.contains('btn--ghost')).toBe(false);
  });

  it('neither button carries the hyphenated names nothing declares', () => {
    for (const b of buttons()) {
      expect(b.classList.contains('btn-ghost')).toBe(false);
      expect(b.classList.contains('btn-primary')).toBe(false);
    }
  });

  it('the confirm button still reports its disabled state, and cancel never does', () => {
    const [cancel, confirm] = buttons();
    expect(confirm.disabled).toBe(false);
    expect(cancel.disabled).toBe(false);
    fixture.componentRef.setInput('name', '   ');
    fixture.detectChanges();
    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(false);
  });

  it('both buttons still emit what they did before the styling changed', () => {
    const seen: string[] = [];
    const component = fixture.componentInstance;
    component.cancelled.subscribe(() => seen.push('cancelled'));
    component.confirmed.subscribe(() => seen.push('confirmed'));
    const [cancel, confirm] = buttons();
    cancel.click();
    confirm.click();
    expect(seen).toEqual(['cancelled', 'confirmed']);
  });
});

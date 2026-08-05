import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { ProfileTextFieldComponent } from './profile-text-field.component';

interface Inputs {
  key: string;
  value: string;
  type?: 'text' | 'email' | 'tel';
  placeholderKey?: string | null;
}

function createFixture(over: Inputs): ComponentFixture<ProfileTextFieldComponent> {
  TestBed.configureTestingModule({
    imports: [ProfileTextFieldComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileTextFieldComponent);
  fixture.componentRef.setInput('key', over.key);
  fixture.componentRef.setInput('value', over.value);
  if (over.type) fixture.componentRef.setInput('type', over.type);
  if (over.placeholderKey !== undefined) {
    fixture.componentRef.setInput('placeholderKey', over.placeholderKey);
  }
  fixture.detectChanges();
  return fixture;
}

function input(fixture: ComponentFixture<ProfileTextFieldComponent>): HTMLInputElement {
  return fixture.nativeElement.querySelector('.field__input');
}

describe('ProfileTextFieldComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** `focusField` scrolls to `field-<key>` when the completeness hero reports a
   * field missing, so the id has to keep exactly this shape. */
  it('derives the element id from the key', () => {
    const fixture = createFixture({ key: 'first-name', value: '' });
    expect(input(fixture).id).toBe('field-first-name');
    expect(fixture.nativeElement.querySelector('#field-first-name')).not.toBeNull();
  });

  /** The label has to point at the input it labels, or clicking it does nothing
   * and a screen reader announces the wrong thing. */
  it('binds the label to that same id', () => {
    const fixture = createFixture({ key: 'last-name', value: '' });
    const label: HTMLLabelElement = fixture.nativeElement.querySelector('.field__label');
    expect(label.getAttribute('for')).toBe('field-last-name');
    expect(label.getAttribute('for')).toBe(input(fixture).id);
  });

  /** Dashes in the id, underscores in the translation key. */
  it('derives the label translation key from the same key', () => {
    const fixture = createFixture({ key: 'document-name', value: '' });
    expect(fixture.componentInstance['labelKey']()).toBe('profile.field_document_name');
  });

  /** `ngModel` writes the value in a microtask, so this one has to settle
   * before the DOM shows it - the assertion is on the rendered input, not on
   * the binding. */
  it('shows the value it was given and emits what was typed', async () => {
    const fixture = createFixture({ key: 'email', value: 'v@example.com' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input(fixture).value).toBe('v@example.com');

    const seen: string[] = [];
    fixture.componentInstance.changed.subscribe((v) => seen.push(v));
    input(fixture).value = 'other@example.com';
    input(fixture).dispatchEvent(new Event('input'));
    expect(seen).toEqual(['other@example.com']);
  });

  it('defaults to a text input and takes the type it is given', () => {
    expect(input(createFixture({ key: 'title', value: '' })).type).toBe('text');
    TestBed.resetTestingModule();
    expect(input(createFixture({ key: 'email', value: '', type: 'email' })).type).toBe('email');
    TestBed.resetTestingModule();
    expect(input(createFixture({ key: 'phone', value: '', type: 'tel' })).type).toBe('tel');
  });

  /** No placeholder key must mean no attribute at all, not an empty one. */
  it('renders no placeholder attribute unless it was given a key', () => {
    const bare = createFixture({ key: 'title', value: '' });
    expect(input(bare).hasAttribute('placeholder')).toBe(false);
    TestBed.resetTestingModule();

    const hinted = createFixture({
      key: 'website',
      value: '',
      placeholderKey: 'profile.website_hint',
    });
    expect(input(hinted).getAttribute('placeholder')).not.toBe('');
    expect(input(hinted).hasAttribute('placeholder')).toBe(true);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CvPersonalDetailsSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvPersonalDetailsEditorComponent } from './cv-personal-details-editor.component';

describe('CvPersonalDetailsEditorComponent', () => {
  let component: CvPersonalDetailsEditorComponent;
  let fixture: ComponentFixture<CvPersonalDetailsEditorComponent>;

  const section: CvPersonalDetailsSection = {
    key: 'personal_details',
    order: 0,
    visible: true,
    fullName: 'Jane Doe',
    title: 'Engineer',
    email: 'jane@example.com',
    phone: '+49 123',
    address: 'Berlin',
    website: 'jane.dev',
    linkedin: 'linkedin.com/in/jane',
    birthDate: '1990-01-01',
    maritalStatus: 'single',
  };

  function setup(
    overrides: {
      includeBirthdate?: boolean;
      includeMaritalStatus?: boolean;
      pulling?: boolean;
    } = {},
  ): void {
    fixture = TestBed.createComponent(CvPersonalDetailsEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('section', section);
    fixture.componentRef.setInput('includeBirthdate', overrides.includeBirthdate ?? false);
    fixture.componentRef.setInput('includeMaritalStatus', overrides.includeMaritalStatus ?? false);
    fixture.componentRef.setInput('pulling', overrides.pulling ?? false);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvPersonalDetailsEditorComponent],
      providers: [TranslateService],
    }).compileComponents();
  });

  it.each([
    ['fullName', 'John Smith'],
    ['title', 'Manager'],
    ['email', 'john@example.com'],
    ['phone', '+1 555'],
    ['address', 'Munich'],
    ['website', 'john.dev'],
    ['linkedin', 'linkedin.com/in/john'],
  ] as const)('updateField(%s) emits an immutably-updated section', (field, value) => {
    setup();
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const original = { ...section };

    component.updateField(field, value);

    expect(emitted).toHaveBeenCalledWith({ ...section, [field]: value });
    // Original section object is untouched.
    expect(section).toEqual(original);
  });

  it('updateField(birthDate) emits an immutably-updated section', () => {
    setup({ includeBirthdate: true });
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.updateField('birthDate', '1991-02-02');

    expect(emitted).toHaveBeenCalledWith({ ...section, birthDate: '1991-02-02' });
  });

  it('updateField(maritalStatus) emits an immutably-updated section', () => {
    setup({ includeMaritalStatus: true });
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.updateField('maritalStatus', 'married');

    expect(emitted).toHaveBeenCalledWith({ ...section, maritalStatus: 'married' });
  });

  it('does not render the birthdate/marital-status fields when their toggles are off', () => {
    setup({ includeBirthdate: false, includeMaritalStatus: false });
    const inputs = fixture.nativeElement.querySelectorAll('.cvdetail__grid input');
    // 7 always-on fields, no birthdate/marital inputs.
    expect(inputs.length).toBe(7);
  });

  it('renders the birthdate/marital-status fields when their toggles are on', () => {
    setup({ includeBirthdate: true, includeMaritalStatus: true });
    const inputs = fixture.nativeElement.querySelectorAll('.cvdetail__grid input');
    expect(inputs.length).toBe(9);
  });

  it('does not render the birthdate/marital-status toggle chips or ATS notes (they live in the parent top card)', () => {
    setup({ includeBirthdate: true, includeMaritalStatus: true });
    expect(fixture.nativeElement.querySelector('.docedit-chip-row')).toBeNull();
    expect(fixture.nativeElement.querySelector('.docedit-note')).toBeNull();
  });

  it('pull-from-profile button click emits pullProfile', () => {
    setup();
    const emitted = jest.fn();
    component.pullProfile.subscribe(emitted);

    fixture.nativeElement.querySelector('.cvdetail__pull-btn').click();

    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('disables the pull-from-profile button while pulling is true', () => {
    setup({ pulling: true });
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.cvdetail__pull-btn');
    expect(btn.disabled).toBe(true);
  });

  it('enables the pull-from-profile button while pulling is false', () => {
    setup({ pulling: false });
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.cvdetail__pull-btn');
    expect(btn.disabled).toBe(false);
  });
});

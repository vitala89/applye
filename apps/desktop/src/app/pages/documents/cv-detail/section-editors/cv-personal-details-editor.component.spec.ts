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
      atsNoteKeys?: string[];
      pulling?: boolean;
    } = {},
  ): void {
    fixture = TestBed.createComponent(CvPersonalDetailsEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('section', section);
    fixture.componentRef.setInput('includeBirthdate', overrides.includeBirthdate ?? false);
    fixture.componentRef.setInput('includeMaritalStatus', overrides.includeMaritalStatus ?? false);
    fixture.componentRef.setInput('atsNoteKeys', overrides.atsNoteKeys ?? []);
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

  it('birthdate chip click emits includeBirthdateChange with the flipped value', () => {
    setup({ includeBirthdate: false });
    const emitted = jest.fn();
    component.includeBirthdateChange.subscribe(emitted);

    const chip = fixture.nativeElement.querySelectorAll('.docedit-chip-row .docedit-chip')[0];
    chip.click();

    expect(emitted).toHaveBeenCalledWith(true);
  });

  it('marital-status chip click emits includeMaritalStatusChange with the flipped value', () => {
    setup({ includeMaritalStatus: true });
    const emitted = jest.fn();
    component.includeMaritalStatusChange.subscribe(emitted);

    const chip = fixture.nativeElement.querySelectorAll('.docedit-chip-row .docedit-chip')[1];
    chip.click();

    expect(emitted).toHaveBeenCalledWith(false);
  });

  it('marks the active chip via docedit-chip--active', () => {
    setup({ includeBirthdate: true, includeMaritalStatus: false });
    const chips = fixture.nativeElement.querySelectorAll('.docedit-chip-row .docedit-chip');
    expect(chips[0].classList.contains('docedit-chip--active')).toBe(true);
    expect(chips[1].classList.contains('docedit-chip--active')).toBe(false);
  });

  it('renders the ATS note keys passed in atsNoteKeys', () => {
    setup({ atsNoteKeys: ['documents.cv_ats_note_birthdate', 'documents.cv_ats_note_marital'] });
    const notes = fixture.nativeElement.querySelectorAll('.docedit-note p');
    expect(notes.length).toBe(2);
  });

  it('renders no ATS note block when atsNoteKeys is empty', () => {
    setup({ atsNoteKeys: [] });
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

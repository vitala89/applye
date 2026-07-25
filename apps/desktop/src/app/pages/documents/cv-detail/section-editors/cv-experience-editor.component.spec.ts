import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CvExperienceSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvExperienceEditorComponent } from './cv-experience-editor.component';

describe('CvExperienceEditorComponent', () => {
  let component: CvExperienceEditorComponent;
  let fixture: ComponentFixture<CvExperienceEditorComponent>;

  const section: CvExperienceSection = {
    key: 'experience',
    order: 0,
    visible: true,
    entries: [
      {
        company: 'Acme',
        role: 'Engineer',
        startDate: '2020',
        endDate: '2022',
        location: 'Berlin',
        industry: 'SaaS',
        bullets: ['Shipped X', 'Led Y'],
      },
      {
        company: 'Globex',
        role: 'Lead Engineer',
        startDate: '2022',
        endDate: '',
        location: 'Munich',
        industry: 'Fintech',
        bullets: ['Owned Z'],
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvExperienceEditorComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvExperienceEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();
  });

  it('renders one entry per experience row', () => {
    const rows = fixture.nativeElement.querySelectorAll('.cvdetail__entry');
    expect(rows.length).toBe(2);
  });

  it('addEntry emits the section with a blank entry appended immutably', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.addEntry();

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [
        ...section.entries,
        { company: '', role: '', startDate: '', endDate: '', location: '', bullets: [''] },
      ],
    });
    // Original entries array is untouched.
    expect(section.entries.length).toBe(2);
  });

  it('removeEntry emits the section with the entry filtered out', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.removeEntry(0);

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [section.entries[1]],
    });
    expect(section.entries.length).toBe(2);
  });

  it.each([
    ['role', 'Staff Engineer'],
    ['company', 'Umbrella Corp'],
    ['startDate', '2019'],
    ['endDate', '2023'],
    ['location', 'Vienna'],
    ['industry', 'Healthcare'],
  ] as const)('updateField(%s) emits an immutably-updated entry', (field, value) => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const original = { ...section.entries[0] };

    component.updateField(0, field, value);

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [{ ...section.entries[0], [field]: value }, section.entries[1]],
    });
    // Original entry object is untouched.
    expect(section.entries[0]).toEqual(original);
  });

  it('addBullet emits the section with a blank bullet appended to the given entry only', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const originalBullets0 = [...section.entries[0].bullets];
    const originalBullets1 = [...section.entries[1].bullets];

    component.addBullet(0);

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [
        { ...section.entries[0], bullets: [...section.entries[0].bullets, ''] },
        section.entries[1],
      ],
    });
    // Original bullets arrays are untouched, on both the edited and the
    // untouched entry.
    expect(section.entries[0].bullets).toEqual(originalBullets0);
    expect(section.entries[1].bullets).toEqual(originalBullets1);
  });

  it('removeBullet emits the section with the bullet filtered out of the given entry only', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const originalBullets = [...section.entries[0].bullets];

    component.removeBullet(0, 1);

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [{ ...section.entries[0], bullets: ['Shipped X'] }, section.entries[1]],
    });
    expect(section.entries[0].bullets).toEqual(originalBullets);
  });

  it('updateBullet emits an immutably-updated bullet at entry i, bullet j', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const originalBullets = [...section.entries[1].bullets];

    component.updateBullet(1, 0, 'Owned Z end-to-end');

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [section.entries[0], { ...section.entries[1], bullets: ['Owned Z end-to-end'] }],
    });
    expect(section.entries[1].bullets).toEqual(originalBullets);
  });

  it('does not render a Bold button - bold formatting moved to the live preview', () => {
    expect(fixture.nativeElement.querySelector('.cvdetail__bold-btn')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CvEducationSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvEducationEditorComponent } from './cv-education-editor.component';

describe('CvEducationEditorComponent', () => {
  let component: CvEducationEditorComponent;
  let fixture: ComponentFixture<CvEducationEditorComponent>;

  const section: CvEducationSection = {
    key: 'education',
    order: 0,
    visible: true,
    entries: [
      { institution: 'MIT', degree: 'BSc CS', startDate: '2015', endDate: '2019' },
      { institution: 'Stanford', degree: 'MSc CS', startDate: '2019', endDate: '2021' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvEducationEditorComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvEducationEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();
  });

  it('renders one entry per education row', () => {
    const rows = fixture.nativeElement.querySelectorAll('.cvdetail__entry');
    expect(rows.length).toBe(2);
  });

  it('addEntry emits the section with a blank entry appended immutably', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.addEntry();

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [...section.entries, { institution: '', degree: '', startDate: '', endDate: '' }],
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
      entries: [{ institution: 'Stanford', degree: 'MSc CS', startDate: '2019', endDate: '2021' }],
    });
    expect(section.entries.length).toBe(2);
  });

  it('updateField emits an immutably-updated entry at the given index', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.updateField(1, 'degree', 'PhD CS');

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      entries: [
        { institution: 'MIT', degree: 'BSc CS', startDate: '2015', endDate: '2019' },
        { institution: 'Stanford', degree: 'PhD CS', startDate: '2019', endDate: '2021' },
      ],
    });
    // Original entry object is untouched.
    expect(section.entries[1].degree).toBe('MSc CS');
  });
});

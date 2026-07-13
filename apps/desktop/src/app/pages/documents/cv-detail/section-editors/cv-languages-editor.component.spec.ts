import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CvLanguagesSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvLanguagesEditorComponent } from './cv-languages-editor.component';

describe('CvLanguagesEditorComponent', () => {
  let component: CvLanguagesEditorComponent;
  let fixture: ComponentFixture<CvLanguagesEditorComponent>;

  const section: CvLanguagesSection = {
    key: 'languages',
    order: 0,
    visible: true,
    items: [
      { language: 'English', level: 'C1' },
      { language: 'German', level: 'B2' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvLanguagesEditorComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvLanguagesEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();
  });

  it('renders one row per language item', () => {
    const rows = fixture.nativeElement.querySelectorAll('.cvdetail__lang-row');
    expect(rows.length).toBe(2);
  });

  it('addLanguage emits the section with a blank entry appended immutably', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.addLanguage();

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      items: [...section.items, { language: '', level: '' }],
    });
    // Original items array is untouched.
    expect(section.items.length).toBe(2);
  });

  it('removeLanguage emits the section with the item filtered out', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.removeLanguage(0);

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      items: [{ language: 'German', level: 'B2' }],
    });
    expect(section.items.length).toBe(2);
  });

  it('updateField emits an immutably-updated item at the given index', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.updateField(1, 'level', 'C2');

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      items: [
        { language: 'English', level: 'C1' },
        { language: 'German', level: 'C2' },
      ],
    });
    // Original entry object is untouched.
    expect(section.items[1].level).toBe('B2');
  });
});

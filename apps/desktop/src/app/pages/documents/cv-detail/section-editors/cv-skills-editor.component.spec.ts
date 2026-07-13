import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CvSkillsSection } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { CvSkillsEditorComponent } from './cv-skills-editor.component';

describe('CvSkillsEditorComponent', () => {
  let component: CvSkillsEditorComponent;
  let fixture: ComponentFixture<CvSkillsEditorComponent>;

  const section: CvSkillsSection = {
    key: 'skills',
    order: 0,
    visible: true,
    groups: [
      { label: 'Languages', values: ['TypeScript', 'Rust'] },
      { label: 'Tools', values: ['Git'] },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvSkillsEditorComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvSkillsEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();
  });

  it('renders one group per skill group and one chip per value', () => {
    const groups = fixture.nativeElement.querySelectorAll('.cvdetail__skill-group');
    const chips = fixture.nativeElement.querySelectorAll('.cvdetail__skill-chip');
    expect(groups.length).toBe(2);
    expect(chips.length).toBe(3);
  });

  it('setGroupLabel emits the section with the group label updated immutably', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.setGroupLabel(1, 'Dev Tools');

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      groups: [
        { label: 'Languages', values: ['TypeScript', 'Rust'] },
        { label: 'Dev Tools', values: ['Git'] },
      ],
    });
    expect(section.groups[1].label).toBe('Tools');
  });

  it('addGroup emits the section with a new blank group appended immutably', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.addGroup();

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      groups: [...section.groups, { label: 'Skills', values: [] }],
    });
    expect(section.groups.length).toBe(2);
  });

  it('removeGroup emits the section with the group filtered out', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.removeGroup(0);

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      groups: [{ label: 'Tools', values: ['Git'] }],
    });
    expect(section.groups.length).toBe(2);
  });

  it('addSkill trims and appends a non-duplicate value, then clears the input', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const input = document.createElement('input');
    input.value = '  Python  ';
    const event = { preventDefault: jest.fn(), target: input } as unknown as Event;

    component.addSkill(0, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(emitted).toHaveBeenCalledWith({
      ...section,
      groups: [
        { label: 'Languages', values: ['TypeScript', 'Rust', 'Python'] },
        { label: 'Tools', values: ['Git'] },
      ],
    });
    expect(input.value).toBe('');
  });

  it('addSkill ignores empty input and does not emit', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const input = document.createElement('input');
    input.value = '   ';
    const event = { preventDefault: jest.fn(), target: input } as unknown as Event;

    component.addSkill(0, event);

    expect(emitted).not.toHaveBeenCalled();
  });

  it('addSkill ignores a duplicate value but still clears the input', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);
    const input = document.createElement('input');
    input.value = 'Rust';
    const event = { preventDefault: jest.fn(), target: input } as unknown as Event;

    component.addSkill(0, event);

    expect(emitted).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('removeSkill emits the section with the chip value filtered out', () => {
    const emitted = jest.fn();
    component.sectionChange.subscribe(emitted);

    component.removeSkill(0, 0);

    expect(emitted).toHaveBeenCalledWith({
      ...section,
      groups: [
        { label: 'Languages', values: ['Rust'] },
        { label: 'Tools', values: ['Git'] },
      ],
    });
    expect(section.groups[0].values.length).toBe(2);
  });
});

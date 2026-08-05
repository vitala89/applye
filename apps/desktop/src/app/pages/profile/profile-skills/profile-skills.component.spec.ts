import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { ProfileSkillsComponent } from './profile-skills.component';

/**
 * The section owns no state - the skills live in `form().skills` on the page -
 * so every test drives the input and asserts on what came out.
 */
function createFixture(
  skills: string[],
  open = true,
): { fixture: ComponentFixture<ProfileSkillsComponent>; emitted: string[][] } {
  TestBed.configureTestingModule({
    imports: [ProfileSkillsComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileSkillsComponent);
  fixture.componentRef.setInput('skills', skills);
  fixture.componentRef.setInput('open', open);
  const emitted: string[][] = [];
  fixture.componentInstance.changed.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { fixture, emitted };
}

/** Types into the chip field and presses Enter, the way the section is used. */
function typeAndEnter(fixture: ComponentFixture<ProfileSkillsComponent>, text: string): void {
  const field = fixture.nativeElement.querySelector('.chip-input__field') as HTMLInputElement;
  field.value = text;
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  fixture.detectChanges();
}

function fieldValue(fixture: ComponentFixture<ProfileSkillsComponent>): string {
  return (fixture.nativeElement.querySelector('.chip-input__field') as HTMLInputElement).value;
}

describe('ProfileSkillsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('never mutates the array it was given', () => {
    const input = ['Angular'];
    const { fixture } = createFixture(input);
    typeAndEnter(fixture, 'Rust');
    fixture.componentInstance['removeChip'](0);
    expect(input).toEqual(['Angular']);
  });

  it('turns the typed text into a chip on Enter and clears the field', () => {
    const { fixture, emitted } = createFixture(['Angular']);
    typeAndEnter(fixture, 'Rust');
    expect(emitted).toEqual([['Angular', 'Rust']]);
    expect(fieldValue(fixture)).toBe('');
  });

  it('trims what was typed', () => {
    const { fixture, emitted } = createFixture([]);
    typeAndEnter(fixture, '  Rust  ');
    expect(emitted).toEqual([['Rust']]);
  });

  /** A duplicate is not an error, so the field still clears - leaving the text
   * sitting there reads as "that did not work" when the skill is already in. */
  it('ignores a duplicate but still clears the field', () => {
    const { fixture, emitted } = createFixture(['Angular']);
    typeAndEnter(fixture, 'Angular');
    expect(emitted).toHaveLength(0);
    expect(fieldValue(fixture)).toBe('');
  });

  it('ignores an empty or whitespace-only entry and leaves the field alone', () => {
    const { fixture, emitted } = createFixture(['Angular']);
    typeAndEnter(fixture, '   ');
    expect(emitted).toHaveLength(0);
    expect(fieldValue(fixture)).toBe('   ');
  });

  it('removes the chip at the clicked index', () => {
    const { fixture, emitted } = createFixture(['one', 'two', 'three']);
    const buttons = fixture.nativeElement.querySelectorAll(
      '.skill-chip__x',
    ) as NodeListOf<HTMLElement>;
    buttons[1].click();
    expect(emitted).toEqual([['one', 'three']]);
  });

  /** The completeness hero scrolls to this id when skills are missing, so it
   * has to travel with the section rather than stay on the page. */
  it('carries the #field-skills anchor on the chip field', () => {
    const { fixture } = createFixture([]);
    const field = fixture.nativeElement.querySelector('#field-skills');
    expect(field).not.toBeNull();
    expect(field.classList).toContain('chip-input__field');
  });

  it('renders nothing but the head while collapsed, and asks the page to toggle', () => {
    const { fixture } = createFixture(['Angular'], false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => (toggles += 1));
    expect(fixture.nativeElement.querySelector('.collapse-card__body')).toBeNull();
    (fixture.nativeElement.querySelector('.collapse-card__head') as HTMLElement).click();
    expect(toggles).toBe(1);
  });
});

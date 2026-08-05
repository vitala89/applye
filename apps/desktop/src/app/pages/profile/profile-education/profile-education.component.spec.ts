import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EducationEntry } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ProfileEducationComponent } from './profile-education.component';

/**
 * The section owns no state - the page holds the entries and folds them back
 * into `form().education` - so every test drives the input and asserts on what
 * came out, which is the whole contract.
 */
function createFixture(
  entries: EducationEntry[],
  open = true,
): { fixture: ComponentFixture<ProfileEducationComponent>; emitted: EducationEntry[][] } {
  TestBed.configureTestingModule({
    imports: [ProfileEducationComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileEducationComponent);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('open', open);
  const emitted: EducationEntry[][] = [];
  fixture.componentInstance.changed.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { fixture, emitted };
}

function entry(title: string, over: Partial<EducationEntry> = {}): EducationEntry {
  return { title, institution: 'A University', startDate: '', endDate: '', ...over };
}

describe('ProfileEducationComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** The page owns the array. An in-place edit would change it behind the
   * page's back, so `syncEducation` would serialize a value it never saw set. */
  it('never mutates the array or the entries it was given', () => {
    const input = [entry('BSc')];
    const { fixture } = createFixture(input);
    const c = fixture.componentInstance;
    c['add']();
    c['updateField'](0, 'institution', 'Elsewhere');
    c['remove'](0);
    expect(input).toEqual([entry('BSc')]);
  });

  it('adds a blank qualification on the dashed button', () => {
    const { fixture, emitted } = createFixture([entry('BSc')]);
    (fixture.nativeElement.querySelector('.btn-dashed') as HTMLElement).click();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toHaveLength(2);
    expect(emitted[0][0]).toEqual(entry('BSc'));
  });

  it('removes the qualification at the clicked index', () => {
    const { fixture, emitted } = createFixture([entry('one'), entry('two'), entry('three')]);
    const buttons = fixture.nativeElement.querySelectorAll('.btn-ghost') as NodeListOf<HTMLElement>;
    buttons[1].click();
    expect(emitted[0].map((e) => e.title)).toEqual(['one', 'three']);
  });

  /** Two entries, and the field written is not one the other shares a value
   * with: a mutation writing every entry, or every field, must be visible. */
  it('patches only the named field of only the edited qualification', () => {
    const { fixture, emitted } = createFixture([
      entry('BSc', { startDate: '2014' }),
      entry('MSc', { startDate: '2018' }),
    ]);
    fixture.componentInstance['updateField'](1, 'endDate', '2020');
    expect(emitted[0]).toEqual([
      entry('BSc', { startDate: '2014' }),
      entry('MSc', { startDate: '2018', endDate: '2020' }),
    ]);
  });

  it('renders a card per qualification with its four fields', () => {
    const { fixture } = createFixture([entry('BSc'), entry('MSc')]);
    expect(fixture.nativeElement.querySelectorAll('.archetype-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.archetype-input')).toHaveLength(8);
  });

  it('renders nothing but the head while collapsed, and asks the page to toggle', () => {
    const { fixture } = createFixture([entry('BSc')], false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => (toggles += 1));
    expect(fixture.nativeElement.querySelector('.collapse-card__body')).toBeNull();
    (fixture.nativeElement.querySelector('.collapse-card__head') as HTMLElement).click();
    expect(toggles).toBe(1);
  });
});

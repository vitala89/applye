import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExperienceEntry } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ProfileExperienceComponent } from './profile-experience.component';

/**
 * The section owns no state - the page holds the entries and folds them back
 * into `experienceText` - so every test drives the input and asserts on what
 * came out, which is the whole contract.
 */
function createFixture(
  entries: ExperienceEntry[],
  open = true,
): { fixture: ComponentFixture<ProfileExperienceComponent>; emitted: ExperienceEntry[][] } {
  TestBed.configureTestingModule({
    imports: [ProfileExperienceComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileExperienceComponent);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('open', open);
  const emitted: ExperienceEntry[][] = [];
  fixture.componentInstance.changed.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { fixture, emitted };
}

function entry(role: string, over: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    role,
    company: 'Acme',
    location: '',
    startDate: '',
    endDate: '',
    bullets: [],
    ...over,
  };
}

describe('ProfileExperienceComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** The page owns the array. An in-place edit would change it behind the
   * page's back, so `syncExperience` would serialize a value it never saw set. */
  it('never mutates the array or the entries it was given', () => {
    const input = [entry('Engineer', { bullets: ['shipped a thing'] })];
    const { fixture } = createFixture(input);
    const c = fixture.componentInstance;
    c['add']();
    c['updateField'](0, 'company', 'Other');
    c['addBullet'](0);
    c['updateBullet'](0, 0, 'changed');
    c['removeBullet'](0, 0);
    c['remove'](0);
    expect(input).toEqual([entry('Engineer', { bullets: ['shipped a thing'] })]);
  });

  it('adds a blank position with its own empty bullet list', () => {
    const { fixture, emitted } = createFixture([]);
    (fixture.nativeElement.querySelector('.btn-dashed') as HTMLElement).click();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toHaveLength(1);
    expect(emitted[0][0].bullets).toEqual([]);
  });

  it('removes the position at the clicked index', () => {
    const { fixture, emitted } = createFixture([entry('one'), entry('two'), entry('three')]);
    const removeButtons = fixture.nativeElement.querySelectorAll(
      '.archetype-card__top .btn-ghost',
    ) as NodeListOf<HTMLElement>;
    removeButtons[1].click();
    expect(emitted[0].map((e) => e.role)).toEqual(['one', 'three']);
  });

  it('patches only the named field of only the edited position', () => {
    const { fixture, emitted } = createFixture([entry('one'), entry('two', { location: 'Kyiv' })]);
    fixture.componentInstance['updateField'](1, 'startDate', '2024');
    expect(emitted[0][0]).toEqual(entry('one'));
    expect(emitted[0][1]).toEqual(entry('two', { location: 'Kyiv', startDate: '2024' }));
  });

  /**
   * Bullets are addressed by two indices, and both have to bite. Every entry
   * here carries more than one bullet on purpose: with a single-bullet entry,
   * "write the addressed bullet" and "write every bullet of that entry" produce
   * the same result, and a mutation doing the latter survived a version of this
   * test that used one bullet each.
   */
  it('adds, edits and removes a bullet at only the addressed position and index', () => {
    const two = [
      entry('one', { bullets: ['a1', 'a2'] }),
      entry('two', { bullets: ['b1', 'b2', 'b3'] }),
    ];

    const added = createFixture(two);
    added.fixture.componentInstance['addBullet'](1);
    expect(added.emitted[0].map((e) => e.bullets)).toEqual([
      ['a1', 'a2'],
      ['b1', 'b2', 'b3', ''],
    ]);
    TestBed.resetTestingModule();

    const edited = createFixture(two);
    edited.fixture.componentInstance['updateBullet'](1, 1, 'B2!');
    expect(edited.emitted[0].map((e) => e.bullets)).toEqual([
      ['a1', 'a2'],
      ['b1', 'B2!', 'b3'],
    ]);
    TestBed.resetTestingModule();

    const removed = createFixture(two);
    removed.fixture.componentInstance['removeBullet'](1, 0);
    expect(removed.emitted[0].map((e) => e.bullets)).toEqual([
      ['a1', 'a2'],
      ['b2', 'b3'],
    ]);
  });

  it('renders a row per bullet', () => {
    const { fixture } = createFixture([entry('one', { bullets: ['a', 'b', 'c'] })]);
    expect(fixture.nativeElement.querySelectorAll('.exp-bullet-row')).toHaveLength(3);
  });

  it('renders nothing but the head while collapsed, and asks the page to toggle', () => {
    const { fixture } = createFixture([entry('one')], false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => (toggles += 1));
    expect(fixture.nativeElement.querySelector('.collapse-card__body')).toBeNull();
    (fixture.nativeElement.querySelector('.collapse-card__head') as HTMLElement).click();
    expect(toggles).toBe(1);
  });
});

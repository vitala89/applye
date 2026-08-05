import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LanguageEntry } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ProfileLanguagesComponent } from './profile-languages.component';

/**
 * The section owns no state - the page holds the entries and folds them back
 * into `form().languages` - so every test drives the input and asserts on what
 * came out, which is the whole contract.
 */
function createFixture(
  entries: LanguageEntry[],
  open = true,
): { fixture: ComponentFixture<ProfileLanguagesComponent>; emitted: LanguageEntry[][] } {
  TestBed.configureTestingModule({
    imports: [ProfileLanguagesComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileLanguagesComponent);
  fixture.componentRef.setInput('entries', entries);
  fixture.componentRef.setInput('open', open);
  const emitted: LanguageEntry[][] = [];
  fixture.componentInstance.changed.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { fixture, emitted };
}

function entry(language: string, level = ''): LanguageEntry {
  return { language, level };
}

describe('ProfileLanguagesComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** The page owns the array. An in-place edit would change it behind the
   * page's back, so `syncLanguages` would serialize a value it never saw set. */
  it('never mutates the array or the entries it was given', () => {
    const input = [entry('English', 'C1')];
    const { fixture } = createFixture(input);
    const c = fixture.componentInstance;
    c['add']();
    c['updateField'](0, 'level', 'B2');
    c['remove'](0);
    expect(input).toEqual([entry('English', 'C1')]);
  });

  it('adds a blank language on the dashed button', () => {
    const { fixture, emitted } = createFixture([entry('English', 'C1')]);
    (fixture.nativeElement.querySelector('.btn-dashed') as HTMLElement).click();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toHaveLength(2);
    expect(emitted[0][0]).toEqual(entry('English', 'C1'));
  });

  it('removes the language at the clicked index', () => {
    const { fixture, emitted } = createFixture([entry('one'), entry('two'), entry('three')]);
    const buttons = fixture.nativeElement.querySelectorAll('.btn-ghost') as NodeListOf<HTMLElement>;
    buttons[1].click();
    expect(emitted[0].map((l) => l.language)).toEqual(['one', 'three']);
  });

  /** Two entries, and the field written is not the one left alone: a mutation
   * that writes every entry, or every field, has to be distinguishable. */
  it('patches only the named field of only the edited language', () => {
    const { fixture, emitted } = createFixture([entry('English', 'C1'), entry('German', 'A2')]);
    fixture.componentInstance['updateField'](1, 'level', 'B1');
    expect(emitted[0]).toEqual([entry('English', 'C1'), entry('German', 'B1')]);
  });

  it('offers the CEFR levels plus a blank, and renders a row per language', () => {
    const { fixture } = createFixture([entry('English', 'C1'), entry('German')]);
    const options = [...fixture.nativeElement.querySelectorAll('select option')].map(
      (o: HTMLOptionElement) => o.value,
    );
    expect(options.slice(0, 8)).toEqual(['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native']);
    expect(fixture.nativeElement.querySelectorAll('.lang-row')).toHaveLength(2);
  });

  it('renders nothing but the head while collapsed, and asks the page to toggle', () => {
    const { fixture } = createFixture([entry('English')], false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => (toggles += 1));
    expect(fixture.nativeElement.querySelector('.collapse-card__body')).toBeNull();
    (fixture.nativeElement.querySelector('.collapse-card__head') as HTMLElement).click();
    expect(toggles).toBe(1);
  });
});

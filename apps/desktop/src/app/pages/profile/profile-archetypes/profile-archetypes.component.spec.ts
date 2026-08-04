import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Archetype } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { ProfileArchetypesComponent } from './profile-archetypes.component';

/**
 * The section owns no state - the page seeds the roles, computes `dirty` from
 * them and writes them back - so every test here drives the input and asserts
 * on what came out, which is the whole contract.
 */
function createFixture(
  archetypes: Archetype[],
  open = true,
): { fixture: ComponentFixture<ProfileArchetypesComponent>; emitted: Archetype[][] } {
  TestBed.configureTestingModule({
    imports: [ProfileArchetypesComponent],
    providers: [TranslateService],
  });
  const fixture = TestBed.createComponent(ProfileArchetypesComponent);
  fixture.componentRef.setInput('archetypes', archetypes);
  fixture.componentRef.setInput('open', open);
  const emitted: Archetype[][] = [];
  fixture.componentInstance.changed.subscribe((next) => emitted.push(next));
  fixture.detectChanges();
  return { fixture, emitted };
}

function role(name: string, over: Partial<Archetype> = {}): Archetype {
  return { name, fit: 'primary', sellWhen: '', ...over };
}

function click(fixture: ComponentFixture<ProfileArchetypesComponent>, selector: string): void {
  (fixture.nativeElement.querySelector(selector) as HTMLElement).click();
  fixture.detectChanges();
}

describe('ProfileArchetypesComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** The page owns the array; an in-place edit would change it behind the
   * page's back and leave `archetypesDirty` comparing a value against itself. */
  it('never mutates the array it was given', () => {
    const input = [role('Angular Engineer')];
    const { fixture } = createFixture(input);
    click(fixture, '.btn-dashed');
    fixture.componentInstance['update'](0, { name: 'changed' });
    fixture.componentInstance['remove'](0);
    expect(input).toEqual([role('Angular Engineer')]);
  });

  it('adds a blank role on the dashed button', () => {
    const { fixture, emitted } = createFixture([role('Angular Engineer')]);
    click(fixture, '.btn-dashed');
    expect(emitted).toEqual([[role('Angular Engineer'), role('')]]);
  });

  /** Five is the cap: beyond it the list stops describing a focus. The button
   * is hidden at five, so this drives the guard rather than the markup. */
  it('refuses to add a sixth role', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((n) => role(n));
    const { fixture, emitted } = createFixture(five);
    expect(fixture.nativeElement.querySelector('.btn-dashed')).toBeNull();
    fixture.componentInstance['add']();
    expect(emitted).toHaveLength(0);
  });

  it('removes the role at the clicked index', () => {
    const { fixture, emitted } = createFixture([role('one'), role('two'), role('three')]);
    const buttons = fixture.nativeElement.querySelectorAll('.btn-ghost') as NodeListOf<HTMLElement>;
    buttons[1].click();
    expect(emitted).toEqual([[role('one'), role('three')]]);
  });

  it('patches only the named field of only the edited role', () => {
    const { fixture, emitted } = createFixture([role('one'), role('two', { sellWhen: 'keep me' })]);
    fixture.componentInstance['update'](1, { fit: 'adjacent' });
    expect(emitted).toEqual([[role('one'), role('two', { fit: 'adjacent', sellWhen: 'keep me' })]]);
  });

  it('warns about a role whose words are all generic', () => {
    const { fixture } = createFixture([role('Senior Engineer')]);
    expect(fixture.nativeElement.querySelectorAll('.archetype-card__warn')).toHaveLength(1);
  });

  it('stays silent for a distinctive word, and for a name not yet typed', () => {
    const { fixture } = createFixture([role('UI Engineer'), role('  ')]);
    expect(fixture.nativeElement.querySelectorAll('.archetype-card__warn')).toHaveLength(0);
  });

  it('renders nothing but the head while collapsed, and asks the page to toggle', () => {
    const { fixture } = createFixture([role('one')], false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => (toggles += 1));
    expect(fixture.nativeElement.querySelector('.collapse-card__body')).toBeNull();
    click(fixture, '.collapse-card__head');
    expect(toggles).toBe(1);
  });
});
